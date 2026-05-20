use std::{
    collections::{hash_map::DefaultHasher, HashSet},
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::UNIX_EPOCH,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::octomus_paths::OctomusPaths;

const INDEX_SCHEMA_VERSION: u32 = 1;
const MAX_FILE_BYTES: u64 = 256 * 1024;
const MAX_FILES_PER_PROJECT: usize = 5_000;
const MAX_TOTAL_BYTES_PER_PROJECT: u64 = 50 * 1024 * 1024;

const DEFAULT_IGNORED_DIRS: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".turbo",
    ".venv",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
];

const INDEXED_EXTENSIONS: &[&str] = &[
    "c", "cc", "cpp", "cs", "css", "go", "h", "hpp", "html", "java", "js", "jsx", "json", "kt",
    "lua", "md", "mjs", "py", "rb", "rs", "sh", "sql", "swift", "toml", "ts", "tsx", "txt", "vue",
    "xml", "yaml", "yml", "zig",
];

#[derive(Clone)]
pub struct CodeIndexManager {
    root: Arc<PathBuf>,
    lock: Arc<Mutex<()>>,
}

impl Default for CodeIndexManager {
    fn default() -> Self {
        Self {
            root: Arc::new(OctomusPaths::default().root),
            lock: Arc::new(Mutex::new(())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeIndexProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub status: String,
    pub last_indexed_at: Option<String>,
    pub file_count: usize,
    pub total_bytes: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeIndexDocument {
    pub project_id: String,
    pub path: String,
    pub relative_path: String,
    pub language: String,
    pub modified_at: Option<String>,
    pub size: u64,
    pub hash: String,
    pub snippet: String,
    pub terms: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeIndexSearchResult {
    pub project_id: String,
    pub project_name: String,
    pub path: String,
    pub relative_path: String,
    pub language: String,
    pub snippet: String,
    pub score: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeIndexStore {
    schema_version: u32,
    projects: Vec<CodeIndexProject>,
    documents: Vec<CodeIndexDocument>,
    updated_at: String,
}

impl Default for CodeIndexStore {
    fn default() -> Self {
        Self {
            schema_version: INDEX_SCHEMA_VERSION,
            projects: Vec::new(),
            documents: Vec::new(),
            updated_at: now_string(),
        }
    }
}

#[tauri::command]
pub fn code_index_list_projects(
    manager: tauri::State<'_, CodeIndexManager>,
) -> Result<Vec<CodeIndexProject>, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "code index lock is poisoned".to_string())?;
    Ok(read_store(&manager.index_path()).projects)
}

#[tauri::command]
pub fn code_index_index_project(
    manager: tauri::State<'_, CodeIndexManager>,
    path: String,
) -> Result<CodeIndexProject, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "code index lock is poisoned".to_string())?;
    let project_path = normalize_project_path(&path)?;
    let project_id = project_id_for_path(&project_path);
    let mut store = read_store(&manager.index_path());
    store
        .documents
        .retain(|document| document.project_id != project_id);

    let mut project = CodeIndexProject {
        id: project_id.clone(),
        name: project_name(&project_path),
        path: project_path.to_string_lossy().to_string(),
        status: "indexing".to_string(),
        last_indexed_at: None,
        file_count: 0,
        total_bytes: 0,
        error: None,
    };

    match index_project_documents(&project_path, &project_id) {
        Ok(documents) => {
            project.file_count = documents.len();
            project.total_bytes = documents.iter().map(|document| document.size).sum();
            project.status = "indexed".to_string();
            project.last_indexed_at = Some(now_string());
            store.documents.extend(documents);
        }
        Err(error) => {
            project.status = "failed".to_string();
            project.error = Some(error);
            project.last_indexed_at = Some(now_string());
        }
    }

    store.projects.retain(|entry| entry.id != project.id);
    store.projects.push(project.clone());
    store
        .projects
        .sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    store.updated_at = now_string();
    write_store(&manager.index_path(), &store)?;

    if project.status == "failed" {
        return Err(project
            .error
            .clone()
            .unwrap_or_else(|| "indexing failed".to_string()));
    }

    Ok(project)
}

#[tauri::command]
pub fn code_index_remove_project(
    manager: tauri::State<'_, CodeIndexManager>,
    project_id: String,
) -> Result<(), String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "code index lock is poisoned".to_string())?;
    let mut store = read_store(&manager.index_path());
    store.projects.retain(|project| project.id != project_id);
    store
        .documents
        .retain(|document| document.project_id != project_id);
    store.updated_at = now_string();
    write_store(&manager.index_path(), &store)
}

