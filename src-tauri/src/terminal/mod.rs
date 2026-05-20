mod ansi;
mod block;
mod completions;
mod events;
mod pty;
mod requests;
mod session;
mod transport;

pub mod fs;
pub mod git;
pub mod intelligence;
pub mod manager;

use tauri::{AppHandle, State};

// Re-export core types
pub use block::TerminalBlock;
pub use completions::{CompletionTracker, ShellCompletion, ShellCompletionFormat, ShellData};
pub use fs::{
    home_dir, FilesystemDirectoryListing, FilesystemEntry, FilesystemPathContext,
    FilesystemSearchEntry, FilesystemSearchListing, ListDirectoryEntriesRequest,
    SearchDirectoryEntriesRequest,
};
pub use git::GitRepoContext;
pub use intelligence::{
    sort_history_entries_by_recency, ShellHistoryEntry, TerminalRuntimeContext,
};
pub use manager::TerminalManager;

#[tauri::command]
pub fn terminal_create_session(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    request: requests::CreateTerminalSessionRequest,
) -> Result<session::TerminalSessionInfo, String> {
    manager::terminal_create_session(app, manager, request)
}

#[tauri::command]
pub fn terminal_release_session(
    manager: State<'_, TerminalManager>,
    request: requests::TerminalSessionRequest,
) -> Result<(), String> {
    manager::terminal_release_session(manager, request)
}

#[tauri::command]
pub fn terminal_write(
    manager: State<'_, TerminalManager>,
    request: requests::WriteTerminalSessionRequest,
) -> Result<(), String> {
    manager::terminal_write(manager, request)
}

#[tauri::command]
pub fn terminal_run_command(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    request: requests::RunTerminalCommandRequest,
) -> Result<requests::TerminalRunCommandResponse, String> {
    manager::terminal_run_command(app, manager, request)
}

#[tauri::command]
pub fn terminal_resize(
    manager: State<'_, TerminalManager>,
    request: requests::ResizeTerminalSessionRequest,
) -> Result<(), String> {
    manager::terminal_resize(manager, request)
}

#[tauri::command]
pub fn terminal_kill_session(
    manager: State<'_, TerminalManager>,
    request: requests::TerminalSessionRequest,
) -> Result<(), String> {
    manager::terminal_kill_session(manager, request)
}

#[tauri::command]
pub fn terminal_get_blocks(
    manager: State<'_, TerminalManager>,
    request: requests::TerminalSessionRequest,
) -> Result<Vec<TerminalBlock>, String> {
    manager::terminal_get_blocks(manager, request)
}

#[tauri::command]
pub fn terminal_list_commands() -> Result<Vec<String>, String> {
    fs::terminal_list_commands()
}

#[tauri::command]
pub fn terminal_get_path_context() -> Result<fs::FilesystemPathContext, String> {
    fs::terminal_get_path_context()
}

#[tauri::command]
pub fn terminal_get_runtime_context(
    request: fs::PathRequest,
) -> Result<intelligence::TerminalRuntimeContext, String> {
    intelligence::terminal_get_runtime_context(request)
}

#[tauri::command]
pub fn terminal_list_directory_entries(
    request: fs::ListDirectoryEntriesRequest,
) -> Result<fs::FilesystemDirectoryListing, String> {
    fs::terminal_list_directory_entries(request)
}

#[tauri::command]
pub fn terminal_search_directory_entries(
    request: fs::SearchDirectoryEntriesRequest,
) -> Result<fs::FilesystemSearchListing, String> {
    fs::terminal_search_directory_entries(request)
}

#[tauri::command]
pub fn terminal_get_git_context(
    request: fs::PathRequest,
) -> Result<Option<git::GitRepoContext>, String> {
    git::terminal_get_git_context(request)
}

#[tauri::command]
pub fn terminal_get_worktree_diff(
    request: git::GitWorktreeDiffRequest,
) -> Result<git::GitWorktreeDiff, String> {
    git::terminal_get_worktree_diff(request)
}

#[tauri::command]
pub fn terminal_switch_git_branch(
    request: git::GitBranchSwitchRequest,
) -> Result<Option<git::GitRepoContext>, String> {
    git::terminal_switch_git_branch(request)
}

#[tauri::command]
pub fn terminal_get_recent_history() -> Result<Vec<intelligence::ShellHistoryEntry>, String> {
    intelligence::terminal_get_recent_history()
}

#[tauri::command]
pub async fn terminal_get_prediction(
    terminal_manager: State<'_, TerminalManager>,
    memory_manager: State<'_, crate::memory::OctomusMemoryManager>,
    request: intelligence::TerminalPredictionRequest,
) -> Result<Option<crate::ai::predict::CommandPrediction>, String> {
    intelligence::terminal_get_prediction(terminal_manager, memory_manager, request).await
}

#[tauri::command]
pub async fn terminal_get_composer_intelligence(
    ai_manager: State<'_, crate::ai::AgentHarnessManager>,
    composer_manager: State<'_, crate::ai::predict::composer::ComposerIntelligenceManager>,
    request: crate::ai::predict::composer::ComposerIntelligenceRequest,
) -> Result<crate::ai::predict::composer::ComposerIntelligenceResponse, String> {
    intelligence::terminal_get_composer_intelligence(ai_manager, composer_manager, request).await
}

#[tauri::command]
pub fn terminal_read_file(request: fs::PathRequest) -> Result<String, String> {
    fs::terminal_read_file(request)
}

#[tauri::command]
pub fn terminal_write_file(request: fs::WriteFileRequest) -> Result<(), String> {
    fs::terminal_write_file(request)
}
