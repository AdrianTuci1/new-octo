use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UiState {
    pub tray_mode: String,
    pub last_tray_mode: String,
    pub is_expanded: bool,
    pub is_model_drawer_open: bool,
    pub is_cloud_profile_drawer_open: bool,
    pub is_profile_drawer_open: bool,
    pub is_rules_drawer_open: bool,
    pub is_code_review_drawer_open: bool,
    pub active_profile_name: String,
    pub selected_model_id_for_edit: Option<String>,
    pub selected_cloud_profile_id_for_edit: Option<String>,
    pub is_chat_hidden: bool,
}

impl UiState {
    pub fn new() -> Self {
        Self {
            tray_mode: "closed".to_string(),
            last_tray_mode: "help".to_string(),
            active_profile_name: "Default".to_string(),
            ..Default::default()
        }
    }

    pub fn set_tray_mode(&mut self, mode: String) {
        if self.tray_mode != mode {
            self.tray_mode = mode.clone();
            self.is_expanded = mode != "closed";
        }
    }

    pub fn toggle_tray(&mut self, mode: String) {
        let next_mode = if self.tray_mode == mode { "closed".to_string() } else { mode.clone() };
        self.tray_mode = next_mode.clone();
        self.last_tray_mode = mode;
        self.is_expanded = next_mode != "closed";
    }

    pub fn set_expanded(&mut self, expanded: bool) { self.is_expanded = expanded; }
    pub fn set_is_model_drawer_open(&mut self, open: bool) { self.is_model_drawer_open = open; }
    pub fn set_selected_model_id_for_edit(&mut self, id: Option<String>) { self.selected_model_id_for_edit = id; }
    pub fn open_model_drawer(&mut self) { self.is_model_drawer_open = true; }
    pub fn close_model_drawer(&mut self) { self.is_model_drawer_open = false; }
    pub fn set_is_cloud_profile_drawer_open(&mut self, open: bool) { self.is_cloud_profile_drawer_open = open; }
    pub fn set_selected_cloud_profile_id_for_edit(&mut self, id: Option<String>) { self.selected_cloud_profile_id_for_edit = id; }
    pub fn open_cloud_profile_drawer(&mut self) { self.is_cloud_profile_drawer_open = true; }
    pub fn close_cloud_profile_drawer(&mut self) { self.is_cloud_profile_drawer_open = false; }
    pub fn set_is_profile_drawer_open(&mut self, open: bool) { self.is_profile_drawer_open = open; }
    pub fn open_profile_drawer(&mut self) { self.is_profile_drawer_open = true; }
    pub fn close_profile_drawer(&mut self) { self.is_profile_drawer_open = false; }
    pub fn set_is_rules_drawer_open(&mut self, open: bool) { self.is_rules_drawer_open = open; }
    pub fn open_rules_drawer(&mut self) { self.is_rules_drawer_open = true; }
    pub fn close_rules_drawer(&mut self) { self.is_rules_drawer_open = false; }
    pub fn set_is_code_review_drawer_open(&mut self, open: bool) { self.is_code_review_drawer_open = open; }
    pub fn open_code_review_drawer(&mut self) { self.is_code_review_drawer_open = true; }
    pub fn close_code_review_drawer(&mut self) { self.is_code_review_drawer_open = false; }
    pub fn toggle_code_review_drawer(&mut self) { self.is_code_review_drawer_open = !self.is_code_review_drawer_open; }
    pub fn set_active_profile_name(&mut self, name: String) { self.active_profile_name = name; }
    pub fn set_is_chat_hidden(&mut self, hidden: bool) { self.is_chat_hidden = hidden; }
}

#[derive(Debug, Clone)]
pub struct UiStore {
    state: Arc<Mutex<UiState>>,
}

impl UiStore {
    pub fn new() -> Self { Self { state: Arc::new(Mutex::new(UiState::new())) } }
    pub fn with_state<F, R>(&self, f: F) -> R where F: FnOnce(&mut UiState) -> R { let mut guard = self.state.lock().unwrap(); f(&mut guard) }
    pub fn get_state(&self) -> UiState { self.state.lock().unwrap().clone() }
}

impl Default for UiStore { fn default() -> Self { Self::new() } }
