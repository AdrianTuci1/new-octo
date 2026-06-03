/// Code settings section state.
///
/// Mirrors the React `CodeSettingsSections.tsx` — both CodebaseIndexing and EditorCodeReview.
#[derive(Debug, Clone)]
pub struct CodeSettings {
    pub indexing: CodeIndexingSettings,
    pub editor: EditorSettings,
}

#[derive(Debug, Clone)]
pub struct CodeIndexingSettings {
    pub enabled: bool,
    pub index_new_folders_by_default: bool,
    pub projects: Vec<CodeIndexProject>,
    pub search_query: String,
}

#[derive(Debug, Clone)]
pub struct CodeIndexProject {
    pub id: String,
    pub path: String,
    pub status: CodeIndexStatus,
    pub file_count: usize,
    pub total_bytes: u64,
    pub last_indexed_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodeIndexStatus {
    Indexed,
    Failed,
    Indexing,
}

#[derive(Debug, Clone)]
pub struct EditorSettings {
    pub file_links_editor: FileLinksEditor,
    pub code_review_editor: CodeReviewEditor,
    pub warp_open_layout: WarpOpenLayout,
    pub group_files_into_single_editor_pane: bool,
    pub open_markdown_in_viewer: bool,
    pub auto_open_code_review_panel: bool,
    pub show_code_review_button: bool,
    pub show_diff_stats_on_code_review_button: bool,
    pub project_explorer: bool,
    pub global_file_search: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileLinksEditor {
    DefaultApp,
    Warp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodeReviewEditor {
    Warp,
    DefaultApp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WarpOpenLayout {
    SplitPane,
    CurrentPane,
    NewTab,
}

impl Default for CodeSettings {
    fn default() -> Self {
        Self {
            indexing: CodeIndexingSettings {
                enabled: true,
                index_new_folders_by_default: false,
                projects: Vec::new(),
                search_query: String::new(),
            },
            editor: EditorSettings {
                file_links_editor: FileLinksEditor::DefaultApp,
                code_review_editor: CodeReviewEditor::Warp,
                warp_open_layout: WarpOpenLayout::SplitPane,
                group_files_into_single_editor_pane: false,
                open_markdown_in_viewer: true,
                auto_open_code_review_panel: false,
                show_code_review_button: true,
                show_diff_stats_on_code_review_button: false,
                project_explorer: false,
                global_file_search: false,
            },
        }
    }
}

impl CodeSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn patch_indexing(&mut self, patch: CodeIndexingSettings,
    ) {
        self.indexing = patch;
    }

    pub fn patch_editor(&mut self, patch: EditorSettings,
    ) {
        self.editor = patch;
    }
}

/// Format a byte count into a human-readable string.
pub fn format_bytes(value: u64) -> String {
    if value == 0 {
        return "0 B".to_string();
    }
    let units = ["B", "KB", "MB", "GB"];
    let mut size = value as f64;
    let mut unit_index = 0usize;
    while size >= 1024.0 && unit_index < units.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    if size >= 10.0 || unit_index == 0 {
        format!("{:.0} {}", size, units[unit_index])
    } else {
        format!("{:.1} {}", size, units[unit_index])
    }
}
