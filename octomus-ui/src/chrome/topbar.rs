/// Workspace topbar state.
///
/// Mirrors the React `WorkspaceTopbar` component.
use super::types::{WorkspaceChromeTab, WorkspaceActivePaneContext};

/// A plus menu item in the topbar.
#[derive(Debug, Clone)]
pub struct PlusMenuItem {
    pub id: String,
    pub label: String,
    pub action: PlusMenuAction,
    pub shortcut: Option<String>,
    pub icon: String,
    pub has_chevron: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlusMenuAction {
    NewAgent,
    NewTerminal,
    NewCloudTerminal,
    NewCloudAgent,
    SaveCurrentConfig,
    None,
}

/// Default plus menu items.
pub fn default_plus_menu_items() -> Vec<PlusMenuItem> {
    vec![
        PlusMenuItem {
            id: "agent".to_string(),
            label: "Agent".to_string(),
            action: PlusMenuAction::NewAgent,
            shortcut: None,
            icon: "Sparkles".to_string(),
            has_chevron: false,
        },
        PlusMenuItem {
            id: "terminal".to_string(),
            label: "Terminal".to_string(),
            action: PlusMenuAction::NewTerminal,
            shortcut: Some("⌘T".to_string()),
            icon: "TerminalSquare".to_string(),
            has_chevron: false,
        },
        PlusMenuItem {
            id: "cloud-term".to_string(),
            label: "Cloud term".to_string(),
            action: PlusMenuAction::NewCloudTerminal,
            shortcut: None,
            icon: "Cloud".to_string(),
            has_chevron: false,
        },
        PlusMenuItem {
            id: "cloud-agent".to_string(),
            label: "Cloud agent".to_string(),
            action: PlusMenuAction::NewCloudAgent,
            shortcut: None,
            icon: "Sparkles".to_string(),
            has_chevron: false,
        },
        PlusMenuItem {
            id: "create-tab-config".to_string(),
            label: "Create tab config".to_string(),
            action: PlusMenuAction::SaveCurrentConfig,
            shortcut: None,
            icon: "Plus".to_string(),
            has_chevron: false,
        },
        PlusMenuItem {
            id: "update-tab-config".to_string(),
            label: "Update tab config".to_string(),
            action: PlusMenuAction::None,
            shortcut: None,
            icon: "Server".to_string(),
            has_chevron: true,
        },
        PlusMenuItem {
            id: "tab-configs".to_string(),
            label: "Tab configs".to_string(),
            action: PlusMenuAction::None,
            shortcut: None,
            icon: "Server".to_string(),
            has_chevron: true,
        },
        PlusMenuItem {
            id: "worktree-config".to_string(),
            label: "New worktree config".to_string(),
            action: PlusMenuAction::None,
            shortcut: None,
            icon: "GitBranch".to_string(),
            has_chevron: true,
        },
    ]
}

/// Default plus item id.
pub const DEFAULT_PLUS_ITEM_ID: &str = "terminal";

/// Tab config summary.
#[derive(Debug, Clone)]
pub struct TabConfigSummary {
    pub display_name: String,
    pub file_name: String,
    pub path: String,
}

/// Git diff summary for the topbar.
#[derive(Debug, Clone)]
pub struct GitDiffSummary {
    pub is_repo: bool,
    pub additions: u32,
    pub deletions: u32,
}

/// The workspace topbar state.
pub struct WorkspaceTopbar {
    pub active_tab_id: String,
    pub launcher_tab_id: Option<String>,
    pub tabs: Vec<WorkspaceChromeTab>,
    pub active_pane_context: Option<WorkspaceActivePaneContext>,
    pub is_sidebar_open: bool,
    pub is_agents_active: bool,
    pub menu_tab_id: Option<String>,
    pub menu_position: Option<(f32, f32)>,
    pub account_menu_open: bool,
    pub account_menu_position: Option<(f32, f32)>,
    pub plus_menu_open: bool,
    pub plus_menu_position: Option<(f32, f32)>,
    pub selected_plus_item_id: String,
    pub default_plus_item_id: String,
    pub tab_config_panel_mode: TabConfigPanelMode,
    pub tab_configs: Vec<TabConfigSummary>,
    pub is_tab_configs_loading: bool,
    pub git_diff_summary: Option<GitDiffSummary>,
    pub is_code_review_drawer_open: bool,
    pub dragged_tab_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TabConfigPanelMode {
    Browse,
    Edit,
}

impl Default for WorkspaceTopbar {
    fn default() -> Self {
        Self {
            active_tab_id: super::data::DEFAULT_WORKSPACE_CHROME_TAB_ID.to_string(),
            launcher_tab_id: None,
            tabs: super::data::initial_workspace_chrome_tabs(),
            active_pane_context: None,
            is_sidebar_open: false,
            is_agents_active: false,
            menu_tab_id: None,
            menu_position: None,
            account_menu_open: false,
            account_menu_position: None,
            plus_menu_open: false,
            plus_menu_position: None,
            selected_plus_item_id: "agent".to_string(),
            default_plus_item_id: DEFAULT_PLUS_ITEM_ID.to_string(),
            tab_config_panel_mode: TabConfigPanelMode::Browse,
            tab_configs: Vec::new(),
            is_tab_configs_loading: false,
            git_diff_summary: None,
            is_code_review_drawer_open: false,
            dragged_tab_id: None,
        }
    }
}

impl WorkspaceTopbar {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn active_tab(&self) -> Option<&WorkspaceChromeTab> {
        self.tabs.iter().find(|t| t.id == self.active_tab_id)
    }

