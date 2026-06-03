use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum MessageRole {
    #[default]
    User,
    Assistant,
    System,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageBlock {
    Text(String),
    Code {
        language: Option<String>,
        code: String,
    },
    Diff {
        path: String,
        diff: String,
    },
    Thinking(String),
    Exploration(String),
    WebSearch(String),
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub role: MessageRole,
    pub content: String,
    pub blocks: Vec<MessageBlock>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChatAttachment {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub mime_type: Option<String>,
    pub kind: ChatAttachmentKind,
    pub content: Option<String>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum ChatAttachmentKind {
    #[default]
    Text,
    Image,
    Binary,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub title: String,
    pub body: String,
    pub created_at: Option<String>,
    pub conversation_id: Option<String>,
    pub run_id: Option<String>,
    pub is_streaming: bool,
    pub is_error: bool,
    pub status: Option<String>,
    pub tool_kind: Option<String>,
    pub message_kind: Option<String>,
    pub thinking_duration_seconds: Option<u32>,
    pub has_native_thinking: bool,
    pub file_diffs: Vec<FileDiff>,
    pub web_search_status: Option<String>,
    pub web_search_query: Option<String>,
    pub web_search_results: Vec<WebSearchResult>,
    pub workspace_exploration: Option<WorkspaceExplorationArtifact>,
    pub execution_plan: Option<ExecutionPlanArtifact>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FileDiff {
    pub file_path: String,
    pub diff_type: DiffType,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DiffType {
    pub kind: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceExplorationArtifact {
    pub query: Option<String>,
    pub mode: Option<String>,
    pub path: Option<String>,
    pub summary: Option<String>,
    pub segments: Vec<WorkspaceExplorationSegment>,
    pub searches: Vec<WorkspaceExplorationSearch>,
    pub files: Vec<WorkspaceExplorationFile>,
    pub directories: Vec<WorkspaceExplorationDirectory>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceExplorationSegment {
    pub id: String,
    pub created_at: String,
    pub summary: Option<String>,
    pub entries: Vec<WorkspaceExplorationEntry>,
    pub searches: Vec<WorkspaceExplorationSearch>,
    pub files: Vec<WorkspaceExplorationFile>,
    pub directories: Vec<WorkspaceExplorationDirectory>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceExplorationEntry {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub detail: Option<String>,
    pub path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceExplorationSearch {
    pub mode: String,
    pub source: String,
    pub query: String,
    pub result_count: u32,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceExplorationFile {
    pub path: String,
    pub source: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceExplorationDirectory {
    pub path: String,
    pub source: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExecutionPlanArtifact {
    pub id: String,
    pub title: String,
    pub summary: Option<String>,
    pub version: Option<String>,
    pub steps: Vec<ExecutionPlanStep>,
    pub workstreams: Vec<ExecutionPlanWorkstream>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExecutionPlanStep {
    pub id: String,
    pub label: String,
    pub status: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExecutionPlanWorkstream {
    pub id: String,
    pub title: String,
    pub status: String,
    pub step_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TerminalCommandBlock {
    pub id: String,
    pub command: String,
    pub output: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<u64>,
    pub status: String, // "running" | "finished"
    pub presentation: Option<String>, // "command" | "conversation-link"
    pub source: Option<String>, // "user" | "assistant"
    pub conversation_id: Option<String>,
    pub conversation_title: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CommandApproval {
    pub kind: Option<String>,
    pub command: Option<String>,
    pub tool_call_id: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TimelineItemKind {
    Message { message: ChatMessage },
    TerminalBlock { block: TerminalCommandBlock },
    MultiAgentBlock { agent_name: String, status: String, task_summary: String, color_scheme: Option<String> },
    TerminalError { error: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineItem {
    pub id: String,
    pub kind: TimelineItemKind,
    pub at: u64,
    pub order: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChatState {
    pub active_conversation_id: Option<String>,
    pub active_run_id: Option<String>,
    pub query: String,
    pub messages: Vec<Message>,
    pub chat_messages: Vec<ChatMessage>,
    pub terminal_blocks: Vec<TerminalCommandBlock>,
    pub terminal_error: Option<String>,
    pub attachments: Vec<ChatAttachment>,
    pub mode_lock: Option<String>,
    pub autodetected_shell_latch: bool,
    pub is_loading: bool,
    pub find_visible: bool,
    pub find_query: String,
    pub find_case_sensitive: bool,
    pub find_use_regex: bool,
    pub find_whole_word: bool,
    pub find_match_count: usize,
    pub find_active_index: i32,
    pub expanded_terminal_block_ids: Vec<String>,
    pub selected_terminal_block_id: Option<String>,
    pub pending_approval: Option<CommandApproval>,
    pub is_open: bool,
    pub title: String,
    pub empty_state_variant: String,
    pub show_empty_topbar: bool,
}

impl ChatState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_active_conversation_id(&mut self, id: Option<String>) {
        self.active_conversation_id = id;
    }

    pub fn set_active_run_id(&mut self, id: Option<String>) {
        self.active_run_id = id;
    }

    pub fn set_query(&mut self, query: String) {
        self.query = query;
    }

    pub fn set_messages(&mut self, messages: Vec<Message>) {
        self.messages = messages;
    }

    pub fn set_chat_messages(&mut self, messages: Vec<ChatMessage>) {
        self.chat_messages = messages;
    }

    pub fn set_terminal_blocks(&mut self, blocks: Vec<TerminalCommandBlock>) {
        self.terminal_blocks = blocks;
    }

    pub fn set_attachments(&mut self, attachments: Vec<ChatAttachment>) {
        self.attachments = attachments;
    }

    pub fn set_mode_lock(&mut self, mode: Option<String>) {
        self.mode_lock = mode;
    }

    pub fn set_autodetected_shell_latch(&mut self, latch: bool) {
        self.autodetected_shell_latch = latch;
    }

    pub fn add_message(&mut self, message: Message) {
        self.messages.push(message);
    }

    pub fn add_chat_message(&mut self, message: ChatMessage) {
        self.chat_messages.push(message);
    }

    pub fn update_message<F>(&mut self, message_id: &str, updater: F) -> bool
    where
        F: FnOnce(&mut Message),
    {
        if let Some(msg) = self.messages.iter_mut().find(|m| m.id == message_id) {
            updater(msg);
            true
        } else {
            false
        }
    }

    pub fn append_to_message(&mut self, message_id: &str, text: &str) -> bool {
        if let Some(msg) = self.messages.iter_mut().find(|m| m.id == message_id) {
            msg.content.push_str(text);
            true
        } else {
            false
        }
    }

    pub fn clear_messages(&mut self) {
        self.active_conversation_id = None;
        self.messages.clear();
        self.chat_messages.clear();
        self.terminal_blocks.clear();
        self.terminal_error = None;
        self.pending_approval = None;
    }

    pub fn has_content(&self) -> bool {
        !self.messages.is_empty()
            || !self.terminal_blocks.is_empty()
            || self.terminal_error.is_some()
            || self.pending_approval.is_some()
    }

    pub fn toggle_find(&mut self) {
        self.find_visible = !self.find_visible;
        if !self.find_visible {
            self.find_query.clear();
            self.find_match_count = 0;
            self.find_active_index = -1;
        }
    }

    pub fn close_find(&mut self) {
        self.find_visible = false;
        self.find_query.clear();
        self.find_match_count = 0;
        self.find_active_index = -1;
    }

    pub fn open_find(&mut self) {
        self.find_visible = true;
    }

    pub fn select_next_match(&mut self) {
        if self.find_match_count == 0 {
            return;
        }
        self.find_active_index = (self.find_active_index + 1) % self.find_match_count as i32;
    }

    pub fn select_previous_match(&mut self) {
        if self.find_match_count == 0 {
            return;
        }
        self.find_active_index = (self.find_active_index - 1 + self.find_match_count as i32) % self.find_match_count as i32;
    }
}

#[derive(Debug, Clone)]
pub struct ChatStore {
    state: Arc<Mutex<ChatState>>,
}

impl ChatStore {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ChatState::new())),
        }
    }

    pub fn with_state<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut ChatState) -> R,
    {
        let mut guard = self.state.lock().unwrap();
        f(&mut guard)
    }

    pub fn get_state(&self) -> ChatState {
        self.state.lock().unwrap().clone()
    }
}

impl Default for ChatStore {
    fn default() -> Self {
        Self::new()
    }
}
