mod harness;
mod manager;
mod openai;
mod scripted;
mod types;

use std::{
    sync::{atomic::AtomicBool, Arc},
};

use chrono::Utc;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use harness::{AgentCancellation, AgentEventSink, AgentHarness, AgentHarnessContext};
pub use manager::AgentHarnessManager;
use manager::persist_provider_config;
use openai::{OpenAiCompatibleConfig, OpenAiCompatibleHarness};
use scripted::ScriptedHarness;
pub use types::{
    AgentProviderConfigRequest, AgentProviderStatus, AgentRunLookupRequest, AgentRunRequest,
    AgentRunSnapshot, AgentRunStatus, AgentRunStatusEvent, AgentStartResponse,
};

const DEFAULT_MODEL_ID: &str = "octomus-scripted-harness";
const EVENT_STATUS: &str = "agent:status";

#[tauri::command]
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
        .or_else(|| manager.provider_config().ok().flatten())
        .or_else(OpenAiCompatibleConfig::from_env);
    let model_id = request
        .model_id
        .filter(|id| !id.trim().is_empty())
        .or_else(|| {
            provider_config
                .as_ref()
                .map(|config| config.model_id.clone())
        })
        .unwrap_or_else(|| DEFAULT_MODEL_ID.to_string());

    let cwd = request.cwd.or_else(|| {
        std::env::var("HOME")
            .ok()
            .or_else(|| std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string()))
    });

    let context = AgentHarnessContext {
        run_id: run_id.clone(),
        conversation_id: conversation_id.clone(),
        assistant_message_id: assistant_message_id.clone(),
        prompt: prompt.clone(),
        cwd,
        model_id: model_id.clone(),
        messages: request.messages,
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
        if let Some(config) = provider_config {
            println!("[AI] Using OpenAI-compatible harness with provider: {}", config.source);
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

#[tauri::command]
pub fn agent_configure_openai_compatible(
    manager: State<'_, AgentHarnessManager>,
    request: AgentProviderConfigRequest,
) -> Result<AgentProviderStatus, String> {
    if request.api_key.trim().is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    let config = OpenAiCompatibleConfig::new(
        request.api_key,
        request.base_url,
        request.model_id,
        "runtime".to_string(),
    );
    let status = provider_status_from_config(&config);
    manager.set_provider_config(config)?;
    if let Some(current) = manager.provider_config()? {
        let _ = persist_provider_config(&current);
    }

    Ok(status)
}

#[tauri::command]
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
        base_url: "local".to_string(),
        model_id: DEFAULT_MODEL_ID.to_string(),
        has_api_key: false,
        source: "fallback".to_string(),
    })
}

#[tauri::command]
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

#[tauri::command]
pub fn agent_get_run(
    manager: State<'_, AgentHarnessManager>,
    request: AgentRunLookupRequest,
) -> Result<AgentRunSnapshot, String> {
    manager.get(&request.run_id)
}

#[tauri::command]
pub fn agent_list_runs(
    manager: State<'_, AgentHarnessManager>,
) -> Result<Vec<AgentRunSnapshot>, String> {
    manager.list()
}

async fn run_harness<H: AgentHarness>(
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
            println!("[AI] Harness run completed successfully");
            sink.done(outcome.status, outcome.usage);
        }
        Err(error) => {
            println!("[AI] Harness run failed: {}", error.message);
            sink.error(error.message);
        }
    }
}

fn provider_status_from_config(config: &OpenAiCompatibleConfig) -> AgentProviderStatus {
    let (provider, base_url, model_id, has_api_key, source) = config.redacted_status();

    AgentProviderStatus {
        provider,
        base_url,
        model_id,
        has_api_key,
        source,
    }
}
