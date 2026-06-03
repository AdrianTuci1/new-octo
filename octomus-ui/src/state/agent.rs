use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use super::types::{
    ChatAttachment, ChatMessage, CommandApproval, HistoryEntry, HistoryTab,
    TerminalCommandBlock, TerminalCompletionState, TerminalSessionInfo,
};

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
    pub history_tab: HistoryTab,
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

    pub fn set_composer_surface(&mut self, surface: String) { self.composer_surface = surface; }
    pub fn set_mode_lock(&mut self, mode: Option<String>) { self.mode_lock = mode; }
    pub fn set_autodetected_shell_latch(&mut self, latch: bool) { self.autodetected_shell_latch = latch; }
    pub fn set_allow_single_character_command_prediction(&mut self, allow: bool) { self.allow_single_character_command_prediction = allow; }
    pub fn set_terminal_auto_detect_enabled(&mut self, enabled: bool) { self.terminal_auto_detect_enabled = enabled; }
    pub fn set_is_tray_open(&mut self, open: bool) { self.is_tray_open = open; }
    pub fn set_active_tray_mode(&mut self, mode: String) { self.active_tray_mode = mode; }
    pub fn set_query(&mut self, query: String) { self.query = query; }
    pub fn set_messages(&mut self, messages: Vec<ChatMessage>) { self.messages = messages; }
    pub fn set_attachments(&mut self, attachments: Vec<ChatAttachment>) { self.attachments = attachments; }
    pub fn set_active_conversation_id(&mut self, id: Option<String>) { self.active_conversation_id = id; }
    pub fn set_active_run_id(&mut self, id: Option<String>) { self.active_run_id = id; }
    pub fn set_conversation_search_query(&mut self, query: String) { self.conversation_search_query = query; }
    pub fn set_terminal_blocks(&mut self, blocks: Vec<TerminalCommandBlock>) { self.terminal_blocks = blocks; }
    pub fn set_agent_terminal_blocks(&mut self, blocks: Vec<TerminalCommandBlock>) { self.agent_terminal_blocks = blocks; }
    pub fn set_terminal_expanded_block_ids(&mut self, ids: Vec<String>) { self.terminal_expanded_block_ids = ids; }
    pub fn set_agent_terminal_expanded_block_ids(&mut self, ids: Vec<String>) { self.agent_terminal_expanded_block_ids = ids; }
    pub fn set_terminal_selected_block_id(&mut self, id: Option<String>) { self.terminal_selected_block_id = id; }
    pub fn set_agent_terminal_selected_block_id(&mut self, id: Option<String>) { self.agent_terminal_selected_block_id = id; }
    pub fn set_terminal_error(&mut self, error: Option<String>) { self.terminal_error = error; }
    pub fn set_agent_terminal_error(&mut self, error: Option<String>) { self.agent_terminal_error = error; }
    pub fn set_terminal_session_cwd(&mut self, cwd: Option<String>) { self.terminal_session_cwd = cwd; }
    pub fn set_agent_terminal_session_cwd(&mut self, cwd: Option<String>) { self.agent_terminal_session_cwd = cwd; }
    pub fn set_terminal_session_info(&mut self, info: Option<TerminalSessionInfo>) { self.terminal_session_info = info; }
    pub fn set_agent_terminal_session_info(&mut self, info: Option<TerminalSessionInfo>) { self.agent_terminal_session_info = info; }
    pub fn set_terminal_completion_state(&mut self, state: Option<TerminalCompletionState>) { self.terminal_completion_state = state; }
    pub fn set_agent_terminal_completion_state(&mut self, state: Option<TerminalCompletionState>) { self.agent_terminal_completion_state = state; }
    pub fn set_terminal_session_id(&mut self, id: Option<String>) { self.terminal_session_id = id; }
    pub fn set_agent_terminal_session_id(&mut self, id: Option<String>) { self.agent_terminal_session_id = id; }
    pub fn set_history_tab(&mut self, tab: HistoryTab) { self.history_tab = tab; }
    pub fn set_selected_history_index(&mut self, index: usize) { self.selected_history_index = index; }
    pub fn set_selected_command_index(&mut self, index: usize) { self.selected_command_index = index; }
    pub fn set_history_entries(&mut self, entries: Vec<HistoryEntry>) { self.history_entries = entries; }
    pub fn set_saved_prompt_entries(&mut self, entries: Vec<HistoryEntry>) { self.saved_prompt_entries = entries; }
    pub fn set_model_tab(&mut self, tab: String) { self.model_tab = tab; }
    pub fn set_selected_model_index(&mut self, index: usize) { self.selected_model_index = index; }
    pub fn set_model_selection(&mut self, selection: AgentModelSelection) { self.model_selection = selection; }
    pub fn set_working_directory(&mut self, wd: AgentWorkingDirectory) { self.working_directory = wd; }
    pub fn set_git_context(&mut self, ctx: AgentGitContext) { self.git_context = ctx; }
    pub fn set_shell_commands(&mut self, commands: Vec<String>) { self.shell_commands = commands; }
    pub fn set_command_history(&mut self, history: Vec<HistoryEntry>) { self.command_history = history; }
    pub fn set_runtime_context(&mut self, ctx: Option<serde_json::Value>) { self.runtime_context = ctx; }
    pub fn set_active_surface_working_directory(&mut self, path: Option<String>) { self.active_surface_working_directory = path; }
    pub fn set_local_pending_approval(&mut self, approval: Option<CommandApproval>) { self.local_pending_approval = approval; }
    pub fn set_auto_approve_agent_loop(&mut self, enabled: bool) { self.auto_approve_agent_loop = enabled; }
    pub fn reset(&mut self, composer_surface: &str) { *self = Self::new(composer_surface); }
}

#[derive(Debug, Clone)]
pub struct AgentStore {
    state: Arc<Mutex<AgentState>>,
}

impl AgentStore {
    pub fn new() -> Self { Self { state: Arc::new(Mutex::new(AgentState::new("terminal"))) } }
    pub fn with_state<F, R>(&self, f: F) -> R where F: FnOnce(&mut AgentState) -> R { let mut guard = self.state.lock().unwrap(); f(&mut guard) }
    pub fn get_state(&self) -> AgentState { self.state.lock().unwrap().clone() }
}

impl Default for AgentStore { fn default() -> Self { Self::new() } }