#[tauri::command]
pub fn code_index_search(
    manager: tauri::State<'_, CodeIndexManager>,
    query: String,
    project_id: Option<String>,
    max_results: Option<usize>,
) -> Result<Vec<CodeIndexSearchResult>, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "code index lock is poisoned".to_string())?;
    let query_tokens = tokenize(&query);
    if query_tokens.is_empty() {
        return Ok(Vec::new());
    }

    let store = read_store(&manager.index_path());
    let project_lookup = store
        .projects
        .iter()
        .map(|project| (project.id.as_str(), project.name.as_str()))
        .collect::<Vec<_>>();
    let mut results = store
        .documents
        .iter()
        .filter(|document| {
            project_id
                .as_ref()
                .map_or(true, |id| &document.project_id == id)
        })
        .filter_map(|document| {
            let haystack = format!(
                "{}\n{}\n{}",
                document.relative_path.to_lowercase(),
                document.language.to_lowercase(),
                document.terms
            );
            let mut score = 0_u32;
            for token in &query_tokens {
                if document.relative_path.to_lowercase().contains(token) {
                    score += 12;
                }
                if haystack.contains(token) {
                    score += 3;
                }
            }
            if score == 0 {
                return None;
            }

            let project_name = project_lookup
                .iter()
                .find(|(id, _)| *id == document.project_id)
                .map(|(_, name)| (*name).to_string())
                .unwrap_or_else(|| "Indexed project".to_string());

            Some(CodeIndexSearchResult {
                project_id: document.project_id.clone(),
                project_name,
                path: document.path.clone(),
                relative_path: document.relative_path.clone(),
                language: document.language.clone(),
                snippet: document.snippet.clone(),
                score,
            })
        })
        .collect::<Vec<_>>();

    results.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    results.truncate(max_results.unwrap_or(20).clamp(1, 50));
    Ok(results)
}

