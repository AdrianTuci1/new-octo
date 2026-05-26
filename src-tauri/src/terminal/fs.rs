use std::{
    collections::BTreeSet,
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::OnceLock,
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemSearchEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Vec<FilesystemSearchEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemSearchListing {
    pub current_path: String,
    pub entries: Vec<FilesystemSearchEntry>,
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
pub struct SearchDirectoryEntriesRequest {
    pub path: Option<String>,
    pub query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathRequest {
    pub path: Option<String>,
}

pub fn terminal_list_commands() -> Result<Vec<String>, String> {
    Ok(discover_shell_command_names().into_iter().collect())
}

pub fn discover_shell_command_names() -> BTreeSet<String> {
    static CACHE: OnceLock<BTreeSet<String>> = OnceLock::new();
    CACHE
        .get_or_init(discover_shell_command_names_uncached)
        .clone()
}

fn discover_shell_command_names_uncached() -> BTreeSet<String> {
    collect_command_names_from_directories(discover_shell_path_directories())
}

fn collect_command_names_from_directories(directories: Vec<PathBuf>) -> BTreeSet<String> {
    let mut commands = BTreeSet::new();

    for path in directories {
        let Ok(entries) = fs::read_dir(&path) else {
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

    commands
}

fn discover_shell_path_directories() -> Vec<PathBuf> {
    let mut directories = BTreeSet::<PathBuf>::new();

    if let Some(path_value) = env::var_os("PATH") {
        collect_path_directories(&path_value.to_string_lossy(), &mut directories);
    }

    if let Some(shell_path_value) = read_user_shell_path() {
        collect_path_directories(&shell_path_value, &mut directories);
    }

    collect_common_user_command_directories(&mut directories);
    directories.into_iter().collect()
}

fn collect_path_directories(value: &str, directories: &mut BTreeSet<PathBuf>) {
    for entry in value.split([':', '\n']) {
        let trimmed = entry.trim();
        if trimmed.is_empty() {
            continue;
        }

        let path = PathBuf::from(trimmed);
        if path.is_dir() {
            directories.insert(path);
        }
    }
}

fn read_user_shell_path() -> Option<String> {
    let shell = env::var_os("SHELL").map(PathBuf::from)?;
    if !shell.exists() {
        return None;
    }

    let shell_name = shell
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let script = if shell_name == "fish" {
        "string join : $PATH"
    } else {
        "printf '%s\\n' \"$PATH\""
    };

    read_shell_output_with_timeout(
        &shell,
        &["-l", "-i", "-c", script],
        Duration::from_millis(1_500),
    )
    .or_else(|| {
        read_shell_output_with_timeout(&shell, &["-l", "-c", script], Duration::from_millis(1_000))
    })
    .or_else(|| {
        read_shell_output_with_timeout(&shell, &["-c", script], Duration::from_millis(1_000))
    })
}

fn read_shell_output_with_timeout(
    shell: &Path,
    args: &[&str],
    timeout: Duration,
) -> Option<String> {
    let mut child = Command::new(shell)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let started_at = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = child.wait_with_output().ok()?;
                if !status.success() {
                    return None;
                }

                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return (!stdout.is_empty()).then_some(stdout);
            }
            Ok(None) if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(_) => return None,
        }
    }
}

fn collect_common_user_command_directories(directories: &mut BTreeSet<PathBuf>) {
    for path in [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
    ] {
        let path = PathBuf::from(path);
        if path.is_dir() {
            directories.insert(path);
        }
    }

    let Some(home) = home_dir() else {
        return;
    };

    for suffix in [
        ".local/bin",
        "bin",
        ".cargo/bin",
        ".bun/bin",
        ".npm-global/bin",
        "Library/pnpm",
    ] {
        let path = home.join(suffix);
        if path.is_dir() {
            directories.insert(path);
        }
    }
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

        let name_matches = name.to_lowercase().contains(&normalized_query);
        let path_matches = entry_path
            .to_string_lossy()
            .to_lowercase()
            .contains(&normalized_query);

        if !normalized_query.is_empty() && !name_matches && !path_matches {
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

pub fn terminal_search_directory_entries(
    request: SearchDirectoryEntriesRequest,
) -> Result<FilesystemSearchListing, String> {
    const MAX_SEARCH_RESULTS: usize = 64;

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
    let normalized_query = request.query.trim().to_lowercase();

    if normalized_query.is_empty() {
        return Ok(FilesystemSearchListing {
            current_path: normalized_path.to_string_lossy().to_string(),
            entries: Vec::new(),
        });
    }

    let allow_hidden = normalized_query.starts_with('.');
    let mut entries = Vec::new();

    let walker = WalkDir::new(&normalized_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            if allow_hidden {
                true
            } else {
                !entry.file_name().to_string_lossy().starts_with('.')
            }
        });

    for entry in walker.filter_map(Result::ok).skip(1) {
        if entries.len() >= MAX_SEARCH_RESULTS {
            break;
        }

        let file_type = entry.file_type();
        let path = entry.path().to_path_buf();
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };

        if !allow_hidden && name.starts_with('.') {
            continue;
        }

        let name_matches = name.to_lowercase().contains(&normalized_query);
        let path_key = path.to_string_lossy().to_string();
        let path_matches = path_key.to_lowercase().contains(&normalized_query);

        if name_matches || path_matches {
            entries.push(FilesystemSearchEntry {
                name,
                path: path_key,
                is_directory: file_type.is_dir(),
                children: Vec::new(),
            });
        }
    }

    entries.sort_by(|left, right| left.path.to_lowercase().cmp(&right.path.to_lowercase()));

    Ok(FilesystemSearchListing {
        current_path: normalized_path.to_string_lossy().to_string(),
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

#[cfg(test)]
mod tests {
    use super::{
        collect_command_names_from_directories, terminal_list_directory_entries,
        ListDirectoryEntriesRequest,
    };
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn command_discovery_collects_executables_from_path_directories() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!("octomus-command-path-{unique}"));
        fs::create_dir_all(&temp_root).expect("temp command directory should be created");

        let executable = temp_root.join("modal-test-bin");
        let non_executable = temp_root.join("not-a-command");
        fs::write(&executable, "#!/bin/sh\n").expect("executable should be written");
        fs::write(&non_executable, "nope").expect("non-executable should be written");

        #[cfg(unix)]
        {
            let mut permissions = fs::metadata(&executable)
                .expect("executable metadata should exist")
                .permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&executable, permissions)
                .expect("executable permissions should be applied");
        }

        let commands = collect_command_names_from_directories(vec![PathBuf::from(&temp_root)]);

        assert!(commands.contains("modal-test-bin"));
        #[cfg(unix)]
        assert!(!commands.contains("not-a-command"));

        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn directory_list_matches_substrings_in_names_and_paths() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!("octomus-dir-search-{unique}"));
        let nested_dir = temp_root.join("project").join("src");
        let matching_file = temp_root.join("composer_bar.rs");

        fs::create_dir_all(&nested_dir).expect("nested directory should be created");
        fs::write(&matching_file, "fn main() {}").expect("matching file should exist");

        let listing = terminal_list_directory_entries(ListDirectoryEntriesRequest {
            path: Some(temp_root.to_string_lossy().to_string()),
            query: Some("bar".to_string()),
            directories_only: Some(false),
        })
        .expect("directory listing should succeed");

        assert!(listing
            .entries
            .iter()
            .any(|entry| entry.name == "composer_bar.rs"));

        let _ = fs::remove_dir_all(temp_root);
    }

    #[test]
    fn search_listing_matches_nested_directories_and_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!("octomus-dir-search-recursive-{unique}"));
        let nested_dir = temp_root.join("project").join("src");
        let matching_file = nested_dir.join("composer_bar.rs");
        let matching_dir = temp_root.join("project").join("bar-folder");

        fs::create_dir_all(&nested_dir).expect("nested directory should be created");
        fs::create_dir_all(&matching_dir).expect("matching directory should be created");
        fs::write(&matching_file, "fn main() {}").expect("matching file should exist");

        let listing =
            super::terminal_search_directory_entries(super::SearchDirectoryEntriesRequest {
                path: Some(temp_root.to_string_lossy().to_string()),
                query: "bar".to_string(),
            })
            .expect("search listing should succeed");

        let mut found_file = false;
        let mut found_directory = false;

        fn visit(
            entries: &[super::FilesystemSearchEntry],
            found_file: &mut bool,
            found_directory: &mut bool,
        ) {
            for entry in entries {
                if entry.name == "composer_bar.rs" {
                    *found_file = true;
                }

                if entry.name == "bar-folder" && entry.is_directory {
                    *found_directory = true;
                }

                visit(&entry.children, found_file, found_directory);
            }
        }

        visit(&listing.entries, &mut found_file, &mut found_directory);

        assert!(found_file);
        assert!(found_directory);

        let _ = fs::remove_dir_all(temp_root);
    }
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
