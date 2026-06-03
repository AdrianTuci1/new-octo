use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkingDirectory {
    pub current_path: Option<String>,
    pub browser_path: Option<String>,
    pub listing: Option<Vec<String>>,
    pub search_query: String,
    pub button_label: Option<String>,
    pub is_picker_open: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GitContext {
    pub git_context: Option<serde_json::Value>,
    pub current_branch: Option<String>,
    pub is_branch_menu_open: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RuntimeState {
    pub working_directory: WorkingDirectory,
    pub git_context: GitContext,
    pub terminal_cwd: Option<String>,
    pub active_surface_working_directory: Option<String>,
    pub runtime_context: Option<serde_json::Value>,
}

impl RuntimeState {
    pub fn new() -> Self { Self::default() }

    pub fn set_working_directory(&mut self, wd: WorkingDirectory) { self.working_directory = wd; }
    pub fn set_git_context(&mut self, ctx: GitContext) { self.git_context = ctx; }
    pub fn set_terminal_cwd(&mut self, cwd: Option<String>) { self.terminal_cwd = cwd; }
    pub fn set_active_surface_working_directory(&mut self, path: Option<String>) { self.active_surface_working_directory = path; }
    pub fn set_runtime_context(&mut self, ctx: Option<serde_json::Value>) { self.runtime_context = ctx; }
}

#[derive(Debug, Clone)]
pub struct RuntimeStore {
    state: Arc<Mutex<RuntimeState>>,
}

impl RuntimeStore {
    pub fn new() -> Self { Self { state: Arc::new(Mutex::new(RuntimeState::new())) } }
    pub fn with_state<F, R>(&self, f: F) -> R where F: FnOnce(&mut RuntimeState) -> R { let mut guard = self.state.lock().unwrap(); f(&mut guard) }
    pub fn get_state(&self) -> RuntimeState { self.state.lock().unwrap().clone() }
}

impl Default for RuntimeStore { fn default() -> Self { Self::new() } }
