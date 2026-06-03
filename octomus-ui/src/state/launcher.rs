use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

pub type HistoryTab = String;
pub type CommandApproval = serde_json::Value;
pub type HistoryEntry = serde_json::Value;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LauncherState {
    pub composer_surface: String,
    pub mode_lock: Option<String>,
    pub autodetected_shell_latch: bool,
    pub allow_single_character_command_prediction: bool,
    pub terminal_auto_detect_enabled: bool,
    pub history_tab: String,
    pub selected_history_index: usize,
    pub selected_command_index: usize,
    pub model_tab: String,
    pub selected_model_index: usize,
    pub local_conversation_id: Option<String>,
    pub conversation_search_query: String,
    pub saved_prompt_entries: Vec<HistoryEntry>,
    pub local_pending_approval: Option<CommandApproval>,
    pub auto_approve_agent_loop: bool,
}

impl LauncherState {
    pub fn new(initial_composer_surface: &str) -> Self {
        Self {
            composer_surface: initial_composer_surface.to_string(),
            history_tab: "all".to_string(),
            model_tab: "all".to_string(),
            terminal_auto_detect_enabled: true,
            ..Default::default()
        }
    }

    pub fn reset(&mut self, next_composer_surface: &str) {
        *self = Self::new(next_composer_surface);
    }
}

#[derive(Debug, Clone)]
pub struct LauncherStore {
    state: Arc<Mutex<LauncherState>>,
}

impl LauncherStore {
    pub fn new(initial_composer_surface: &str) -> Self {
        Self {
            state: Arc::new(Mutex::new(LauncherState::new(initial_composer_surface))),
        }
    }

    pub fn with_state<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut LauncherState) -> R,
    {
        let mut guard = self.state.lock().unwrap();
        f(&mut guard)
    }

    pub fn get_state(&self) -> LauncherState {
        self.state.lock().unwrap().clone()
    }
}

impl Default for LauncherStore {
    fn default() -> Self {
        Self::new("terminal")
    }
}
