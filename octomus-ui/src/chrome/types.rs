/// Workspace chrome types.
///
/// Mirrors the React `workspaceChromeTypes.ts` module.

/// The kind of a workspace chrome tab.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceChromeTabKind {
    Tools,
    Agents,
    Terminal,
    Conversation,
    Settings,
}

/// Direction for pane splitting.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspacePaneDirection {
    Horizontal,
    Vertical,
}

/// A tab in the workspace chrome topbar.
#[derive(Debug, Clone)]
pub struct WorkspaceChromeTab {
    pub id: String,
    pub label: String,
    pub kind: WorkspaceChromeTabKind,
    pub subtitle: Option<String>,
    pub custom_label: Option<String>,
    pub tint_color: Option<String>,
    pub last_execution_status: Option<String>,
}

/// A conversation entry for the sidebar.
#[derive(Debug, Clone)]
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

/// A leaf node in the pane tree.
#[derive(Debug, Clone)]
pub struct WorkspacePaneLeafNode {
    pub pane_id: String,
}

/// A split node in the pane tree.
#[derive(Debug, Clone)]
pub struct WorkspacePaneSplitNode {
    pub direction: WorkspacePaneDirection,
    pub children: Vec<WorkspacePaneNode>,
}

/// A node in the pane layout tree.
#[derive(Debug, Clone)]
pub enum WorkspacePaneNode {
    Leaf(WorkspacePaneLeafNode),
    Split(WorkspacePaneSplitNode),
}

/// The overall pane layout.
#[derive(Debug, Clone)]
pub struct WorkspacePaneLayout {
    pub active_pane_id: String,
    pub root: WorkspacePaneNode,
}

/// Context about the active pane.
#[derive(Debug, Clone)]
pub struct WorkspaceActivePaneContext {
    pub tab_kind: WorkspaceChromeTabKind,
    pub pane_id: Option<String>,
    pub launcher_session_id: Option<String>,
    pub working_directory: Option<String>,
    pub composer_surface: Option<String>,
    pub active_conversation_id: Option<String>,
    pub can_show_git_diff: bool,
}
