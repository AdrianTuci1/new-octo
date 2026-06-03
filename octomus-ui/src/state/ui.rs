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
        let next_mode = if self.tray_mode == mode {
            "closed".to_string()
        } else {
            mode.clone()
        };
        self.tray_mode = next_mode.clone();
        self.last_tray_mode = mode;
        self.is_expanded = next_mode != "closed";
    }
}

#[derive(Debug, Clone)]
pub struct UiStore {
    state: Arc<Mutex<UiState>>,
}

impl UiStore {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(UiState::new())),
        }
    }

    pub fn with_state<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut UiState) -> R,
    {
        let mut guard = self.state.lock().unwrap();
        f(&mut guard)
    }

    pub fn get_state(&self) -> UiState {
        self.state.lock().unwrap().clone()
    }
}

impl Default for UiStore {
    fn default() -> Self {
        Self::new()
    }
}
