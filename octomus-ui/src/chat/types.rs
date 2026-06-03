use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum MessageRole {
    #[default]
    User,
    Assistant,
    System,
    Tool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum AgentRunStatus {
    #[default]
    Queued,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum ToolKind {
    #[default]
    Command,
    WebSearch,
    Plan,
    FileChange,
    WorkspaceExploration,
    FileRead,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum WebSearchStatus {
    #[default]
    Searching,
    Success,
    Error,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum FileDiffPreviewStatus {
    #[default]
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum ThinkingDisplayMode {
    #[default]
    AlwaysShow,
    NeverShow,
    ShowAndCollapse,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum TerminalCommandPresentation {
    #[default]
    Command,
    ConversationLink,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum TerminalCommandSource {
    #[default]
    User,
    Assistant,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum TerminalStatus {
    #[default]
    Starting,
    Connecting,
    Running,
    Connected,
    Exited,
    Error,
    Disconnected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlanStep {
    pub id: String,
    pub label: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlanWorkstream {
    pub id: String,
    pub title: String,
    pub status: String,
    pub step_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlanArtifact {
    pub id: String,
    pub title: String,
    pub summary: Option<String>,
    pub version: Option<String>,
    pub steps: Vec<ExecutionPlanStep>,
    pub workstreams: Option<Vec<ExecutionPlanWorkstream>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceExplorationSearch {
    pub mode: String,
    pub source: String,
    pub query: String,
    pub result_count: u32,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceExplorationFile {
    pub path: String,
    pub source: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceExplorationDirectory {
    pub path: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceExplorationEntry {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub detail: Option<String>,
    pub path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceExplorationSegment {
    pub id: String,
    pub created_at: String,
    pub summary: Option<String>,
    pub entries: Vec<WorkspaceExplorationEntry>,
    pub searches: Vec<WorkspaceExplorationSearch>,
    pub files: Vec<WorkspaceExplorationFile>,
    pub directories: Vec<WorkspaceExplorationDirectory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFileReadArtifact {
    pub path: String,
    pub display_path: String,
    pub content: String,
    pub start_line: Option<u32>,
    pub end_line: Option<u32>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffDelta {
    pub replacement_line_range: LineRange,
    pub insertion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineRange {
    pub start: u32,
    pub end: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiffType {
    Create { delta: DiffDelta },
    Update { deltas: Vec<DiffDelta>, rename: Option<String> },
    Delete { delta: DiffDelta },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub file_path: String,
    pub diff_type: DiffType,
    pub original_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalCommandBlock {
    pub id: String,
    pub command: String,
    pub output: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<u64>,
    pub status: String,
    pub presentation: TerminalCommandPresentation,
    pub source: TerminalCommandSource,
    pub conversation_id: Option<String>,
    pub conversation_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandApproval {
    pub kind: String,
    pub command: Option<String>,
    pub summary: Option<String>,
    pub file_diffs: Option<Vec<FileDiff>>,
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: MessageRole,
    pub title: String,
    pub body: String,
    pub created_at: Option<String>,
    pub conversation_id: Option<String>,
    pub run_id: Option<String>,
    pub is_streaming: bool,
    pub is_error: bool,
    pub status: Option<AgentRunStatus>,
    pub tool_call_id: Option<String>,
    pub file_diffs: Option<Vec<FileDiff>>,
    pub file_change_status: Option<FileDiffPreviewStatus>,
    pub message_kind: Option<String>,
    pub thinking_duration_seconds: Option<u32>,
    pub has_native_thinking: bool,
    pub parent_message_id: Option<String>,
    pub tool_kind: Option<ToolKind>,
    pub web_search_status: Option<WebSearchStatus>,
    pub web_search_query: Option<String>,
    pub web_search_results: Option<Vec<WebSearchResult>>,
    pub workspace_exploration: Option<WorkspaceExplorationArtifact>,
    pub workspace_file_read: Option<WorkspaceFileReadArtifact>,
    pub execution_plan: Option<ExecutionPlanArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubAgentCall {
    pub id: String,
    pub name: String,
    pub task: String,
    pub status: String,
    pub avatar_url: Option<String>,
    pub result: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineItem {
    pub id: String,
    pub kind: TimelineItemKind,
    pub at: u64,
    pub order: usize,
    pub message: Option<ChatMessage>,
    pub block: Option<TerminalCommandBlock>,
    pub agent_block: Option<MultiAgentBlockData>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum TimelineItemKind {
    #[default]
    Message,
    TerminalBlock,
    MultiAgentBlock,
    TerminalError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiAgentBlockData {
    pub agent_name: String,
    pub task_summary: String,
    pub status: String,
    pub color_scheme: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageBubbleViewModel {
    pub display_file_diffs: Vec<FileDiff>,
    pub extracted_file_diffs: Vec<FileDiff>,
    pub file_preview_status: FileDiffPreviewStatus,
    pub inline_file_change_approval: Option<CommandApproval>,
    pub is_user: bool,
    pub raw_visible_body: String,
    pub show_streaming_hint: bool,
    pub visible_body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageBlock {
    Thinking {
        body: String,
        duration_seconds: Option<u32>,
    },
    WebSearch {
        status: WebSearchStatus,
        results: Vec<WebSearchResult>,
        query: Option<String>,
    },
    WorkspaceExploration {
        exploration: WorkspaceExplorationArtifact,
    },
    FileRead {
        artifact: WorkspaceFileReadArtifact,
    },
    CodeDisplay {
        code: String,
        title: Option<String>,
        status: FileDiffPreviewStatus,
        detail: Option<String>,
    },
    FileArtifact {
        artifact: FileDiff,
    },
    ImplementationPlan {
        title: String,
        version: String,
    },
    MultiAgent {
        agent_name: String,
        task_summary: String,
        status: String,
        color_scheme: Option<String>,
    },
    Terminal {
        block: TerminalCommandBlock,
        is_expanded: bool,
        is_selected: bool,
    },
    NewConversation,
}
