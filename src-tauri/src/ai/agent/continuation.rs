use std::sync::{atomic::AtomicBool, Arc};

use chrono::Utc;
use tauri::{AppHandle, State};
use uuid::Uuid;

use super::{
    harness::{AgentCancellation, AgentEventSink, AgentHarnessContext},
    openai::{OpenAiCompatibleConfig, OpenAiCompatibleHarness},
    scripted::ScriptedHarness,
    types::{AgentContinueRequest, AgentRunSnapshot, AgentRunStatus, AgentStartResponse},
};
use crate::ai::agent_management::AgentHarnessManager;

const DEFAULT_MODEL_ID: &str = "octomus-scripted-harness";

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
        cwd,
        model_id: model_id.clone(),
        terminal_model_id: request.terminal_model_id,
        messages: request.messages,
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
            started_at: Utc::now(),
            finished_at: None,
        },
        cancel_flag.clone(),
    )?;

    let manager_handle = manager.inner().clone();
    let sink = AgentEventSink::new(app, window, manager_handle, &context);

    tauri::async_runtime::spawn(async move {
        let cancellation = AgentCancellation::new(cancel_flag);

        if let Some(config) = provider_config {
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