pub fn code_index_context_for_cwd(cwd: &str, query: &str, max_results: usize) -> Option<String> {
    let cwd_path = PathBuf::from(cwd).canonicalize().ok()?;
    let store = read_store(
        &OctomusPaths::default()
            .root
            .join("code_index")
            .join("v1")
            .join("index.json"),
    );
    let project = store
        .projects
        .iter()
        .filter(|project| project.status == "indexed")
        .filter_map(|project| {
            let project_path = PathBuf::from(&project.path).canonicalize().ok()?;
            cwd_path
                .starts_with(&project_path)
                .then_some((project, project_path))
        })
        .max_by_key(|(_, project_path)| project_path.components().count())
        .map(|(project, _)| project)?;

    let query_tokens = tokenize(query);
    let mut documents = store
        .documents
        .iter()
        .filter(|document| document.project_id == project.id)
        .map(|document| {
            let haystack = format!(
                "{} {}",
                document.relative_path.to_lowercase(),
                document.terms
            );
            let mut score = 0_u32;
            for token in &query_tokens {
                if document.relative_path.to_lowercase().contains(token) {
                    score += 12;
                }
                if haystack.contains(token) {
                    score += 3;
                }
            }
            if score == 0 {
                score = document
                    .relative_path
                    .matches('/')
                    .count()
                    .saturating_sub(1) as u32;
            }
            (score, document)
        })
        .collect::<Vec<_>>();

    documents.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| left.1.relative_path.cmp(&right.1.relative_path))
    });
    documents.truncate(max_results.max(1));
    if documents.is_empty() {
        return None;
    }

    let lines = documents
        .into_iter()
        .map(|(score, document)| {
            let snippet = if document.snippet.is_empty() {
                String::new()
            } else {
                format!(" — {}", document.snippet)
            };
            format!(
                "- {} [{} score {}]{}",
                document.relative_path, document.language, score, snippet
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    Some(format!(
        "CONTEXT INDEX CODEBASE:\n- project: {}\n- indexed files: {}\n- matching files:\n{}\nREGULĂ INDEX: folosește aceste piste ca hartă inițială. Pentru conținut exact, cere/read-only command sau propune inspectarea fișierului relevant înainte de modificări.",
        project.name,
        project.file_count,
        indent_block(&lines, 2)
    ))
}

impl CodeIndexManager {
    fn index_dir(&self) -> PathBuf {
        self.root.join("code_index").join("v1")
    }

    fn index_path(&self) -> PathBuf {
        self.index_dir().join("index.json")
    }
}

fn index_project_documents(
    project_path: &Path,
    project_id: &str,
) -> Result<Vec<CodeIndexDocument>, String> {
    let ignore_rules = IgnoreRules::load(project_path);
    let mut documents = Vec::new();
    let mut visited_dirs = HashSet::new();
    let mut total_bytes = 0_u64;
    scan_dir(
        project_path,
        project_path,
        project_id,
        &ignore_rules,
        &mut visited_dirs,
        &mut total_bytes,
        &mut documents,
    )?;
    Ok(documents)
}

fn scan_dir(
    root: &Path,
    current: &Path,
    project_id: &str,
    ignore_rules: &IgnoreRules,
    visited_dirs: &mut HashSet<PathBuf>,
    total_bytes: &mut u64,
    documents: &mut Vec<CodeIndexDocument>,
) -> Result<(), String> {
    if documents.len() >= MAX_FILES_PER_PROJECT || *total_bytes >= MAX_TOTAL_BYTES_PER_PROJECT {
        return Ok(());
    }

    let canonical = current
        .canonicalize()
        .unwrap_or_else(|_| current.to_path_buf());
    if !visited_dirs.insert(canonical) {
        return Ok(());
    }

    let entries = fs::read_dir(current)
        .map_err(|error| format!("failed to read '{}': {error}", current.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        if metadata.is_dir() {
            if should_ignore_dir(&name) || ignore_rules.matches(&relative_path, true) {
                continue;
            }
            scan_dir(
                root,
                &path,
                project_id,
                ignore_rules,
                visited_dirs,
                total_bytes,
                documents,
            )?;
            continue;
        }

        if !metadata.is_file()
            || metadata.len() > MAX_FILE_BYTES
            || *total_bytes + metadata.len() > MAX_TOTAL_BYTES_PER_PROJECT
            || !is_indexable_extension(&path)
            || ignore_rules.matches(&relative_path, false)
        {
            continue;
        }

        let Ok(contents) = fs::read_to_string(&path) else {
            continue;
        };
        if contents.contains('\0') {
            continue;
        }

        let snippet = build_snippet(&contents);
        let terms = build_terms(&contents);
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs().to_string());

        *total_bytes += metadata.len();
        documents.push(CodeIndexDocument {
            project_id: project_id.to_string(),
            path: path.to_string_lossy().to_string(),
            relative_path,
            language: language_for_path(&path),
            modified_at,
            size: metadata.len(),
            hash: content_hash(&contents),
            snippet,
            terms,
        });

        if documents.len() >= MAX_FILES_PER_PROJECT || *total_bytes >= MAX_TOTAL_BYTES_PER_PROJECT {
            break;
        }
    }
    Ok(())
}

#[derive(Default)]
struct IgnoreRules {
    patterns: Vec<String>,
}

impl IgnoreRules {
    fn load(root: &Path) -> Self {
        let Ok(contents) = fs::read_to_string(root.join(".gitignore")) else {
            return Self::default();
        };

        let patterns = contents
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with('!'))
            .map(|line| line.trim_start_matches('/').to_string())
            .collect();
        Self { patterns }
    }

    fn matches(&self, relative_path: &str, is_dir: bool) -> bool {
        let normalized = relative_path.trim_start_matches("./");
        let file_name = normalized.rsplit('/').next().unwrap_or(normalized);
        self.patterns.iter().any(|pattern| {
            let pattern = pattern.trim();
            if pattern.is_empty() {
                return false;
            }

            if let Some(dir_pattern) = pattern.strip_suffix('/') {
                return is_dir
                    && (file_name == dir_pattern
                        || normalized.starts_with(&format!("{dir_pattern}/")));
            }

            if pattern.contains('*') {
                return wildcard_match(pattern, normalized) || wildcard_match(pattern, file_name);
            }

            pattern == normalized
                || pattern == file_name
                || normalized.starts_with(&format!("{pattern}/"))
        })
    }
}

fn normalize_project_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("project path cannot be empty".to_string());
    }

    let path = PathBuf::from(trimmed)
        .canonicalize()
        .map_err(|error| format!("failed to open '{trimmed}': {error}"))?;
    if !path.is_dir() {
        return Err(format!("'{}' is not a directory", path.display()));
    }
    Ok(path)
}

