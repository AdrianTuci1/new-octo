use std::{
    collections::BTreeSet,
    env, fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemPathContext {
    pub home_dir: String,
    pub current_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemDirectoryListing {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<FilesystemEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileRequest {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirectoryEntriesRequest {
    pub path: Option<String>,
    pub query: Option<String>,
    pub directories_only: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathRequest {
    pub path: Option<String>,
}

pub fn terminal_list_commands() -> Result<Vec<String>, String> {
    let mut commands = BTreeSet::new();

    for path in env::split_paths(&env::var_os("PATH").unwrap_or_default()) {
        let Ok(entries) = fs::read_dir(path) else {
            continue;
        };

        for entry in entries.flatten() {
            let entry_path = entry.path();
            if !is_executable_command(&entry_path) {
                continue;
            }

            let Some(file_name) = entry_path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            if !file_name.is_empty() {
                commands.insert(file_name.to_string());
            }
        }
    }

    Ok(commands.into_iter().collect())
}

pub fn terminal_get_path_context() -> Result<FilesystemPathContext, String> {
    let home_dir = home_dir()
        .ok_or_else(|| "home directory was not found".to_string())?
        .to_string_lossy()
        .to_string();
    let current_dir = env::current_dir()
        .map_err(|error| format!("failed to read current directory: {error}"))?
        .to_string_lossy()
        .to_string();

    Ok(FilesystemPathContext {
        home_dir,
        current_dir,
    })
}

pub fn terminal_list_directory_entries(
    request: ListDirectoryEntriesRequest,
) -> Result<FilesystemDirectoryListing, String> {
    let target_path = request
        .path
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or(
            env::current_dir()
                .map_err(|error| format!("failed to read current directory: {error}"))?,
        );
    let normalized_path = target_path
        .canonicalize()
        .map_err(|error| format!("failed to open '{}': {error}", target_path.display()))?;
    let directories_only = request.directories_only.unwrap_or(true);
    let normalized_query = request.query.unwrap_or_default().trim().to_lowercase();
    let allow_hidden = normalized_query.starts_with('.');
    let mut entries = Vec::new();

    for entry in fs::read_dir(&normalized_path)
        .map_err(|error| format!("failed to read '{}': {error}", normalized_path.display()))?
        .flatten()
    {
        let entry_path = entry.path();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };

        let is_directory = metadata.is_dir();
        if directories_only && !is_directory {
            continue;
        }

        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };

        if name.starts_with('.') && !allow_hidden {
            continue;
        }

        if !normalized_query.is_empty() && !name.to_lowercase().starts_with(&normalized_query) {
            continue;
        }

        entries.push(FilesystemEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory,
        });
    }

    entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));

    Ok(FilesystemDirectoryListing {
        current_path: normalized_path.to_string_lossy().to_string(),
        parent_path: normalized_path
            .parent()
            .map(|path| path.to_string_lossy().to_string()),
        entries,
    })
}

pub fn terminal_read_file(request: PathRequest) -> Result<String, String> {
    let path = resolve_request_path(request.path)?;
    if !path.is_file() {
        return Err(format!("'{}' is not a file", path.display()));
    }

    fs::read_to_string(&path)
        .map_err(|error| format!("failed to read '{}': {error}", path.display()))
}

pub fn terminal_write_file(request: WriteFileRequest) -> Result<(), String> {
    let path = PathBuf::from(&request.path);
    fs::write(&path, &request.content)
        .map_err(|error| format!("failed to write to '{}': {error}", path.display()))
}

pub fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME").map(PathBuf::from)
}

pub fn resolve_request_path(path: Option<String>) -> Result<PathBuf, String> {
    path.filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or(
            env::current_dir()
                .map_err(|error| format!("failed to read current directory: {error}"))?,
        )
        .canonicalize()
        .map_err(|error| format!("failed to resolve path: {error}"))
}

#[cfg(unix)]
pub fn is_executable_command(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };

    metadata.is_file() && metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
pub fn is_executable_command(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
}
