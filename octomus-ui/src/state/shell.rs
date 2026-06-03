use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceChromeTab {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub subtitle: Option<String>,
    pub custom_label: Option<String>,
    pub tint_color: Option<String>,
    pub last_execution_status: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TerminalSessionState {
    pub active_conversation_id: Option<String>,
    pub composer_surface: String,
    pub working_directory: Option<String>,
    pub terminal_session_id: Option<String>,
    pub agent_terminal_session_id: Option<String>,
    pub terminal_target: Option<serde_json::Value>,
    pub agent_terminal_target: Option<serde_json::Value>,
    pub pending_approval: Option<serde_json::Value>,
    pub terminal_block_meta_by_id: HashMap<String, serde_json::Value>,
    pub agent_terminal_block_meta_by_id: HashMap<String, serde_json::Value>,
    pub terminal_blocks: Vec<serde_json::Value>,
    pub agent_terminal_blocks: Vec<serde_json::Value>,
    pub synthetic_blocks: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspacePaneLayout {
    pub active_pane_id: String,
    pub root: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ShellState {
    pub tabs: Vec<WorkspaceChromeTab>,
    pub selected_tab_id: String,
    pub launcher_tab_id: Option<String>,
    pub pane_layouts_by_tab_id: HashMap<String, WorkspacePaneLayout>,
    pub pane_session_bindings_by_pane_id: HashMap<String, String>,
    pub active_section_id: String,
    pub expanded_group_ids: Vec<String>,
    pub is_sidebar_open: bool,
    pub next_terminal_index: usize,
    pub terminal_sessions: HashMap<String, TerminalSessionState>,
    pub pane_startup_commands_by_pane_id: HashMap<String, Vec<String>>,
    pub path_context: Option<serde_json::Value>,
    pub is_agents_active: bool,
    pub is_spotlight_visible: bool,
    pub open_past_conversation_baseline_by_id: HashMap<String, usize>,
}

impl ShellState {
    pub fn new() -> Self {
        let default_tab = WorkspaceChromeTab {
            id: "terminal-main".to_string(),
            label: "Terminal".to_string(),
            kind: "terminal".to_string(),
            ..Default::default()
        };
        let mut pane_layouts = HashMap::new();
        pane_layouts.insert(
            "terminal-main".to_string(),
            WorkspacePaneLayout {
                active_pane_id: "terminal-main".to_string(),
                root: serde_json::json!({
                    "type": "leaf",
                    "paneId": "terminal-main"
                }),
            },
        );
        let mut sessions = HashMap::new();
        sessions.insert("terminal-main".to_string(), TerminalSessionState::default());
        let mut bindings = HashMap::new();
        bindings.insert("terminal-main".to_string(), "terminal-main".to_string());

        Self {
            tabs: vec![default_tab],
            selected_tab_id: "terminal-main".to_string(),
            launcher_tab_id: Some("terminal-main".to_string()),
            pane_layouts_by_tab_id: pane_layouts,
            pane_session_bindings_by_pane_id: bindings,
            active_section_id: "general".to_string(),
            expanded_group_ids: vec![],
            is_sidebar_open: false,
            next_terminal_index: 1,
            terminal_sessions: sessions,
            pane_startup_commands_by_pane_id: HashMap::new(),
            path_context: None,
            is_agents_active: false,
            is_spotlight_visible: false,
            open_past_conversation_baseline_by_id: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ShellStore {
    state: Arc<Mutex<ShellState>>,
}

impl ShellStore {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ShellState::new())),
        }
    }

    pub fn with_state<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut ShellState) -> R,
    {
        let mut guard = self.state.lock().unwrap();
        f(&mut guard)
    }

    pub fn get_state(&self) -> ShellState {
        self.state.lock().unwrap().clone()
    }
}

impl Default for ShellStore {
    fn default() -> Self {
        Self::new()
    }
}
