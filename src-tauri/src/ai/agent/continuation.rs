use std::sync::{atomic::AtomicBool, Arc};

use chrono::Utc;
use tauri::{AppHandle, State};
use uuid::Uuid;

use super::{
    cli_harness::CliDelegateHarness,
    harness::{AgentCancellation, AgentEventSink, AgentHarnessContext},
    providers::{OpenAiCompatibleConfig, OpenAiCompatibleHarness},
    sources,
    scripted::ScriptedHarness,
    types::{
        AgentContinueRequest, AgentExecutionState, AgentRunSnapshot, AgentRunStatus,
        AgentStartResponse,
    },
};
use crate::ai::agent_management::AgentHarnessManager;

pub async fn agent_continue(
    app: AppHandle,
    window: tauri::Window,
    manager: State<'_, AgentHarnessManager>,
    request: AgentContinueRequest,
) -> Result<AgentStartResponse, String> {
    let conversation_id = request.conversation_id.trim().to_string();
    if conversation_id.is_empty() {
        return Err("conversationId cannot be empty".to_string());
    }

    let run_id = request
        .run_id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| format!("run_{}", Uuid::new_v4()));
    let assistant_message_id = request
        .assistant_message_id
        .filter(|id| !id.trim().is_empty())
        .unwrap_or_else(|| format!("assistant_{}", Uuid::new_v4()));
    let previous_snapshot = manager.get(&run_id).ok();

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

    let model_id = super::commands::resolve_model_id(request.model_id, provider_config.as_ref());
    let external_source = sources::parse_source_model(&model_id);
    let external_session_id = external_source
        .as_ref()
        .and_then(|(kind, _)| manager.get_external_session(&conversation_id, kind.as_str()).ok().flatten());

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
        prompt: String::new(),
        surface: request.surface,
        messages: request.messages,
        terminal_blocks: request.terminal_blocks,
        cwd,
        target_os: std::env::consts::OS.to_string(),
        target_arch: std::env::consts::ARCH.to_string(),
        model_id: model_id.clone(),
        terminal_model_id: request.terminal_model_id,
        resume_execution_state: previous_snapshot
            .as_ref()
            .map(|snapshot| snapshot.execution_state.clone()),
    };

    let cancel_flag = Arc::new(AtomicBool::new(false));
    manager.insert(
        AgentRunSnapshot {
            run_id: run_id.clone(),
            conversation_id: conversation_id.clone(),
            assistant_message_id: assistant_message_id.clone(),
            prompt: "continue".to_string(),
            status: AgentRunStatus::Queued,
            status_message: Some("Queued continuation.".to_string()),
            model_id,
            cwd: context.cwd.clone(),
            error: None,
            execution_state: previous_snapshot
                .as_ref()
                .map(|snapshot| snapshot.execution_state.clone())
                .unwrap_or_else(|| AgentExecutionState::new("preparing")),
            started_at: Utc::now(),
            finished_at: None,
        },
        cancel_flag.clone(),
    )?;

    let manager_handle = manager.inner().clone();
    let sink = AgentEventSink::new(app, window, manager_handle, &context);

    tauri::async_runtime::spawn(async move {
        let cancellation = AgentCancellation::new(cancel_flag);

        if let Some((kind, external_model_id)) = external_source {
            let harness = CliDelegateHarness::new(kind, external_model_id, external_session_id);
            super::commands::run_harness(harness, context, sink, cancellation).await;
        } else if let Some(config) = provider_config {
            let harness = OpenAiCompatibleHarness::new(config);
            super::commands::run_harness(harness, context, sink, cancellation).await;
        } else {
            let harness = ScriptedHarness;
            super::commands::run_harness(harness, context, sink, cancellation).await;
        }
    });

    Ok(AgentStartResponse {
        run_id,
        conversation_id,
        assistant_message_id,
        status: AgentRunStatus::Queued,
    })
}
