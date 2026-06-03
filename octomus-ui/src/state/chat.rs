use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};


// Original types used by octomus-ui chat components
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum MessageRole {
    #[default]
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

// Ported from src/stores/chatStore.ts
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChatState {
    pub active_conversation_id: Option<String>,
    pub active_run_id: Option<String>,
    pub query: String,
    pub messages: Vec<Message>,
    pub attachments: Vec<super::types::ChatAttachment>,
    pub mode_lock: Option<String>,
    pub autodetected_shell_latch: bool,
    pub is_loading: bool,
    pub find_visible: bool,
    pub find_query: String,
}

impl ChatState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_active_conversation_id(&mut self, conversation_id: Option<String>) { self.active_conversation_id = conversation_id; }
    pub fn set_active_run_id(&mut self, run_id: Option<String>) { self.active_run_id = run_id; }
    pub fn set_query(&mut self, query: String) { self.query = query; }
    pub fn set_messages(&mut self, messages: Vec<Message>) { self.messages = messages; }
    pub fn set_attachments(&mut self, attachments: Vec<super::types::ChatAttachment>) { self.attachments = attachments; }
    pub fn set_mode_lock(&mut self, mode: Option<String>) { self.mode_lock = mode; }
    pub fn set_autodetected_shell_latch(&mut self, latch: bool) { self.autodetected_shell_latch = latch; }

    pub fn add_message(&mut self, message: Message) { self.messages.push(message); }

    pub fn update_message<F>(&mut self, message_id: &str, updater: F) -> bool
    where F: FnOnce(&mut Message) {
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

    pub fn clear_messages(&mut self,
    ) {
        self.active_conversation_id = None;
        self.messages.clear();
    }
}

#[derive(Debug, Clone)]
pub struct ChatStore {
    state: Arc<Mutex<ChatState>>,
}

impl ChatStore {
    pub fn new() -> Self { Self { state: Arc::new(Mutex::new(ChatState::new())) } }
    pub fn with_state<F, R>(&self, f: F) -> R where F: FnOnce(&mut ChatState) -> R { let mut guard = self.state.lock().unwrap(); f(&mut guard) }
    pub fn get_state(&self) -> ChatState { self.state.lock().unwrap().clone() }
}

impl Default for ChatStore { fn default() -> Self { Self::new() } }
