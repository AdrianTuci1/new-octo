use std::collections::HashMap;

pub mod view;
pub mod line_numbers;
pub mod scroll;
pub mod selection;
pub mod tabs;

/// The main editor widget state.
///
/// Mirrors the editor concepts from the React `editorStore` and
/// `ShellWindow` editor integration.
pub struct EditorWidget {
    pub tabs: Vec<EditorTab>,
    pub active_tab_id: Option<String>,
    pub is_open: bool,
}

#[derive(Debug, Clone)]
pub struct EditorTab {
    pub id: String,
    pub label: String,
    pub path: Option<String>,
    pub content: String,
    pub language: String,
    pub is_modified: bool,
    pub is_active: bool,
}

impl Default for EditorWidget {
    fn default() -> Self {
        Self {
            tabs: Vec::new(),
            active_tab_id: None,
            is_open: false,
        }
    }
}

impl EditorWidget {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open_file(&mut self, path: String, label: String, content: String, language: String) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.path.as_ref() == Some(&path)) {
            tab.is_active = true;
            self.active_tab_id = Some(tab.id.clone());
        } else {
            let id = format!("editor_tab_{}", now_millis());
            let tab = EditorTab {
                id: id.clone(),
                label,
                path: Some(path),
                content,
                language,
                is_modified: false,
                is_active: true,
            };
            self.tabs.push(tab);
            self.active_tab_id = Some(id);
        }
        self.is_open = true;
        self.deactivate_other_tabs();
    }

    pub fn close_tab(&mut self, id: &str) {
        if let Some(pos) = self.tabs.iter().position(|t| t.id == id) {
            self.tabs.remove(pos);
        }
        if self.active_tab_id.as_deref() == Some(id) {
            self.active_tab_id = self.tabs.last().map(|t| t.id.clone());
        }
        if self.tabs.is_empty() {
            self.is_open = false;
            self.active_tab_id = None;
        }
    }

    pub fn select_tab(&mut self, id: &str) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.is_active = true;
            self.active_tab_id = Some(id.to_string());
            self.deactivate_other_tabs();
        }
    }

    pub fn rename_tab(&mut self, id: &str, label: String) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.label = label;
        }
    }

    pub fn set_tab_modified(&mut self, id: &str, modified: bool) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.is_modified = modified;
        }
    }

    pub fn active_tab(&self) -> Option<&EditorTab> {
        self.active_tab_id.as_ref().and_then(|id| self.tabs.iter().find(|t| &t.id == id))
    }

    pub fn active_tab_mut(&mut self) -> Option<&mut EditorTab> {
        let id = self.active_tab_id.clone()?;
        self.tabs.iter_mut().find(|t| t.id == id)
    }

    fn deactivate_other_tabs(&mut self) {
        if let Some(ref active_id) = self.active_tab_id {
            for tab in self.tabs.iter_mut() {
                if &tab.id != active_id {
                    tab.is_active = false;
                }
            }
        }
    }
}

fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
