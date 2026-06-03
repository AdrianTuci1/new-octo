/// Workspace chrome initial data.
///
/// Mirrors the React workspaceChromeData.ts module.
use super::types::{WorkspaceChromeTab, WorkspaceConversation, WorkspaceChromeTabKind};

/// Initial workspace chrome tabs.
pub fn initial_workspace_chrome_tabs() -> Vec<WorkspaceChromeTab> {
    vec![
        WorkspaceChromeTab {
            id: "terminal-main".to_string(),
            label: "~".to_string(),
            kind: WorkspaceChromeTabKind::Terminal,
            subtitle: None,
            custom_label: None,
            tint_color: None,
            last_execution_status: None,
        },
        WorkspaceChromeTab {
            id: "settings".to_string(),
            label: "Settings".to_string(),
            kind: WorkspaceChromeTabKind::Settings,
            subtitle: None,
            custom_label: None,
            tint_color: None,
            last_execution_status: None,
        },
    ]
}

/// The default active tab id.
pub const DEFAULT_WORKSPACE_CHROME_TAB_ID: &str = "terminal-main";

/// Initial workspace conversations.
pub fn initial_workspace_conversations() -> Vec<WorkspaceConversation> {
    Vec::new()
}