fn project_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Indexed project")
        .to_string()
}

fn project_id_for_path(path: &Path) -> String {
    format!("project_{:x}", hash_value(&path.to_string_lossy()))
}

fn should_ignore_dir(name: &str) -> bool {
    DEFAULT_IGNORED_DIRS.iter().any(|ignored| ignored == &name)
}

fn is_indexable_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            INDEXED_EXTENSIONS
                .iter()
                .any(|allowed| allowed.eq_ignore_ascii_case(extension))
        })
        .unwrap_or(false)
}

fn language_for_path(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_lowercase())
        .unwrap_or_else(|| "text".to_string())
}

fn build_snippet(contents: &str) -> String {
    contents
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("")
        .chars()
        .take(360)
        .collect()
}

fn build_terms(contents: &str) -> String {
    tokenize(contents)
        .into_iter()
        .take(1_200)
        .collect::<Vec<_>>()
        .join(" ")
}

fn tokenize(value: &str) -> Vec<String> {
    value
        .split(|character: char| {
            !character.is_ascii_alphanumeric() && character != '_' && character != '-'
        })
        .filter_map(|part| {
            let normalized = part.trim().to_lowercase();
            (normalized.len() >= 2).then_some(normalized)
        })
        .collect()
}

fn content_hash(value: &str) -> String {
    format!("{:x}", hash_value(value))
}

fn hash_value<T: Hash + ?Sized>(value: &T) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    if pattern == "*" {
        return true;
    }

    let parts = pattern.split('*').collect::<Vec<_>>();
    if parts.len() == 1 {
        return pattern == value;
    }

    let mut remainder = value;
    for (index, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        let Some(position) = remainder.find(part) else {
            return false;
        };
        if index == 0 && !pattern.starts_with('*') && position != 0 {
            return false;
        }
        remainder = &remainder[position + part.len()..];
    }

    pattern.ends_with('*') || parts.last().map_or(true, |last| remainder.ends_with(last))
}

fn read_store(path: &Path) -> CodeIndexStore {
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<CodeIndexStore>(&contents).ok())
        .filter(|store| store.schema_version == INDEX_SCHEMA_VERSION)
        .unwrap_or_default()
}

fn write_store(path: &Path, store: &CodeIndexStore) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create code index directory: {error}"))?;
    }

    let temp_path = path.with_extension("tmp");
    let contents = serde_json::to_string_pretty(store)
        .map_err(|error| format!("failed to serialize code index: {error}"))?;
    fs::write(&temp_path, contents)
        .map_err(|error| format!("failed to write code index: {error}"))?;
    fs::rename(&temp_path, path).map_err(|error| format!("failed to replace code index: {error}"))
}

fn now_string() -> String {
    Utc::now().to_rfc3339()
}

fn indent_block(value: &str, spaces: usize) -> String {
    let prefix = " ".repeat(spaces);
    value
        .lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}
