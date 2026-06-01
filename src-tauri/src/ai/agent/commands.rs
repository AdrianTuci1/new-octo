use std::sync::{atomic::AtomicBool, Arc};

use chrono::Utc;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::{
    cli_harness::CliDelegateHarness,
    harness::{AgentCancellation, AgentEventSink, AgentHarness, AgentHarnessContext},
    providers::{OpenAiCompatibleConfig, OpenAiCompatibleHarness, OpenAiCompatibleProvider},
    scripted::ScriptedHarness,
    sources,
    types::{
        AgentExecutionState, AgentModelSourceConnectRequest, AgentModelSourceStatus,
        AgentProviderConfigRequest, AgentProviderStatus, AgentRunLookupRequest, AgentRunRequest,
        AgentRunSnapshot, AgentRunStatus, AgentRunStatusEvent, AgentStartResponse,
    },
};
use crate::ai::agent_management::{
    clear_persisted_provider_config, persist_provider_config, AgentHarnessManager,
};

const DEFAULT_MODEL_ID: &str = "octomus-scripted-harness";
const EVENT_STATUS: &str = "agent:status";

pub(crate) fn resolve_model_id(
    requested_model_id: Option<String>,
    provider_config: Option<&OpenAiCompatibleConfig>,
) -> String {
    let requested_model_id = requested_model_id
        .filter(|id| !id.trim().is_empty())
        .map(|id| id.trim().to_string());

    if let Some(model_id) = requested_model_id {
        if model_id.starts_with("model_") {
            if let Some(provider_model_id) = provider_config
                .map(|config| config.model_id.trim())
                .filter(|id| !id.is_empty())
            {
                return provider_model_id.to_string();
            }
        }

        return model_id;
    }

    provider_config
        .map(|config| config.model_id.trim())
        .filter(|id| !id.is_empty())
        .map(|id| id.to_string())
        .unwrap_or_else(|| DEFAULT_MODEL_ID.to_string())
}

pub fn agent_list_model_sources() -> Result<Vec<AgentModelSourceStatus>, String> {
    Ok(sources::list_model_sources())
}

pub fn agent_connect_model_source(
    request: AgentModelSourceConnectRequest,
) -> Result<AgentModelSourceStatus, String> {
    sources::connect_model_source(request)
}

pub async fn agent_start(
    app: AppHandle,
    window: tauri::Window,
    manager: State<'_, AgentHarnessManager>,
    request: AgentRunRequest,
) -> Result<AgentStartResponse, String> {
    println!("[AI] agent_start called for prompt: {}", request.prompt);
    let prompt = request.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("agent prompt cannot be empty".to_string());
    }

    let run_id = format!("run_{}", Uuid::new_v4());
    let run_id = request
        .run_id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or(run_id);
    let conversation_id = request
        .conversation_id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| format!("conv_{}", Uuid::new_v4()));
    let assistant_message_id = request
        .assistant_message_id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| format!("assistant_{}", Uuid::new_v4()));
    let provider_config = manager
        .load_provider_config_from_disk()?
        .filter(|config| !config.api_key.trim().is_empty())
        .or_else(|| {
            manager
                .provider_config()
                .ok()
                .flatten()
                .filter(|config| !config.api_key.trim().is_empty())
        })
        .or_else(OpenAiCompatibleConfig::from_env);
    let model_id = resolve_model_id(request.model_id, provider_config.as_ref());
    let external_source = sources::parse_source_model(&model_id);
    let external_session_id = external_source.as_ref().and_then(|(kind, _)| {
        manager
            .get_external_session(&conversation_id, kind.as_str())
            .ok()
            .flatten()
    });

    let cwd = request.cwd.or_else(|| {
        std::env::var("HOME").ok().or_else(|| {
            std::env::current_dir()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        })
    });

    let context = AgentHarnessContext {
        run_id: run_id.clone(),
        conversation_id: conversation_id.clone(),
        assistant_message_id: assistant_message_id.clone(),
        prompt: prompt.clone(),
        surface: request.surface,
        messages: request.messages,
        terminal_blocks: request.terminal_blocks,
        cwd,
        target_os: std::env::consts::OS.to_string(),
        target_arch: std::env::consts::ARCH.to_string(),
        model_id: model_id.clone(),
        terminal_model_id: request.terminal_model_id,
        resume_execution_state: None,
    };

    let cancel_flag = Arc::new(AtomicBool::new(false));
    manager.insert(
        AgentRunSnapshot {
            run_id: run_id.clone(),
            conversation_id: conversation_id.clone(),
            assistant_message_id: assistant_message_id.clone(),
            prompt,
            status: AgentRunStatus::Queued,
            status_message: Some("Queued.".to_string()),
            model_id,
            cwd: context.cwd.clone(),
            error: None,
            execution_state: AgentExecutionState::new("preparing"),
            started_at: Utc::now(),
            finished_at: None,
        },
        cancel_flag.clone(),
    )?;

    let manager_handle = manager.inner().clone();
    let sink = AgentEventSink::new(app, window, manager_handle, &context);

    tauri::async_runtime::spawn(async move {
        let cancellation = AgentCancellation::new(cancel_flag);

        println!("[AI] Starting harness run in background task");
        if let Some((kind, external_model_id)) = external_source {
            let harness = CliDelegateHarness::new(kind, external_model_id, external_session_id);
            run_harness(harness, context, sink, cancellation).await;
        } else if let Some(config) = provider_config {
            println!(
                "[AI] Using OpenAI-compatible harness with provider: {}",
                config.source
            );
            let harness = OpenAiCompatibleHarness::new(config);
            run_harness(harness, context, sink, cancellation).await;
        } else {
            println!("[AI] No provider config found, falling back to ScriptedHarness");
            let harness = ScriptedHarness;
            run_harness(harness, context, sink, cancellation).await;
        }
    });

    println!(
        "[AI] agent_start called. Run: {}, Conv: {}, Msg: {}",
        run_id, conversation_id, assistant_message_id
    );

    Ok(AgentStartResponse {
        run_id,
        conversation_id,
        assistant_message_id,
        status: AgentRunStatus::Queued,
    })
}

