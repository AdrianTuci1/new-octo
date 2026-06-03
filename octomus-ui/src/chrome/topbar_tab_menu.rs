/// Workspace topbar tab menu state.
///
/// Mirrors the React `WorkspaceTopbarTabMenu` component.
use super::types::WorkspaceChromeTab;

/// Available tab tint colors.
pub const TAB_TINTS: [&str; 6] = [
    "#334155",
    "#134e4a",
    "#365314",
    "#7c2d12",
    "#6b21a8",
    "#1d4ed8",
];

/// The tab context menu state.
pub struct TabMenuState {
    pub tab: Option<WorkspaceChromeTab>,
    pub tab_index: usize,
    pub tabs_length: usize,
    pub launcher_tab_id: Option<String>,
    pub position: Option<(f32, f32)>,
}

impl Default for TabMenuState {
    fn default() -> Self {
        Self {
            tab: None,
            tab_index: 0,
            tabs_length: 0,
            launcher_tab_id: None,
            position: None,
        }
    }
}

impl TabMenuState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_open(&self) -> bool {
        self.tab.is_some() && self.position.is_some()
    }

    pub fn open(&mut self, tab: WorkspaceChromeTab, tab_index: usize, tabs_length: usize, left: f32, top: f32) {
        self.tab = Some(tab);
        self.tab_index = tab_index;
        self.tabs_length = tabs_length;
        self.position = Some((left, top));
    }

    pub fn close(&mut self) {
        self.tab = None;
        self.position = None;
    }

    pub fn can_move_left(&self) -> bool {
        self.tab_index > 0
    }

    pub fn can_move_right(&self) -> bool {
        self.tab_index < self.tabs_length.saturating_sub(1)
    }

    pub fn can_close_others(&self) -> bool {
        self.tabs_length > 1
    }

    pub fn can_rename(&self) -> bool {
        self.tab.as_ref()
            .map(|t| !matches!(t.kind, super::types::WorkspaceChromeTabKind::Settings))
            .unwrap_or(false)
    }

    pub fn is_in_launcher(&self) -> bool {
        self.tab.as_ref()
            .map(|t| Some(t.id.clone()) == self.launcher_tab_id)
            .unwrap_or(false)
    }

    pub fn tint_color(&self) -> Option<&String> {
        self.tab.as_ref().and_then(|t| t.tint_color.as_ref())
    }
}
