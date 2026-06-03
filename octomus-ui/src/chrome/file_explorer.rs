/// File explorer state.
///
/// Mirrors the React `FileExplorer` component.
#[derive(Debug, Clone)]
pub struct FileExplorerEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_open: bool,
    pub children: Option<Vec<FileExplorerEntry>>,
    pub is_loading: bool,
}

#[derive(Debug, Clone)]
pub struct FileExplorer {
    pub tree: Vec<FileExplorerEntry>,
    pub loading: bool,
    pub error: Option<String>,
    pub context_menu_visible: bool,
    pub context_menu_position: (f32, f32),
    pub context_menu_node: Option<String>,
    pub initial_path: Option<String>,
}

impl Default for FileExplorer {
    fn default() -> Self {
        Self {
            tree: Vec::new(),
            loading: true,
            error: None,
            context_menu_visible: false,
            context_menu_position: (0.0, 0.0),
            context_menu_node: None,
            initial_path: None,
        }
    }
}

impl FileExplorer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_initial_path(path: String) -> Self {
        Self {
            initial_path: Some(path),
            ..Default::default()
        }
    }

    pub fn set_tree(&mut self, tree: Vec<FileExplorerEntry>) {
        self.tree = tree;
        self.loading = false;
    }

    pub fn set_error(&mut self, error: Option<String>) {
        self.error = error;
        self.loading = false;
    }

    pub fn toggle_folder(&mut self, path: &str) {
        if let Some(entry) = self.find_entry_mut(path) {
            if entry.is_directory {
                entry.is_open = !entry.is_open;
            }
        }
    }

    pub fn open_folder(&mut self, path: &str) {
        if let Some(entry) = self.find_entry_mut(path) {
            if entry.is_directory {
                entry.is_open = true;
            }
        }
    }

    pub fn set_children(&mut self, path: &str, children: Vec<FileExplorerEntry>) {
        if let Some(entry) = self.find_entry_mut(path) {
            if entry.is_directory {
                entry.children = Some(children);
                entry.is_loading = false;
            }
        }
    }

    pub fn set_loading(&mut self, path: &str, loading: bool) {
        if let Some(entry) = self.find_entry_mut(path) {
            entry.is_loading = loading;
        }
    }

    pub fn show_context_menu(&mut self, path: String, x: f32, y: f32) {
        self.context_menu_visible = true;
        self.context_menu_position = (x, y);
        self.context_menu_node = Some(path);
    }

    pub fn hide_context_menu(&mut self) {
        self.context_menu_visible = false;
        self.context_menu_node = None;
    }

    pub fn find_entry(&self, path: &str) -> Option<&FileExplorerEntry> {
        Self::find_in_nodes(&self.tree, path)
    }

    pub fn find_entry_mut(&mut self, path: &str) -> Option<&mut FileExplorerEntry> {
        Self::find_in_nodes_mut(&mut self.tree, path)
    }

    fn find_in_nodes<'a>(nodes: &'a [FileExplorerEntry], path: &str) -> Option<&'a FileExplorerEntry> {
        for node in nodes {
            if node.path == path {
                return Some(node);
            }
            if let Some(ref children) = node.children {
                if let Some(found) = Self::find_in_nodes(children, path) {
                    return Some(found);
                }
            }
        }
        None
    }

    fn find_in_nodes_mut<'a>(nodes: &'a mut [FileExplorerEntry], path: &str) -> Option<&'a mut FileExplorerEntry> {
        for node in nodes {
            if node.path == path {
                return Some(node);
            }
            if let Some(ref mut children) = node.children {
                if let Some(found) = Self::find_in_nodes_mut(children, path) {
                    return Some(found);
                }
            }
        }
        None
    }

    /// Get the file extension from a name.
    pub fn file_extension(name: &str) -> Option<&str> {
        name.rfind('.').map(|idx| &name[idx + 1..])
    }

    /// Check if a file name matches a known image/icon type.
    pub fn icon_for_file(name: &str) -> Option<&'static str> {
        let ext = Self::file_extension(name)?.to_lowercase();
        match ext.as_str() {
            "ts" | "tsx" | "mts" | "cts" => Some("typescript"),
            "js" | "jsx" | "mjs" | "cjs" => Some("javascript"),
            "css" | "scss" | "sass" | "less" => Some("css"),
            "json" => Some("json"),
            "md" | "markdown" => Some("markdown"),
            "py" => Some("python"),
            "go" => Some("go"),
            "rs" => Some("rust"),
            "php" => Some("php"),
            "cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx" => Some("cpp"),
            "c" | "h" => Some("c"),
            "kt" | "kts" => Some("kotlin"),
            "wasm" => Some("wasm"),
            "tf" | "tfvars" | "hcl" => Some("terraform"),
            "sql" => Some("sql"),
            _ => None,
        }
    }
}