pub fn agent_configure_openai_compatible(
    manager: State<'_, AgentHarnessManager>,
    request: AgentProviderConfigRequest,
) -> Result<AgentProviderStatus, String> {
    let existing = manager
        .load_provider_config_from_disk()?
        .or_else(|| manager.provider_config().ok().flatten());
    let api_key = if request.api_key.trim().is_empty() {
        existing
            .as_ref()
            .filter(|config| !config.api_key.trim().is_empty())
            .map(|config| config.api_key.clone())
            .ok_or_else(|| "API key cannot be empty".to_string())?
    } else {
        request.api_key
    };

    let mut config = OpenAiCompatibleConfig::new(
        OpenAiCompatibleProvider::parse(request.provider_id.as_deref()),
        api_key,
        request.base_url,
        request.model_id,
        "runtime".to_string(),
    );
    if let Some(existing) = existing {
        config = config.with_secret_id(Some(existing.secret_id));
    }

    let status = provider_status_from_config(&config);
    manager.set_provider_config(config)?;
    if let Some(current) = manager.provider_config()? {
        let _ = persist_provider_config(&current);
    }

    Ok(status)
}

pub fn agent_provider_status(
    manager: State<'_, AgentHarnessManager>,
) -> Result<AgentProviderStatus, String> {
    if let Some(config) = manager
        .load_provider_config_from_disk()?
        .or_else(|| manager.provider_config().ok().flatten())
        .or_else(OpenAiCompatibleConfig::from_env)
    {
        return Ok(provider_status_from_config(&config));
    }

    Ok(AgentProviderStatus {
        provider: "scripted-local".to_string(),
        provider_id: "custom".to_string(),
        base_url: "local".to_string(),
        model_id: DEFAULT_MODEL_ID.to_string(),
        has_api_key: false,
        source: "fallback".to_string(),
    })
}

pub fn agent_clear_openai_compatible(
    manager: State<'_, AgentHarnessManager>,
) -> Result<(), String> {
    clear_persisted_provider_config()?;
    manager.clear_provider_config()?;
    Ok(())
}

pub fn agent_cancel(
    app: AppHandle,
    manager: State<'_, AgentHarnessManager>,
    request: AgentRunLookupRequest,
) -> Result<AgentRunSnapshot, String> {
    let snapshot = manager.cancel(&request.run_id)?;
    let _ = app.emit(
        EVENT_STATUS,
        AgentRunStatusEvent {
            run_id: snapshot.run_id.clone(),
            conversation_id: snapshot.conversation_id.clone(),
            assistant_message_id: snapshot.assistant_message_id.clone(),
            status: snapshot.status,
            message: snapshot.status_message.clone(),
        },
    );

    Ok(snapshot)
}

pub fn agent_get_run(
    manager: State<'_, AgentHarnessManager>,
    request: AgentRunLookupRequest,
) -> Result<AgentRunSnapshot, String> {
    manager.get(&request.run_id)
}

pub fn agent_list_runs(
    manager: State<'_, AgentHarnessManager>,
) -> Result<Vec<AgentRunSnapshot>, String> {
    manager.list()
}

pub(super) async fn run_harness<H: AgentHarness>(
    harness: H,
    context: AgentHarnessContext,
    sink: AgentEventSink,
    cancellation: AgentCancellation,
) {
    if let Err(error) = harness.validate() {
        println!("[AI] Harness validation failed: {}", error.message);
        sink.error(error.message);
        return;
    }

    match harness.run_async(context, sink.clone(), cancellation).await {
        Ok(outcome) => {
            match outcome.status {
                AgentRunStatus::WaitingForTool => {
                    println!("[AI] Harness run paused while waiting for tool resolution");
                }
                AgentRunStatus::Completed => {
                    println!("[AI] Harness run completed successfully");
                }
                AgentRunStatus::Cancelled => {
                    println!("[AI] Harness run was cancelled");
                }
                other => {
                    println!("[AI] Harness run finished with status: {:?}", other);
                }
            }
            sink.done(outcome.status, outcome.usage);
        }
        Err(error) => {
            println!("[AI] Harness run failed: {}", error.message);
            sink.error(error.message);
        }
    }
}

fn provider_status_from_config(config: &OpenAiCompatibleConfig) -> AgentProviderStatus {
    let (provider, provider_id, base_url, model_id, has_api_key, source) = config.redacted_status();

    AgentProviderStatus {
        provider,
        provider_id,
        base_url,
        model_id,
        has_api_key,
        source,
    }
}
