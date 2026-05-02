pub mod agent;
pub mod agent_management;
pub mod artifacts;
pub mod mcp;
pub mod predict;

use tauri::{AppHandle, State};

pub use agent_management::AgentHarnessManager;
use agent::types::{
    AgentProviderConfigRequest, AgentProviderStatus, AgentRunLookupRequest, AgentRunRequest,
    AgentRunSnapshot, AgentStartResponse,
};

#[tauri::command]
pub async fn agent_start(
    app: AppHandle,
    window: tauri::Window,
    manager: State<'_, AgentHarnessManager>,
    request: AgentRunRequest,
) -> Result<AgentStartResponse, String> {
    agent::agent_start(app, window, manager, request).await
}

#[tauri::command]
pub fn agent_configure_openai_compatible(
    manager: State<'_, AgentHarnessManager>,
    request: AgentProviderConfigRequest,
) -> Result<AgentProviderStatus, String> {
    agent::agent_configure_openai_compatible(manager, request)
}

#[tauri::command]
pub fn agent_provider_status(
    manager: State<'_, AgentHarnessManager>,
) -> Result<AgentProviderStatus, String> {
    agent::agent_provider_status(manager)
}

#[tauri::command]
pub fn agent_cancel(
    app: AppHandle,
    manager: State<'_, AgentHarnessManager>,
    request: AgentRunLookupRequest,
) -> Result<AgentRunSnapshot, String> {
    agent::agent_cancel(app, manager, request)
}

#[tauri::command]
pub fn agent_get_run(
    manager: State<'_, AgentHarnessManager>,
    request: AgentRunLookupRequest,
) -> Result<AgentRunSnapshot, String> {
    agent::agent_get_run(manager, request)
}

#[tauri::command]
pub fn agent_list_runs(
    manager: State<'_, AgentHarnessManager>,
) -> Result<Vec<AgentRunSnapshot>, String> {
    agent::agent_list_runs(manager)
}
