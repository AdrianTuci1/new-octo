pub mod agent;
pub mod agent_management;
pub mod artifacts;
pub mod diff;
pub mod mcp;
pub mod predict;
pub mod web_search;

use tauri::{AppHandle, State};

use agent::types::{
    AgentContinueRequest, AgentProviderConfigRequest, AgentProviderStatus, AgentRunLookupRequest,
    AgentRunRequest, AgentRunSnapshot, AgentStartResponse,
};
use agent::loop_contract::AgentLoopContract;
pub use agent_management::AgentHarnessManager;

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
pub async fn agent_continue(
    app: AppHandle,
    window: tauri::Window,
    manager: State<'_, AgentHarnessManager>,
    request: AgentContinueRequest,
) -> Result<AgentStartResponse, String> {
    agent::agent_continue(app, window, manager, request).await
}

#[tauri::command]
pub fn agent_configure_openai_compatible(
    manager: State<'_, AgentHarnessManager>,
    request: AgentProviderConfigRequest,
) -> Result<AgentProviderStatus, String> {
    agent::agent_configure_openai_compatible(manager, request)
}

#[tauri::command]
pub fn agent_clear_openai_compatible(
    manager: State<'_, AgentHarnessManager>,
) -> Result<(), String> {
    agent::agent_clear_openai_compatible(manager)
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

#[tauri::command]
pub fn agent_get_loop_contract() -> Result<AgentLoopContract, String> {
    agent::agent_get_loop_contract()
}

#[tauri::command]
pub async fn web_search(
    request: web_search::WebSearchRequest,
) -> Result<web_search::WebSearchResponse, String> {
    web_search::web_search(request).await
}

#[tauri::command]
pub async fn ai_predict_command_smart(
    manager: State<'_, AgentHarnessManager>,
    input: String,
    last_command: Option<String>,
) -> Result<Option<predict::CommandPrediction>, String> {
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
        .or_else(agent::openai::OpenAiCompatibleConfig::from_env)
        .ok_or_else(|| {
            "No AI provider configured. Please configure OpenAI/OpenRouter in settings.".to_string()
        })?;

    Ok(predict::predict_command_with_ai(
        &input,
        last_command.as_deref(),
        Vec::new(),
        String::new(),
        Vec::new(),
        &provider_config.api_key,
        &provider_config.base_url,
        &provider_config.model_id,
    )
    .await)
}
