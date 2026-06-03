/// Workspace topbar tab state.
///
/// Mirrors the React `WorkspaceTopbarTab` component.
use super::types::WorkspaceChromeTab;

/// State for an individual topbar tab.
pub struct TopbarTabState {
    pub tab: WorkspaceChromeTab,
    pub is_active: bool,
    pub is_in_launcher: bool,
    pub is_editing: bool,
    pub draft_label: String,
    pub is_dragging: bool,
}

impl TopbarTabState {
    pub fn new(tab: WorkspaceChromeTab, is_active: bool, is_in_launcher: bool) -> Self {
        let draft_label = tab.custom_label.clone().unwrap_or_else(|| tab.label.clone());
        Self {
            tab,
            is_active,
            is_in_launcher,
            is_editing: false,
            draft_label,
            is_dragging: false,
        }
    }

    pub fn can_rename(&self) -> bool {
        !matches!(self.tab.kind, super::types::WorkspaceChromeTabKind::Settings)
    }

    pub fn begin_editing(&mut self) {
        if !self.can_rename() {
            return;
        }
        self.draft_label = self.tab.custom_label.clone().unwrap_or_else(|| self.tab.label.clone());
        self.is_editing = true;
    }

    pub fn commit_editing(&mut self) {
        let normalized = self.draft_label.trim().to_string();
        if !normalized.is_empty() {
            self.tab.custom_label = Some(normalized.clone());
            self.tab.label = normalized;
        } else {
            self.tab.custom_label = None;
        }
        self.is_editing = false;
    }

    pub fn cancel_editing(&mut self) {
        self.draft_label = self.tab.custom_label.clone().unwrap_or_else(|| self.tab.label.clone());
        self.is_editing = false;
    }

    pub fn set_draft_label(&mut self, label: String) {
        self.draft_label = label;
    }

    pub fn set_dragging(&mut self, dragging: bool) {
        self.is_dragging = dragging;
    }

    pub fn display_label(&self) -> String {
        self.tab.custom_label.clone().unwrap_or_else(|| self.tab.label.clone())
    }

    pub fn has_status_icon(&self) -> bool {
        self.tab.last_execution_status.is_some()
    }

    pub fn status_icon_type(&self) -> Option<&str> {
        self.tab.last_execution_status.as_deref()
    }
}