    pub fn menu_tab(&self) -> Option<&WorkspaceChromeTab> {
        self.menu_tab_id.as_ref().and_then(|id| self.tabs.iter().find(|t| t.id == *id))
    }

    pub fn menu_tab_index(&self) -> usize {
        self.menu_tab_id.as_ref()
            .and_then(|id| self.tabs.iter().position(|t| t.id == *id))
            .unwrap_or(0)
    }

    pub fn can_move_tab_left(&self, tab_id: &str) -> bool {
        self.tabs.iter().position(|t| t.id == tab_id).unwrap_or(0) > 0
    }

    pub fn can_move_tab_right(&self, tab_id: &str) -> bool {
        let idx = self.tabs.iter().position(|t| t.id == tab_id).unwrap_or(0);
        idx < self.tabs.len().saturating_sub(1)
    }

    pub fn can_close_others(&self) -> bool {
        self.tabs.len() > 1
    }

    pub fn should_show_git_diff(&self) -> bool {
        self.active_pane_context.as_ref()
            .map(|ctx| ctx.can_show_git_diff)
            .unwrap_or(true)
            && self.active_tab().map(|t| !matches!(t.kind, super::types::WorkspaceChromeTabKind::Settings)).unwrap_or(true)
    }

    pub fn open_menu(&mut self, tab_id: String, left: f32, top: f32) {
        self.menu_tab_id = Some(tab_id);
        self.menu_position = Some((left, top));
    }

    pub fn close_menu(&mut self) {
        self.menu_tab_id = None;
        self.menu_position = None;
    }

    pub fn open_account_menu(&mut self, left: f32, top: f32) {
        self.account_menu_open = true;
        self.account_menu_position = Some((left, top));
    }

    pub fn close_account_menu(&mut self) {
        self.account_menu_open = false;
        self.account_menu_position = None;
    }

    pub fn open_plus_menu(&mut self, left: f32, top: f32) {
        self.plus_menu_open = true;
        self.plus_menu_position = Some((left, top));
        self.selected_plus_item_id = self.default_plus_item_id.clone();
        self.tab_config_panel_mode = TabConfigPanelMode::Browse;
    }

    pub fn close_plus_menu(&mut self) {
        self.plus_menu_open = false;
        self.plus_menu_position = None;
    }

    pub fn select_plus_item(&mut self, id: String) {
        self.selected_plus_item_id = id;
    }

    pub fn set_default_plus_item(&mut self, id: String) {
        self.default_plus_item_id = id;
    }

    pub fn move_tab_to_index(&mut self, tab_id: &str, target_index: usize) {
        let from_index = self.tabs.iter().position(|t| t.id == tab_id).unwrap_or(0);
        if from_index >= self.tabs.len() || target_index >= self.tabs.len() || from_index == target_index {
            return;
        }
        let tab = self.tabs.remove(from_index);
        let insert_index = if target_index > from_index { target_index } else { target_index };
        self.tabs.insert(insert_index, tab);
    }

    pub fn remove_tab(&mut self, tab_id: &str) {
        self.tabs.retain(|t| t.id != tab_id);
        if self.active_tab_id == tab_id {
            self.active_tab_id = self.tabs.first().map(|t| t.id.clone()).unwrap_or_default();
        }
        if self.launcher_tab_id.as_deref() == Some(tab_id) {
            self.launcher_tab_id = None;
        }
    }

    pub fn add_tab(&mut self, tab: WorkspaceChromeTab) {
        self.tabs.push(tab);
    }

    pub fn rename_tab(&mut self, tab_id: &str, label: Option<String>) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == tab_id) {
            tab.custom_label = label.clone();
            tab.label = label.unwrap_or_else(|| tab.label.clone());
        }
    }

    pub fn set_tab_tint(&mut self, tab_id: &str, tint: Option<String>) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == tab_id) {
            tab.tint_color = tint;
        }
    }

    pub fn bring_tab_in_launcher(&mut self, tab_id: String) {
        self.launcher_tab_id = Some(tab_id);
    }

    pub fn remove_tab_from_launcher(&mut self) {
        self.launcher_tab_id = None;
    }

    pub fn close_other_tabs(&mut self, keep_tab_id: &str) {
        self.tabs.retain(|t| t.id == keep_tab_id);
        self.active_tab_id = keep_tab_id.to_string();
        if self.launcher_tab_id.as_deref() == Some(keep_tab_id) {
            // keep launcher binding
        } else {
            self.launcher_tab_id = None;
        }
    }

    pub fn close_tabs_to_right(&mut self, tab_id: &str) {
        if let Some(idx) = self.tabs.iter().position(|t| t.id == tab_id) {
            self.tabs.truncate(idx + 1);
        }
    }

    pub fn select_tab(&mut self, tab_id: String) {
        self.active_tab_id = tab_id;
    }

    pub fn toggle_sidebar(&mut self) {
        self.is_sidebar_open = !self.is_sidebar_open;
    }

    pub fn toggle_agents(&mut self) {
        self.is_agents_active = !self.is_agents_active;
    }

    pub fn toggle_code_review_drawer(&mut self) {
        self.is_code_review_drawer_open = !self.is_code_review_drawer_open;
    }

    pub fn set_git_diff_summary(&mut self, summary: Option<GitDiffSummary>) {
        self.git_diff_summary = summary;
    }

    pub fn set_dragged_tab(&mut self, tab_id: Option<String>) {
        self.dragged_tab_id = tab_id;
    }
}
