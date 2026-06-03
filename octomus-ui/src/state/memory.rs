use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use super::types::{
    MemoryCloudObjectIndex, MemoryConversationRecord, MemoryConversationSummary, MemorySettingsRecord,
    MemorySyncStatus, MemoryWorkspaceSnapshot, OctomusMemoryBootstrap,
};

pub type MemoryStoreStatus = String;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryStoreState {
    pub status: MemoryStoreStatus,
    pub root_path: Option<String>,
    pub bootstrap_data: Option<OctomusMemoryBootstrap>,
    pub settings: Option<MemorySettingsRecord>,
    pub workspace: Option<MemoryWorkspaceSnapshot>,
    pub conversations: Vec<MemoryConversationSummary>,
    pub conversation_records: HashMap<String, MemoryConversationRecord>,
    pub cloud_index: Option<MemoryCloudObjectIndex>,
    pub sync_status: Option<MemorySyncStatus>,
    pub error: Option<String>,
}

impl MemoryStoreState {
    pub fn new() -> Self {
        Self {
            status: "idle".to_string(),
            ..Default::default()
        }
    }

    pub fn set_status(&mut self, status: MemoryStoreStatus) { self.status = status; }
    pub fn set_root_path(&mut self, path: Option<String>) { self.root_path = path; }
    pub fn set_bootstrap_data(&mut self, data: Option<OctomusMemoryBootstrap>) { self.bootstrap_data = data; }
    pub fn set_settings(&mut self, settings: Option<MemorySettingsRecord>) { self.settings = settings; }
    pub fn set_workspace(&mut self, workspace: Option<MemoryWorkspaceSnapshot>) { self.workspace = workspace; }
    pub fn set_conversations(&mut self, conversations: Vec<MemoryConversationSummary>) { self.conversations = conversations; }
    pub fn set_conversation_records(&mut self, records: HashMap<String, MemoryConversationRecord>) { self.conversation_records = records; }
    pub fn set_cloud_index(&mut self, index: Option<MemoryCloudObjectIndex>) { self.cloud_index = index; }
    pub fn set_sync_status(&mut self, status: Option<MemorySyncStatus>) { self.sync_status = status; }
    pub fn set_error(&mut self, error: Option<String>) { self.error = error; }
}

#[derive(Debug, Clone)]
pub struct MemoryStore {
    state: Arc<Mutex<MemoryStoreState>>,
}

impl MemoryStore {
    pub fn new() -> Self { Self { state: Arc::new(Mutex::new(MemoryStoreState::new())) } }
    pub fn with_state<F, R>(&self, f: F) -> R where F: FnOnce(&mut MemoryStoreState) -> R { let mut guard = self.state.lock().unwrap(); f(&mut guard) }
    pub fn get_state(&self) -> MemoryStoreState { self.state.lock().unwrap().clone() }
}

impl Default for MemoryStore { fn default() -> Self { Self::new() } }
