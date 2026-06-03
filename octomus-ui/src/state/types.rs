use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================
// chat.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub title: String,
    pub body: String,
    pub created_at: Option<String>,
    pub conversation_id: Option<String>,
    pub run_id: Option<String>,
    pub is_streaming: Option<bool>,
    pub is_error: Option<bool>,
    pub status: Option<AgentRunStatus>,
    pub usage: Option<AgentUsage>,
    pub tool_call_id: Option<String>,
    pub tool_calls: Option<Vec<serde_json::Value>>,
    pub file_diffs: Option<Vec<FileDiff>>,
    pub file_change_status: Option<String>,
    pub message_kind: Option<String>,
    pub thinking_duration_seconds: Option<u32>,
    pub has_native_thinking: Option<bool>,
    pub parent_message_id: Option<String>,
    pub tool_kind: Option<String>,
    pub web_search_status: Option<String>,
    pub web_search_query: Option<String>,
    pub web_search_results: Option<Vec<WebSearchResult>>,
    pub workspace_exploration: Option<WorkspaceExplorationArtifact>,
    pub workspace_file_read: Option<WorkspaceFileReadArtifact>,
    pub execution_plan: Option<ExecutionPlanArtifact>,
    pub follow_up_suggestion: Option<FollowUpSuggestion>,
    pub sub_agents: Option<Vec<SubAgentCall>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubAgentCall {
    pub id: String,
    pub name: String,
    pub task: String,
    pub status: String,
    pub avatar_url: Option<String>,
    pub result: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExecutionPlanStep {
    pub id: String,
    pub label: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExecutionPlanWorkstream {
    pub id: String,
    pub title: String,
    pub status: String,
    pub step_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExecutionPlanArtifact {
    pub id: String,
    pub title: String,
    pub summary: Option<String>,
    pub version: Option<String>,
    pub steps: Vec<ExecutionPlanStep>,
    pub workstreams: Option<Vec<ExecutionPlanWorkstream>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlanExecutionUpdate {
    pub plan_id: String,
    pub step_id: String,
    pub action: String,
    pub summary: Option<String>,
    pub workstreams: Option<Vec<ExecutionPlanWorkstream>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WebSearchRequest {
    pub tool_call_id: String,
    pub query: String,
    pub max_results: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CloudAgentLaunchRequest {
    pub tool_call_id: String,
    pub prompt: String,
    pub provider: Option<String>,
    pub profile_id: Option<String>,
    pub cwd: Option<String>,
    pub repo: Option<String>,
    pub base_branch: Option<String>,
    pub work_branch: Option<String>,
    pub sync_strategy: Option<String>,
    pub commit_message: Option<String>,
    pub artifact_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceExplorationSearch {
    pub mode: String,
    pub source: String,
    pub query: String,
    pub result_count: u32,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceExplorationFile {
    pub path: String,
    pub source: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceExplorationDirectory {
    pub path: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceExplorationEntry {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub detail: Option<String>,
    pub path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceExplorationSegment {
    pub id: String,
    pub created_at: String,
    pub summary: Option<String>,
    pub entries: Vec<WorkspaceExplorationEntry>,
    pub searches: Vec<WorkspaceExplorationSearch>,
    pub files: Vec<WorkspaceExplorationFile>,
    pub directories: Vec<WorkspaceExplorationDirectory>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceFileReadArtifact {
    pub path: String,
    pub display_path: String,
    pub content: String,
    pub start_line: Option<u32>,
    pub end_line: Option<u32>,
    pub truncated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceExplorationRequest {
    pub tool_call_id: String,
    pub mode: Option<String>,
    pub query: Option<String>,
    pub path: Option<String>,
    pub symbol: Option<String>,
    pub file_path: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub max_results: Option<u32>,
    pub include_files: Option<bool>,
    pub include_directories: Option<bool>,
    pub recursive: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceExplorationResponse {
    pub formatted: String,
    pub artifact: WorkspaceExplorationArtifact,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentReasoningEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub text: String,
    pub is_complete: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WebSearchResponse {
    pub query: String,
    pub results: Vec<WebSearchResult>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Conversation {
    pub id: String,
    pub messages: Vec<ChatMessage>,
}

pub type AgentRunStatus = String;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentStartResponse {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub status: AgentRunStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentRunRequest {
    pub run_id: Option<String>,
    pub conversation_id: Option<String>,
    pub assistant_message_id: Option<String>,
    pub prompt: String,
    pub surface: Option<String>,
    pub cwd: Option<String>,
    pub model_id: Option<String>,
    pub terminal_model_id: Option<String>,
    pub messages: Option<Vec<AgentInputMessage>>,
    pub terminal_blocks: Option<Vec<TerminalCommandBlock>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentContinueRequest {
    pub run_id: Option<String>,
    pub conversation_id: String,
    pub assistant_message_id: Option<String>,
    pub surface: Option<String>,
    pub cwd: Option<String>,
    pub model_id: Option<String>,
    pub terminal_model_id: Option<String>,
    pub messages: Option<Vec<AgentInputMessage>>,
    pub terminal_blocks: Option<Vec<TerminalCommandBlock>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentInputMessage {
    pub role: String,
    pub content: String,
    pub tool_call_id: Option<String>,
    pub tool_calls: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentProviderConfigRequest {
    pub api_key: String,
    pub provider_id: Option<String>,
    pub base_url: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentProviderStatus {
    pub provider: String,
    pub provider_id: String,
    pub base_url: String,
    pub model_id: String,
    pub has_api_key: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentSourceModel {
    pub id: String,
    pub source_kind: String,
    pub label: String,
    pub provider: String,
    pub provider_id: Option<String>,
    pub model_id: String,
    pub note: String,
    pub supports_attachments: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentModelSourceStatus {
    pub kind: String,
    pub label: String,
    pub available: bool,
    pub connected: bool,
    pub binary_path: Option<String>,
    pub auth_source: Option<String>,
    pub message: Option<String>,
    pub models: Vec<AgentSourceModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ChatAttachmentKind {
    Text,
    Image,
    Binary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatAttachment {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub mime_type: Option<String>,
    pub kind: ChatAttachmentKind,
    pub content: Option<String>,
    pub truncated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentStatusEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub status: AgentRunStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentTokenEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentDoneEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub status: AgentRunStatus,
    pub usage: AgentUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentErrorEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentToolCall {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
    pub extra_content: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentToolCallEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub tool_call: AgentToolCall,
}

pub type ThinkingDisplayMode = String;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConfiguredModel {
    pub id: String,
    pub provider_id: Option<String>,
    pub provider_label: String,
    pub model_id: String,
    pub base_url: String,
    pub friendly_name: Option<String>,
    pub has_api_key: Option<bool>,
    pub supports_attachments: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FollowUpSuggestion {
    pub label: String,
    pub value: String,
    pub description: Option<String>,
    pub confidence: Option<f32>,
}

// ============================================================
// terminal.ts
// ============================================================

pub type TerminalStatus = String;
pub type TerminalSessionKind = String;
pub type TerminalSessionProvider = String;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalSessionInfo {
    pub id: String,
    pub shell: String,
    pub kind: TerminalSessionKind,
    pub provider: TerminalSessionProvider,
    pub status: TerminalStatus,
    pub cwd: Option<String>,
    pub profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalSessionTarget {
    pub kind: Option<TerminalSessionKind>,
    pub provider: Option<TerminalSessionProvider>,
    pub profile_id: Option<String>,
    pub environment: Option<String>,
    pub host: Option<String>,
    pub username: Option<String>,
    pub connection_method: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalDataEvent {
    pub session_id: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalExitEvent {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalSessionCwdEvent {
    pub session_id: String,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalSessionStateEvent {
    pub session_id: String,
    pub kind: TerminalSessionKind,
    pub provider: TerminalSessionProvider,
    pub status: TerminalStatus,
    pub cwd: Option<String>,
    pub profile_id: Option<String>,
}

pub type TerminalCompletionsFormat = String;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalShellCompletion {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalCompletionsStartedEvent {
    pub session_id: String,
    pub format: TerminalCompletionsFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalCompletionsFinishedEvent {
    pub session_id: String,
    pub data: Vec<TerminalShellCompletion>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalCompletionResultEvent {
    pub session_id: String,
    pub completion: TerminalShellCompletion,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalCompletionUpdateEvent {
    pub session_id: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalCompletionsPromptEvent {
    pub session_id: String,
}

pub type TerminalCompletionStatus = String;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalCompletionState {
    pub status: TerminalCompletionStatus,
    pub format: Option<TerminalCompletionsFormat>,
    pub prompt_visible: bool,
    pub completions: Vec<TerminalShellCompletion>,
    pub last_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalBlock {
    pub id: String,
    pub command: String,
    pub output: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<u64>,
}

pub type TerminalCommandPresentation = String;
pub type TerminalCommandSource = String;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalBlockEvent {
    pub session_id: String,
    pub kind: String,
    pub block: TerminalBlock,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalBlockOutputEvent {
    pub session_id: String,
    pub block_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalRunCommandResponse {
    pub block: TerminalBlock,
    pub output: String,
    pub pending: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalRuntimeContext {
    pub node_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalBlockSharedMeta {
    pub presentation: Option<TerminalCommandPresentation>,
    pub source: Option<TerminalCommandSource>,
    pub conversation_id: Option<String>,
    pub conversation_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TerminalCommandBlock {
    pub id: String,
    pub command: String,
    pub output: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<u64>,
    pub presentation: Option<TerminalCommandPresentation>,
    pub source: Option<TerminalCommandSource>,
    pub conversation_id: Option<String>,
    pub conversation_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileChangeApproval {
    pub kind: String,
    pub summary: Option<String>,
    pub file_diffs: Vec<FileDiff>,
    pub tool_call_id: Option<String>,
    pub refine_label: Option<String>,
    pub edit_label: Option<String>,
    pub accept_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RemoteCliInstallApproval {
    pub kind: String,
    pub command: String,
    pub tool_call_id: Option<String>,
    pub reason: Option<String>,
    pub username: Option<String>,
    pub host: Option<String>,
    pub provider: Option<String>,
    pub dismiss_storage_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum CommandApproval {
    Command {
        kind: Option<String>,
        command: String,
        tool_call_id: Option<String>,
        reason: Option<String>,
    },
    TopicChange {
        kind: String,
        reason: Option<String>,
        start_new_conversation_label: Option<String>,
        continue_conversation_label: Option<String>,
    },
    FileChange(FileChangeApproval),
    RemoteCliInstall(RemoteCliInstallApproval),
}

// ============================================================
// ui.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HelpItem {
    pub keys: Vec<String>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommandItem {
    pub label: String,
    pub detail: String,
    pub icon: String,
}

pub type ComposerMode = String;
pub type ShellModeSource = String;
pub type TrayContentMode = String;
pub type TrayMode = String;
pub type PanelMode = String;

// ============================================================
// diff.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffDelta {
    pub replacement_line_range: LineRange,
    pub insertion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LineRange {
    pub start: u32,
    pub end: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind")]
pub enum DiffType {
    Create { delta: DiffDelta },
    Update { deltas: Vec<DiffDelta>, rename: Option<String> },
    Delete { delta: DiffDelta },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileDiff {
    pub file_path: String,
    pub diff_type: DiffType,
    pub original_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind")]
pub enum ParsedDiff {
    StrReplace {
        file: Option<String>,
        search: Option<String>,
        replace: Option<String>,
    },
    V4A {
        file: Option<String>,
        move_to: Option<String>,
        hunks: Vec<V4AHunk>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct V4AHunk {
    pub change_context: Vec<String>,
    pub pre_context: String,
    pub old: String,
    pub new: String,
    pub post_context: String,
}

// ============================================================
// git.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GitRepoContext {
    pub root_path: String,
    pub current_branch: String,
    pub branches: Vec<String>,
}

// ============================================================
// filesystem.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FilesystemPathContext {
    pub home_dir: String,
    pub current_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FilesystemEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FilesystemDirectoryListing {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<FilesystemEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FilesystemSearchEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Vec<FilesystemSearchEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FilesystemSearchListing {
    pub current_path: String,
    pub entries: Vec<FilesystemSearchEntry>,
}

// ============================================================
// codeIndex.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CodeIndexProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub status: String,
    pub last_indexed_at: Option<String>,
    pub file_count: u32,
    pub total_bytes: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CodeIndexSearchResult {
    pub project_id: String,
    pub project_name: String,
    pub path: String,
    pub relative_path: String,
    pub language: String,
    pub snippet: String,
    pub score: f32,
}

// ============================================================
// model.ts
// ============================================================

pub type ModelProviderId = String;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelSpec {
    pub id: String,
    pub model_id: Option<String>,
    pub label: String,
    pub provider: String,
    pub provider_id: Option<ModelProviderId>,
    pub note: Option<String>,
    pub base_url: Option<String>,
    pub supports_attachments: Option<bool>,
}

// ============================================================
// memory.ts (additional types not in store/memory.rs)
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceChromeTab {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub subtitle: Option<String>,
    pub custom_label: Option<String>,
    pub tint_color: Option<String>,
    pub last_execution_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceConversation {
    pub id: String,
    pub title: String,
    pub time_label: String,
    pub branch_label: Option<String>,
    pub status: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub message_count: Option<u32>,
    pub model_id: Option<String>,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspacePaneLeafNode {
    pub r#type: String,
    pub pane_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspacePaneSplitNode {
    pub r#type: String,
    pub direction: String,
    pub children: Vec<WorkspacePaneNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum WorkspacePaneNode {
    Leaf(WorkspacePaneLeafNode),
    Split(WorkspacePaneSplitNode),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspacePaneLayout {
    pub active_pane_id: String,
    pub root: WorkspacePaneNode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceActivePaneContext {
    pub tab_kind: String,
    pub pane_id: Option<String>,
    pub launcher_session_id: Option<String>,
    pub working_directory: Option<String>,
    pub composer_surface: Option<String>,
    pub active_conversation_id: Option<String>,
    pub can_show_git_diff: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryTaskRecord {
    pub id: String,
    pub parent_task_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub status: String,
    pub exchange_ids: Vec<String>,
    pub child_task_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryExchangeRecord {
    pub id: String,
    pub task_id: String,
    pub parent_exchange_id: Option<String>,
    pub input_message_ids: Vec<String>,
    pub output_message_ids: Vec<String>,
    pub tool_call_ids: Vec<String>,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryArtifactRecord {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub data: HashMap<String, serde_json::Value>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryCloudObjectPutRequest {
    pub object: MemoryCloudObjectRecord,
    pub enqueue_sync: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryConversationPutRequest {
    pub conversation_id: String,
    pub title: Option<String>,
    pub model_id: Option<String>,
    pub cwd: Option<String>,
    pub status: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub terminal_blocks: Option<Vec<TerminalCommandBlock>>,
    pub artifacts: Option<Vec<MemoryArtifactRecord>>,
    pub server_conversation_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryConversationDeleteRequest {
    pub conversation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryWorkspacePutRequest {
    pub snapshot: MemoryWorkspaceSnapshot,
}

// ============================================================
// keybindings.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BackendKeybindingDefinition {
    pub command_id: String,
    pub title: String,
    pub category: String,
    pub scope: String,
    pub shortcut: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BackendShortcutCommandEvent {
    pub command_id: String,
}

// ============================================================
// skills.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SkillCatalogItem {
    pub name: String,
    pub description: String,
    pub path: String,
}

// ============================================================
// history.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShellHistoryEntry {
    pub value: String,
    pub executed_at: String,
    pub source: String,
    pub pwd: Option<String>,
}

pub type HistoryTab = String;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HistoryEntry {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub kind: String,
    pub created_at: String,
}

// ============================================================
// gitDiff.ts
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GitWorktreeDiffFile {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    pub patch: String,
    pub original_content: Option<String>,
    pub modified_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GitWorktreeDiff {
    pub is_repo: bool,
    pub repo_root: Option<String>,
    pub repo_name: Option<String>,
    pub branch: Option<String>,
    pub additions: u32,
    pub deletions: u32,
    pub files: Vec<GitWorktreeDiffFile>,
}

// ============================================================
// LauncherProps (from hooks/types.ts)
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LauncherProps {
    pub variant: Option<String>,
    pub initial_composer_surface: Option<String>,
    pub startup_commands: Option<Vec<String>>,
    pub initial_working_directory: Option<String>,
    pub initial_terminal_session_id: Option<String>,
    pub initial_agent_terminal_session_id: Option<String>,
    pub terminal_target: Option<TerminalSessionTarget>,
    pub agent_terminal_target: Option<TerminalSessionTarget>,
    pub persist_working_directory: Option<bool>,
    pub persist_terminal_session: Option<bool>,
    pub chat_mode: Option<String>,
    pub conversation_id: Option<String>,
    pub active: Option<bool>,
    pub title: Option<String>,
}

// ============================================================
// LauncherAppStateSlice
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LauncherAppStateSlice {
    pub is_launcher_window_visible: bool,
    pub is_onboarding_completed: bool,
    pub launcher_props: Option<LauncherProps>,
    pub panel_mode: PanelMode,
}



#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemorySyncState {
    pub status: String,
    pub server_token: Option<String>,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemoryMeta {
    pub schema_version: u32,
    pub device_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub sync_endpoint: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemorySettingsValues {
    pub selected_model_id: Option<String>,
    pub last_working_directory: Option<String>,
    pub terminal_auto_detect_enabled: Option<bool>,
    pub web_search_enabled: Option<bool>,
    pub thinking_display_mode: Option<String>,
    pub sync_endpoint: Option<String>,
    pub telemetry_enabled: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemorySettingsRecord {
    pub schema_version: u32,
    pub values: MemorySettingsValues,
    pub updated_at: String,
    pub last_synced_at: Option<String>,
    pub sync_token: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemoryWorkspaceSnapshot {
    pub id: String,
    pub schema_version: u32,
    pub tabs: Vec<WorkspaceChromeTab>,
    pub selected_tab_id: Option<String>,
    pub launcher_tab_id: Option<String>,
    pub pane_layouts_by_tab_id: Option<HashMap<String, WorkspacePaneLayout>>,
    pub pane_tab_ids: Option<Vec<String>>,
    pub pane_direction: Option<String>,
    pub conversations: Vec<WorkspaceConversation>,
    pub terminal_sessions: Option<HashMap<String, serde_json::Value>>,
    pub active_section_id: Option<String>,
    pub expanded_group_ids: Vec<String>,
    pub is_sidebar_open: bool,
    pub is_agents_active: bool,
    pub next_terminal_index: u32,
    pub next_conversation_index: u32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
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
    pub messages: Vec<ChatMessage>,
    pub terminal_blocks: Vec<TerminalCommandBlock>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemoryCloudObjectSummary {
    pub uid: String,
    pub kind: String,
    pub location: String,
    pub title: String,
    pub updated_at: String,
    pub sync_state: MemorySyncState,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemoryCloudObjectRecord {
    pub uid: String,
    pub kind: String,
    pub location: String,
    pub title: String,
    pub metadata: HashMap<String, serde_json::Value>,
    pub body: HashMap<String, serde_json::Value>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub sync_state: MemorySyncState,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemoryCloudObjectIndex {
    pub objects_by_uid: HashMap<String, MemoryCloudObjectSummary>,
    pub sorted_orders_by_location: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemoryCloudObjectIndexResponse {
    pub index: MemoryCloudObjectIndex,
    pub ordered_uids: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
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
