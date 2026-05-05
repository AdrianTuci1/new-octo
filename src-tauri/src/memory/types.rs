use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub(crate) const MEMORY_SCHEMA_VERSION: u32 = 1;
pub(crate) const DEFAULT_WORKSPACE_ID: &str = "workspace-main";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryMeta {
    pub schema_version: u32,
    pub device_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub sync_endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySettingsRecord {
    pub schema_version: u32,
    #[serde(default = "empty_object")]
    pub values: Value,
    pub updated_at: String,
    pub last_synced_at: Option<String>,
    pub sync_token: Option<String>,
}

impl Default for MemorySettingsRecord {
    fn default() -> Self {
        Self {
            schema_version: MEMORY_SCHEMA_VERSION,
            values: empty_object(),
            updated_at: crate::memory::storage::now_string(),
            last_synced_at: None,
            sync_token: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySettingsPutRequest {
    #[serde(default = "empty_object")]
    pub values: Value,
    #[serde(default)]
    pub merge: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryWorkspaceSnapshot {
    #[serde(default = "default_workspace_id")]
    pub id: String,
    #[serde(default = "schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub tabs: Vec<Value>,
    pub selected_tab_id: Option<String>,
    pub launcher_tab_id: Option<String>,
    #[serde(default)]
    pub conversations: Vec<Value>,
    #[serde(default = "empty_object")]
    pub terminal_sessions: Value,
    pub active_section_id: Option<String>,
    #[serde(default)]
    pub expanded_group_ids: Vec<String>,
    #[serde(default)]
    pub is_sidebar_open: bool,
    #[serde(default)]
    pub is_agents_active: bool,
    #[serde(default)]
    pub next_terminal_index: u32,
    #[serde(default)]
    pub next_conversation_index: u32,
    #[serde(default = "crate::memory::storage::now_string")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryWorkspacePutRequest {
    pub snapshot: MemoryWorkspaceSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryConversationPutRequest {
    pub conversation_id: String,
    pub title: Option<String>,
    pub model_id: Option<String>,
    pub cwd: Option<String>,
    pub status: Option<String>,
    #[serde(default)]
    pub messages: Vec<Value>,
    #[serde(default)]
    pub terminal_blocks: Option<Vec<Value>>,
    #[serde(default)]
    pub artifacts: Vec<MemoryArtifactRecord>,
    pub server_conversation_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryConversationLookupRequest {
    pub conversation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub tasks: Vec<MemoryTaskRecord>,
    pub exchanges: Vec<MemoryExchangeRecord>,
    pub artifacts: Vec<MemoryArtifactRecord>,
    pub messages: Vec<Value>,
    #[serde(default)]
    pub terminal_blocks: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryConversationSummary {
    pub id: String,
    pub title: String,
    pub status: String,
    pub model_id: Option<String>,
    pub cwd: Option<String>,
    pub message_count: usize,
    pub branch_label: Option<String>,
    pub time_label: String,
    pub created_at: String,
    pub updated_at: String,
    pub server_conversation_token: Option<String>,
    pub sync_state: MemorySyncState,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryConversationIndex {
    #[serde(default)]
    pub conversations: Vec<MemoryConversationSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryTaskRecord {
    pub id: String,
    pub parent_task_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub status: String,
    #[serde(default)]
    pub exchange_ids: Vec<String>,
    #[serde(default)]
    pub child_task_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default = "empty_object")]
    pub metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryExchangeRecord {
    pub id: String,
    pub task_id: String,
    pub parent_exchange_id: Option<String>,
    #[serde(default)]
    pub input_message_ids: Vec<String>,
    #[serde(default)]
    pub output_message_ids: Vec<String>,
    #[serde(default)]
    pub tool_call_ids: Vec<String>,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryArtifactRecord {
    pub id: String,
    pub kind: String,
    pub title: String,
    #[serde(default = "empty_object")]
    pub data: Value,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySyncState {
    pub status: String,
    pub server_token: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
}

impl Default for MemorySyncState {
    fn default() -> Self {
        Self {
            status: "local".to_string(),
            server_token: None,
            last_synced_at: None,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCloudObjectRecord {
    pub uid: String,
    pub kind: String,
    pub location: String,
    pub title: String,
    #[serde(default = "empty_object")]
    pub metadata: Value,
    #[serde(default = "empty_object")]
    pub body: Value,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(default)]
    pub sync_state: MemorySyncState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCloudObjectSummary {
    pub uid: String,
    pub kind: String,
    pub location: String,
    pub title: String,
    pub updated_at: String,
    pub sync_state: MemorySyncState,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCloudObjectIndex {
    #[serde(default)]
    pub objects_by_uid: HashMap<String, MemoryCloudObjectSummary>,
    #[serde(default)]
    pub sorted_orders_by_location: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCloudObjectPutRequest {
    pub object: MemoryCloudObjectRecord,
    #[serde(default)]
    pub enqueue_sync: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCloudObjectLookupRequest {
    pub uid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCloudObjectIndexRequest {
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCloudObjectIndexResponse {
    pub index: MemoryCloudObjectIndex,
    pub ordered_uids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySyncOperation {
    pub id: String,
    pub object_uid: String,
    pub object_kind: String,
    pub operation: String,
    #[serde(default = "empty_object")]
    pub payload: Value,
    pub created_at: String,
    pub updated_at: String,
    pub attempt_count: u32,
    pub next_attempt_at: Option<String>,
    pub status: String,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySyncOperationRequest {
    pub object_uid: String,
    pub object_kind: String,
    pub operation: String,
    #[serde(default = "empty_object")]
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemorySyncQueue {
    #[serde(default)]
    pub operations: Vec<MemorySyncOperation>,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySyncRequest {
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySyncStatus {
    pub mode: String,
    pub endpoint_configured: bool,
    pub pending_count: usize,
    pub failed_count: usize,
    pub last_attempt_at: Option<String>,
    pub last_success_at: Option<String>,
    pub last_error: Option<String>,
    pub storage_path: String,
}

pub(crate) fn schema_version() -> u32 {
    MEMORY_SCHEMA_VERSION
}

pub(crate) fn default_workspace_id() -> String {
    DEFAULT_WORKSPACE_ID.to_string()
}

pub(crate) fn empty_object() -> Value {
    json!({})
}
