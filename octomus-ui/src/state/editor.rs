use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum EditorTabPresentation {
    #[default]
    File,
    ArtifactMarkdown,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EditorTab {
    pub id: String,
    pub path: String,
    pub name: String,
    pub is_dirty: bool,
    pub content: Option<String>,
    pub language: Option<String>,
    pub presentation: EditorTabPresentation,
    pub read_only: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EditorState {
    pub tabs: Vec<EditorTab>,
    pub active_tab_id: Option<String>,
}

fn get_language_from_path(path: &str) -> Option<String> {
    let ext = path.split(".").last()?.to_lowercase();
    let lang = match ext.as_str() {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" => "javascript",
        "json" => "json",
        "md" => "markdown",
        "css" => "css",
        "html" => "html",
        "rs" => "rust",
        "py" => "python",
        "go" => "go",
        "sh" => "shell",
        "yml" | "yaml" => "yaml",
        _ => "plaintext",
    };
    Some(lang.to_string())
}

impl EditorState {
    pub fn new() -> Self { Self::default() }

    pub fn open_file(
        &mut self,
        path: String,
        name: String,
        content: Option<String>,
        presentation: EditorTabPresentation,
        read_only: bool,
    ) {
        let is_artifact = matches!(presentation, EditorTabPresentation::ArtifactMarkdown);
        let next_tabs_base: Vec<EditorTab> = if is_artifact {
            vec![]
        } else {
            self.tabs
                .iter()
                .filter(|t| !matches!(t.presentation, EditorTabPresentation::ArtifactMarkdown))
                .cloned()
                .collect()
        };

        if let Some(existing) = next_tabs_base
            .iter()
            .find(|t| t.path == path && std::mem::discriminant(&t.presentation) == std::mem::discriminant(&presentation))
        {
            self.active_tab_id = Some(existing.id.clone());
            return;
        }

        let new_tab = EditorTab {
            id: format!("tab_{}", rand::random::<u64>()),
            path: path.clone(),
            name,
            is_dirty: false,
            content: content.clone(),
            language: get_language_from_path(&path),
            presentation,
            read_only,
        };

        let mut tabs = next_tabs_base;
        tabs.push(new_tab.clone());
        self.tabs = tabs;
        self.active_tab_id = Some(new_tab.id);
    }

    pub fn close_tab(&mut self, id: &str) {
        let new_tabs: Vec<EditorTab> = self.tabs.iter().filter(|t| t.id != id).cloned().collect();
        if self.active_tab_id.as_deref() == Some(id) {
            self.active_tab_id = new_tabs.last().map(|t| t.id.clone());
        }
        self.tabs = new_tabs;
    }

    pub fn close_all_tabs(&mut self) {
        self.tabs.clear();
        self.active_tab_id = None;
    }

    pub fn set_active_tab(&mut self, id: String) {
        self.active_tab_id = Some(id);
    }

    pub fn update_content(&mut self, id: &str, content: String) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.content = Some(content);
            tab.is_dirty = true;
        }
    }

    pub fn set_dirty(&mut self, id: &str, is_dirty: bool) {
        if let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) {
            tab.is_dirty = is_dirty;
        }
    }
}

#[derive(Debug, Clone)]
pub struct EditorStore {
    state: Arc<Mutex<EditorState>>,
}

impl EditorStore {
    pub fn new() -> Self { Self { state: Arc::new(Mutex::new(EditorState::new())) } }
    pub fn with_state<F, R>(&self, f: F) -> R where F: FnOnce(&mut EditorState) -> R { let mut guard = self.state.lock().unwrap(); f(&mut guard) }
    pub fn get_state(&self) -> EditorState { self.state.lock().unwrap().clone() }
}

impl Default for EditorStore { fn default() -> Self { Self::new() } }
