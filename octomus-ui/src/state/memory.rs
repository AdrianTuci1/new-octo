use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemorySyncState {
    pub status: String,
    pub server_token: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryMeta {
    pub schema_version: u32,
    pub device_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub sync_endpoint: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemorySettingsValues {
    pub selected_model_id: Option<String>,
    pub last_working_directory: Option<String>,
    pub terminal_auto_detect_enabled: Option<bool>,
    pub web_search_enabled: Option<bool>,
    pub thinking_display_mode: Option<String>,
    pub sync_endpoint: Option<String>,
    pub telemetry_enabled: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemorySettingsRecord {
    pub schema_version: u32,
    pub values: MemorySettingsValues,
    pub updated_at: String,
    pub last_synced_at: Option<String>,
    pub sync_token: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryWorkspaceSnapshot {
    pub id: String,
    pub schema_version: u32,
    pub selected_tab_id: Option<String>,
    pub launcher_tab_id: Option<String>,
    pub pane_direction: Option<String>,
    pub active_section_id: Option<String>,
    pub expanded_group_ids: Vec<String>,
    pub is_sidebar_open: bool,
    pub is_agents_active: bool,
    pub next_terminal_index: u32,
    pub next_conversation_index: u32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryConversationSummary {
    pub id: String,
    pub title: String,
    pub status: String,
    pub model_id: Option<String>,
    pub cwd: Option<String>,
    pub message_count: u32,
    pub branch_label: Option<String>,
    pub time_label: String,
    pub created_at: String,
    pub updated_at: String,
    pub server_conversation_token: Option<String>,
    pub sync_state: MemorySyncState,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryConversationRecord {
    pub id: String,
    pub schema_version: u32,
    pub title: String,
    pub status: String,
    pub model_id: Option<String>,
    pub cwd: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub server_conversation_token: Option<String>,
    pub sync_state: MemorySyncState,
    pub root_task_id: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryCloudObjectSummary {
    pub uid: String,
    pub kind: String,
    pub location: String,
    pub title: String,
    pub updated_at: String,
    pub sync_state: MemorySyncState,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryCloudObjectRecord {
    pub uid: String,
    pub kind: String,
    pub location: String,
    pub title: String,
    pub metadata: std::collections::HashMap<String, serde_json::Value>,
    pub body: std::collections::HashMap<String, serde_json::Value>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub sync_state: MemorySyncState,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryCloudObjectIndex {
    pub objects_by_uid: std::collections::HashMap<String, MemoryCloudObjectSummary>,
    pub sorted_orders_by_location: std::collections::HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemorySyncStatus {
    pub mode: String,
    pub endpoint_configured: bool,
    pub pending_count: u32,
    pub failed_count: u32,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
    pub storage_path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OctomusMemoryBootstrap {
    pub root_path: String,
    pub schema_version: u32,
    pub meta: MemoryMeta,
    pub workspace: Option<MemoryWorkspaceSnapshot>,
    pub settings: MemorySettingsRecord,
    pub conversations: Vec<MemoryConversationSummary>,
    pub cloud_index: MemoryCloudObjectIndex,
    pub sync_status: MemorySyncStatus,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemoryStoreState {
    pub status: String,
    pub root_path: Option<String>,
    pub bootstrap_data: Option<OctomusMemoryBootstrap>,
    pub settings: Option<MemorySettingsRecord>,
    pub workspace: Option<MemoryWorkspaceSnapshot>,
    pub conversations: Vec<MemoryConversationSummary>,
    pub conversation_records: std::collections::HashMap<String, MemoryConversationRecord>,
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
}

#[derive(Debug, Clone)]
pub struct MemoryStore {
    state: Arc<Mutex<MemoryStoreState>>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(MemoryStoreState::new())),
        }
    }

    pub fn with_state<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut MemoryStoreState) -> R,
    {
        let mut guard = self.state.lock().unwrap();
        f(&mut guard)
    }

    pub fn get_state(&self) -> MemoryStoreState {
        self.state.lock().unwrap().clone()
    }
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self::new()
    }
}
