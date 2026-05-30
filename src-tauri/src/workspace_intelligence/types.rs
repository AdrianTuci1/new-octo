use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExplorationRequest {
    pub mode: Option<String>,
    pub query: Option<String>,
    pub path: Option<String>,
    pub cwd: Option<String>,
    pub max_results: Option<usize>,
    pub include_files: Option<bool>,
    pub include_directories: Option<bool>,
    pub recursive: Option<bool>,
    pub file_path: Option<String>,
    pub symbol: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExplorationResponse {
    pub formatted: String,
    pub artifact: WorkspaceExplorationArtifact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExplorationSearch {
    pub mode: String,
    pub source: String,
    pub query: String,
    pub result_count: usize,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExplorationFile {
    pub path: String,
    pub source: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExplorationDirectory {
    pub path: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExplorationEntry {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub detail: Option<String>,
    pub path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExplorationSegment {
    pub id: String,
    pub created_at: String,
    pub summary: Option<String>,
    pub entries: Vec<WorkspaceExplorationEntry>,
    pub searches: Vec<WorkspaceExplorationSearch>,
    pub files: Vec<WorkspaceExplorationFile>,
    pub directories: Vec<WorkspaceExplorationDirectory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExplorationArtifact {
    pub query: Option<String>,
    pub mode: Option<String>,
    pub path: Option<String>,
    pub summary: Option<String>,
    pub segments: Vec<WorkspaceExplorationSegment>,
    pub searches: Vec<WorkspaceExplorationSearch>,
    pub files: Vec<WorkspaceExplorationFile>,
    pub directories: Vec<WorkspaceExplorationDirectory>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExplorationMode {
    List,
    Search,
    Symbols,
    Definition,
    References,
    Diagnostics,
}

impl ExplorationMode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::List => "list",
            Self::Search => "search",
            Self::Symbols => "symbols",
            Self::Definition => "definition",
            Self::References => "references",
            Self::Diagnostics => "diagnostics",
        }
    }

    pub(crate) fn from_request(request: &WorkspaceExplorationRequest) -> Self {
        match request.mode.as_deref().map(str::trim) {
            Some("list") => Self::List,
            Some("symbols") => Self::Symbols,
            Some("definition") => Self::Definition,
            Some("references") => Self::References,
            Some("diagnostics") => Self::Diagnostics,
            Some("search") => Self::Search,
            _ => {
                if request.query.as_deref().unwrap_or_default().trim().is_empty()
                    && !request.path.as_deref().unwrap_or_default().trim().is_empty()
                {
                    Self::List
                } else {
                    Self::Search
                }
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum WorkspaceLanguage {
    Rust,
    TypeScript,
    Python,
    Go,
}

impl WorkspaceLanguage {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Rust => "rust",
            Self::TypeScript => "typescript",
            Self::Python => "python",
            Self::Go => "go",
        }
    }

    pub(crate) fn language_id(self) -> &'static str {
        match self {
            Self::Rust => "rust",
            Self::TypeScript => "typescript",
            Self::Python => "python",
            Self::Go => "go",
        }
    }

    pub(crate) fn from_extension(extension: &str) -> Option<Self> {
        match extension {
            "rs" => Some(Self::Rust),
            "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" => Some(Self::TypeScript),
            "py" => Some(Self::Python),
            "go" => Some(Self::Go),
            _ => None,
        }
    }

    pub(crate) fn server_candidates(self) -> &'static [(&'static str, &'static [&'static str])] {
        match self {
            Self::Rust => &[("rust-analyzer", &[])],
            Self::TypeScript => &[
                ("typescript-language-server", &["--stdio"]),
                ("vtsls", &["--stdio"]),
            ],
            Self::Python => &[
                ("basedpyright-langserver", &["--stdio"]),
                ("pyright-langserver", &["--stdio"]),
                ("pylsp", &[]),
            ],
            Self::Go => &[("gopls", &[])],
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct SemanticMatch {
    pub(crate) path: String,
    pub(crate) display_name: String,
    pub(crate) detail: String,
    pub(crate) snippet: Option<String>,
    pub(crate) source: String,
}

#[derive(Debug, Clone)]
pub(crate) struct SymbolTarget {
    pub(crate) path: PathBuf,
    pub(crate) line: u32,
    pub(crate) column: u32,
    pub(crate) language: WorkspaceLanguage,
}
