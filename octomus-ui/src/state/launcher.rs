use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use super::types::{CommandApproval, HistoryEntry, HistoryTab};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LauncherState {
    pub composer_surface: String,
    pub mode_lock: Option<String>,
    pub autodetected_shell_latch: bool,
    pub allow_single_character_command_prediction: bool,
    pub terminal_auto_detect_enabled: bool,
    pub history_tab: HistoryTab,
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

    pub fn set_composer_surface(&mut self, surface: String) { self.composer_surface = surface; }
    pub fn set_mode_lock(&mut self, mode: Option<String>) { self.mode_lock = mode; }
    pub fn set_autodetected_shell_latch(&mut self, latch: bool) { self.autodetected_shell_latch = latch; }
    pub fn set_allow_single_character_command_prediction(&mut self, allow: bool) { self.allow_single_character_command_prediction = allow; }
    pub fn set_terminal_auto_detect_enabled(&mut self, enabled: bool) { self.terminal_auto_detect_enabled = enabled; }
    pub fn set_history_tab(&mut self, tab: HistoryTab) { self.history_tab = tab; }
    pub fn set_selected_history_index(&mut self, index: usize) { self.selected_history_index = index; }
    pub fn set_selected_command_index(&mut self, index: usize) { self.selected_command_index = index; }
    pub fn set_model_tab(&mut self, tab: String) { self.model_tab = tab; }
    pub fn set_selected_model_index(&mut self, index: usize) { self.selected_model_index = index; }
    pub fn set_local_conversation_id(&mut self, id: Option<String>) { self.local_conversation_id = id; }
    pub fn set_conversation_search_query(&mut self, query: String) { self.conversation_search_query = query; }
    pub fn set_saved_prompt_entries(&mut self, entries: Vec<HistoryEntry>) { self.saved_prompt_entries = entries; }
    pub fn set_local_pending_approval(&mut self, approval: Option<CommandApproval>) { self.local_pending_approval = approval; }
    pub fn set_auto_approve_agent_loop(&mut self, enabled: bool) { self.auto_approve_agent_loop = enabled; }
    pub fn reset(&mut self, next_composer_surface: &str) { *self = Self::new(next_composer_surface); }
}

#[derive(Debug, Clone)]
pub struct LauncherStore {
    state: Arc<Mutex<LauncherState>>,
}

impl LauncherStore {
    pub fn new(initial_composer_surface: &str) -> Self {
        Self { state: Arc::new(Mutex::new(LauncherState::new(initial_composer_surface))) }
    }
    pub fn with_state<F, R>(&self, f: F) -> R where F: FnOnce(&mut LauncherState) -> R { let mut guard = self.state.lock().unwrap(); f(&mut guard) }
    pub fn get_state(&self) -> LauncherState { self.state.lock().unwrap().clone() }
}

impl Default for LauncherStore { fn default() -> Self { Self::new("terminal") } }
