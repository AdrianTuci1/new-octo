mod fallback;
mod formatting;
mod lsp;
mod service;
#[cfg(test)]
mod tests;
mod types;

pub use types::{
    WorkspaceExplorationArtifact, WorkspaceExplorationDirectory, WorkspaceExplorationEntry,
    WorkspaceExplorationFile, WorkspaceExplorationRequest, WorkspaceExplorationResponse,
    WorkspaceExplorationSearch, WorkspaceExplorationSegment,
};

#[tauri::command]
pub async fn workspace_explore(
    request: WorkspaceExplorationRequest,
) -> Result<WorkspaceExplorationResponse, String> {
    service::run_workspace_exploration(request).await
}
