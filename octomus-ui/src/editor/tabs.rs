
/// File tabs state for the editor widget.
///
/// Mirrors the React `tabs` editor sub-component and the `editorStore` tab model.
#[derive(Debug, Clone)]
pub struct EditorTabs {
    pub tabs: Vec<FileTab>,
    pub active_tab_id: Option<String>,
    pub tab_order: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct FileTab {
    pub id: String,
    pub label: String,
    pub path: Option<String>,
    pub language: String,
    pub is_modified: bool,
    pub tint: Option<String>,
}

impl Default for EditorTabs {
    fn default() -> Self {
        Self {
            tabs: Vec::new(),
            active_tab_id: None,
            tab_order: Vec::new(),
        }
    }
}

impl EditorTabs {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_tab(&mut self, id: String, label: String, path: Option<String>, language: String) {
        if !self.tabs.iter().any(|t| t.id == id) {
            self.tabs.push(FileTab {
                id: id.clone(),
                label,
                path,
                language,
                is_modified: false,
                tint: None,
            });
            self.tab_order.push(id.clone());
        }
        self.active_tab_id = Some(id);
    }

    pub fn close_tab(&mut self, id: &str) {
        self.tabs.retain(|t| t.id != id);
        self.tab_order.retain(|t| t != id);
        if self.active_tab_id.as_deref() == Some(id) {
            self.active_tab_id = self.tab_order.last().cloned();
        }
    }

    pub fn select_tab(&mut self, id: &str) {
        if self.tabs.iter().any(|t| t.id == id) {
            self.active_tab_id = Some(id.to_string());
        }
    }

    pub fn move_tab(&mut self, id: &str, direction: TabMoveDirection) {
        let pos = match self.tab_order.iter().position(|t| t == id) {
            Some(p) => p,
            None => return,
        };
        let new_pos = match direction {
            TabMoveDirection::Left => pos.saturating_sub(1),
            TabMoveDirection::Right => (pos + 1).min(self.tab_order.len().saturating_sub(1)),
        };
        if new_pos != pos {
            let tab_id = self.tab_order.remove(pos);
            self.tab_order.insert(new_pos, tab_id);
        }
    }

    pub fn set_tab_label(&mut self, id: &str, label: String) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.label = label;
        }
    }

    pub fn set_tab_modified(&mut self, id: &str, modified: bool) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.is_modified = modified;
        }
    }

    pub fn set_tab_tint(&mut self, id: &str, tint: Option<String>) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.tint = tint;
        }
    }

    pub fn active_tab(&self) -> Option<&FileTab> {
        self.active_tab_id.as_ref().and_then(|id| self.tabs.iter().find(|t| &t.id == id))
    }

    pub fn tab_by_path(&self, path: &str) -> Option<&FileTab> {
        self.tabs.iter().find(|t| t.path.as_deref() == Some(path))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TabMoveDirection {
    Left,
    Right,
}
