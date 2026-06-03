use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkspaceChromeTabKind {
    #[default]
    Tools,
    Agents,
    Terminal,
    Conversation,
    Settings,
}

impl WorkspaceChromeTabKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            WorkspaceChromeTabKind::Tools => "tools",
            WorkspaceChromeTabKind::Agents => "agents",
            WorkspaceChromeTabKind::Terminal => "terminal",
            WorkspaceChromeTabKind::Conversation => "conversation",
            WorkspaceChromeTabKind::Settings => "settings",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceChromeTab {
    pub id: String,
    pub label: String,
    pub kind: WorkspaceChromeTabKind,
    pub subtitle: Option<String>,
    pub custom_label: Option<String>,
    pub tint_color: Option<String>,
    pub last_execution_status: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceConversation {
    pub id: String,
    pub title: String,
    pub time_label: String,
    pub branch_label: Option<String>,
    pub status: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub message_count: Option<usize>,
    pub model_id: Option<String>,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkspacePaneDirection {
    #[default]
    Horizontal,
    Vertical,
}

impl WorkspacePaneDirection {
    pub fn as_str(&self) -> &'static str {
        match self {
            WorkspacePaneDirection::Horizontal => "horizontal",
            WorkspacePaneDirection::Vertical => "vertical",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WorkspacePaneNode {
    #[serde(rename = "leaf")]
    Leaf { pane_id: String },
    #[serde(rename = "split")]
    Split {
        direction: WorkspacePaneDirection,
        children: Vec<WorkspacePaneNode>,
    },
}

impl Default for WorkspacePaneNode {
    fn default() -> Self {
        WorkspacePaneNode::Leaf { pane_id: String::new() }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspacePaneLayout {
    pub active_pane_id: String,
    pub root: WorkspacePaneNode,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceActivePaneContext {
    pub tab_kind: WorkspaceChromeTabKind,
    pub pane_id: Option<String>,
    pub launcher_session_id: Option<String>,
    pub working_directory: Option<String>,
    pub composer_surface: Option<String>,
    pub active_conversation_id: Option<String>,
    pub can_show_git_diff: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspacePanelPlaceholderProps {
    pub title: String,
    pub description: String,
    pub eyebrow: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SettingsSidebarLeafItem {
    pub kind: String,
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SettingsSidebarGroupItem {
    pub kind: String,
    pub id: String,
    pub label: String,
    pub default_expanded: bool,
    pub children: Vec<SettingsSidebarLeafItem>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SettingsSidebarHeadingItem {
    pub kind: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum SettingsSidebarItem {
    #[serde(rename = "leaf")]
    Leaf(SettingsSidebarLeafItem),
    #[serde(rename = "group")]
    Group(SettingsSidebarGroupItem),
    #[serde(rename = "heading")]
    Heading(SettingsSidebarHeadingItem),
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum SettingsSectionContentKind {
    #[default]
    Placeholder,
    Profile,
    OctoAgent,
    Knowledge,
    Appearance,
    Profiles,
    McpServers,
    KeyboardShortcuts,
    ThirdPartyCliAgents,
    CloudTerminals,
    CodeIndexing,
    EditorCodeReview,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SettingsSectionMeta {
    pub title: String,
    pub description: String,
    pub content_kind: SettingsSectionContentKind,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct KeyboardShortcutKey {
    pub label: String,
    pub accent: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct KeyboardShortcutBinding {
    pub keys: Vec<KeyboardShortcutKey>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct KeyboardShortcutRow {
    pub command: String,
    pub bindings: Vec<KeyboardShortcutBinding>,
}
