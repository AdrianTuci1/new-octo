use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use super::types::{
    TerminalBlockSharedMeta, TerminalCommandBlock, TerminalCompletionState, TerminalSessionInfo,
};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TerminalBlocksState {
    pub blocks: Vec<TerminalCommandBlock>,
    pub expanded_block_ids: Vec<String>,
    pub selected_block_id: Option<String>,
    pub error: Option<String>,
    pub session_cwd: Option<String>,
    pub session_info: Option<TerminalSessionInfo>,
    pub completion_state: Option<TerminalCompletionState>,
    pub session_id: Option<String>,
    pub session_status: Option<String>,
    pub session_kind: Option<String>,
    pub session_provider: Option<String>,
    pub block_meta_by_id: std::collections::HashMap<String, TerminalBlockSharedMeta>,
    pub command_blocks: Vec<TerminalCommandBlock>,
    pub synthetic_blocks: Vec<TerminalCommandBlock>,
}

impl TerminalBlocksState {
    pub fn new() -> Self { Self::default() }

    pub fn set_blocks(&mut self, blocks: Vec<TerminalCommandBlock>) { self.blocks = blocks; }
    pub fn set_expanded_block_ids(&mut self, ids: Vec<String>) { self.expanded_block_ids = ids; }
    pub fn set_selected_block_id(&mut self, id: Option<String>) { self.selected_block_id = id; }
    pub fn set_error(&mut self, error: Option<String>) { self.error = error; }
    pub fn set_session_cwd(&mut self, cwd: Option<String>) { self.session_cwd = cwd; }
    pub fn set_session_info(&mut self, info: Option<TerminalSessionInfo>) {
        self.session_info = info.clone();
        self.session_status = info.as_ref().map(|i| i.status.clone());
        self.session_kind = info.as_ref().map(|i| i.kind.clone());
        self.session_provider = info.as_ref().map(|i| i.provider.clone());
        self.session_id = info.as_ref().map(|i| i.id.clone());
    }
    pub fn set_completion_state(&mut self, state: Option<TerminalCompletionState>) { self.completion_state = state; }
    pub fn set_block_meta_by_id(&mut self, meta: std::collections::HashMap<String, TerminalBlockSharedMeta>) { self.block_meta_by_id = meta; }
    pub fn set_command_blocks(&mut self, blocks: Vec<TerminalCommandBlock>) { self.command_blocks = blocks; }
    pub fn set_synthetic_blocks(&mut self, blocks: Vec<TerminalCommandBlock>) { self.synthetic_blocks = blocks; }
}

#[derive(Debug, Clone)]
pub struct TerminalBlocksStore {
    state: Arc<Mutex<TerminalBlocksState>>,
}

impl TerminalBlocksStore {
    pub fn new() -> Self { Self { state: Arc::new(Mutex::new(TerminalBlocksState::new())) } }
    pub fn with_state<F, R>(&self, f: F) -> R where F: FnOnce(&mut TerminalBlocksState) -> R { let mut guard = self.state.lock().unwrap(); f(&mut guard) }
    pub fn get_state(&self) -> TerminalBlocksState { self.state.lock().unwrap().clone() }
}

impl Default for TerminalBlocksStore { fn default() -> Self { Self::new() } }
