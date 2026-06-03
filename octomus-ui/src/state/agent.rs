use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use super::chat::{ChatAttachment, ChatMessage};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentModelEntry {
    pub id: String,
    pub api_id: Option<String>,
    pub label: String,
    pub provider_label: String,
    pub supports_attachments: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentModelSelection {
    pub selected_model_id: Option<String>,
    pub selected_model_api_id: Option<String>,
    pub selected_model_label: String,
    pub selected_model_supports_attachments: bool,
    pub is_configured: bool,
    pub requires_model_setup: bool,
    pub models: Vec<AgentModelEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub path: String,
    pub items: Vec<String>,
    pub parent_path: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentWorkingDirectory {
    pub current_path: Option<String>,
    pub home_dir: Option<String>,
    pub is_picker_open: bool,
    pub browser_path: Option<String>,
    pub search_query: String,
    pub listing: Option<DirectoryListing>,
    pub button_label: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentGitContext {
    pub current_branch: Option<String>,
    pub is_branch_menu_open: bool,
    pub git_context: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TerminalCommandBlock {
    pub id: String,
    pub command: String,
    pub output: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<u64>,
    pub presentation: Option<String>,
    pub source: Option<String>,
    pub conversation_id: Option<String>,
    pub conversation_title: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TerminalSessionInfo {
    pub id: String,
    pub shell: String,
    pub kind: String,
    pub provider: String,
    pub status: String,
    pub cwd: Option<String>,
    pub profile_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TerminalCompletionState {
    pub status: String,
    pub format: Option<String>,
    pub prompt_visible: bool,
    pub completions: Vec<serde_json::Value>,
    pub last_value: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub kind: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CommandApproval {
    pub kind: Option<String>,
    pub command: Option<String>,
    pub tool_call_id: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentState {
    pub composer_surface: String,
    pub mode_lock: Option<String>,
    pub autodetected_shell_latch: bool,
    pub allow_single_character_command_prediction: bool,
    pub terminal_auto_detect_enabled: bool,
    pub is_tray_open: bool,
    pub active_tray_mode: String,
    pub query: String,
    pub messages: Vec<ChatMessage>,
    pub attachments: Vec<ChatAttachment>,
    pub active_conversation_id: Option<String>,
    pub active_run_id: Option<String>,
    pub conversation_search_query: String,
    pub terminal_blocks: Vec<TerminalCommandBlock>,
    pub agent_terminal_blocks: Vec<TerminalCommandBlock>,
    pub terminal_expanded_block_ids: Vec<String>,
    pub agent_terminal_expanded_block_ids: Vec<String>,
    pub terminal_selected_block_id: Option<String>,
    pub agent_terminal_selected_block_id: Option<String>,
    pub terminal_error: Option<String>,
    pub agent_terminal_error: Option<String>,
    pub terminal_session_cwd: Option<String>,
    pub agent_terminal_session_cwd: Option<String>,
    pub terminal_session_info: Option<TerminalSessionInfo>,
    pub agent_terminal_session_info: Option<TerminalSessionInfo>,
    pub terminal_completion_state: Option<TerminalCompletionState>,
    pub agent_terminal_completion_state: Option<TerminalCompletionState>,
    pub terminal_session_id: Option<String>,
    pub agent_terminal_session_id: Option<String>,
    pub history_tab: String,
    pub selected_history_index: usize,
    pub selected_command_index: usize,
    pub history_entries: Vec<HistoryEntry>,
    pub saved_prompt_entries: Vec<HistoryEntry>,
    pub model_tab: String,
    pub selected_model_index: usize,
    pub model_selection: AgentModelSelection,
    pub working_directory: AgentWorkingDirectory,
    pub git_context: AgentGitContext,
    pub shell_commands: Vec<String>,
    pub command_history: Vec<HistoryEntry>,
    pub runtime_context: Option<serde_json::Value>,
    pub active_surface_working_directory: Option<String>,
    pub local_pending_approval: Option<CommandApproval>,
    pub auto_approve_agent_loop: bool,
}

impl AgentState {
    pub fn new(composer_surface: &str) -> Self {
        Self {
            composer_surface: composer_surface.to_string(),
            active_tray_mode: "history".to_string(),
            history_tab: "all".to_string(),
            model_tab: "all".to_string(),
            terminal_auto_detect_enabled: true,
            working_directory: AgentWorkingDirectory {
                button_label: "~".to_string(),
                ..Default::default()
            },
            model_selection: AgentModelSelection {
                selected_model_label: "Auto".to_string(),
                requires_model_setup: true,
                ..Default::default()
            },
            ..Default::default()
        }
    }

    pub fn reset(&mut self, composer_surface: &str) {
        *self = Self::new(composer_surface);
    }
}

#[derive(Debug, Clone)]
pub struct AgentStore {
    state: Arc<Mutex<AgentState>>,
}

impl AgentStore {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(AgentState::new("terminal"))),
        }
    }

    pub fn with_state<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut AgentState) -> R,
    {
        let mut guard = self.state.lock().unwrap();
        f(&mut guard)
    }

    pub fn get_state(&self) -> AgentState {
        self.state.lock().unwrap().clone()
    }
}

impl Default for AgentStore {
    fn default() -> Self {
        Self::new()
    }
}
