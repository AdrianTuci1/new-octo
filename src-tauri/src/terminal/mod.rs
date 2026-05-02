mod ansi;
mod block;
mod pty;
mod session;

use std::{
    collections::BTreeSet,
    collections::HashMap,
    env,
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    thread,
};

use chrono::{DateTime, Duration, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

pub use block::TerminalBlock;
use pty::spawn_terminal;
use session::{SharedTerminalSession, TerminalSessionInfo};

use self::ansi::{clean_terminal_text, HookParser, TerminalStreamEvent};

const EVENT_DATA: &str = "terminal:data";
const EVENT_BLOCK: &str = "terminal:block";
const EVENT_BLOCK_OUTPUT: &str = "terminal:block-output";
const EVENT_EXIT: &str = "terminal:exit";

#[derive(Clone, Default)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, SharedTerminalSession>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalSessionRequest {
    pub rows: Option<u16>,
    pub cols: Option<u16>,
    pub cwd: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeTerminalSessionRequest {
    pub session_id: String,
    pub rows: u16,
    pub cols: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteTerminalSessionRequest {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTerminalCommandRequest {
    pub session_id: String,
    pub command: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDataEvent {
    pub session_id: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitEvent {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalBlockOutputEvent {
    pub session_id: String,
    pub block_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalRunCommandResponse {
    pub block: TerminalBlock,
    pub output: String,
}

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
pub struct GitRepoContext {
    pub root_path: String,
    pub current_branch: String,
    pub branches: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellHistoryEntry {
    pub value: String,
    pub executed_at: String,
    pub source: String,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchSwitchRequest {
    pub path: Option<String>,
    pub branch: String,
}

impl TerminalManager {
    fn insert(&self, session: SharedTerminalSession) -> Result<(), String> {
        self.sessions
            .lock()
            .map_err(|_| "terminal session map lock is poisoned".to_string())?
            .insert(session.id.clone(), session);
        Ok(())
    }

    fn get(&self, session_id: &str) -> Result<SharedTerminalSession, String> {
        self.sessions
            .lock()
            .map_err(|_| "terminal session map lock is poisoned".to_string())?
            .get(session_id)
            .cloned()
            .ok_or_else(|| format!("terminal session '{session_id}' was not found"))
    }

    fn remove(&self, session_id: &str) -> Option<SharedTerminalSession> {
        self.sessions.lock().ok()?.remove(session_id)
    }
}

#[tauri::command]
pub fn terminal_create_session(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    request: CreateTerminalSessionRequest,
) -> Result<TerminalSessionInfo, String> {
    let rows = request.rows.unwrap_or(24).max(2);
    let cols = request.cols.unwrap_or(80).max(2);
    let spawned = spawn_terminal(rows, cols, request.cwd)?;
    let session = Arc::new(spawned.session);
    let info = session.info();
    let manager_handle = manager.inner().clone();

    manager.insert(session.clone())?;
    spawn_reader_thread(app, manager_handle, session, spawned.reader);

    Ok(info)
}

#[tauri::command]
pub fn terminal_write(
    manager: State<'_, TerminalManager>,
    request: WriteTerminalSessionRequest,
) -> Result<(), String> {
    manager.get(&request.session_id)?.write(&request.data)
}

#[tauri::command]
pub fn terminal_run_command(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    request: RunTerminalCommandRequest,
) -> Result<TerminalRunCommandResponse, String> {
    let session = manager.get(&request.session_id)?;
    let command = request.command.trim();

    if command.is_empty() {
        return Err("terminal command cannot be empty".to_string());
    }

    let events = session
        .with_blocks(|blocks| blocks.begin_command(&session.id, command.to_string()))
        .unwrap_or_default();
    let block = events
        .first()
        .map(|event| event.block.clone())
        .ok_or_else(|| "failed to create terminal command block".to_string())?;

    for event in events {
        let _ = app.emit(EVENT_BLOCK, event);
    }

    let output = run_shell_command(&session.shell, session.cwd.as_deref(), command);
    let (exit_code, output_text) = match output {
        Ok((exit_code, output_text)) => (Some(exit_code), output_text),
        Err(error) => (Some(1), format!("{error}\n")),
    };

    let finished_events = session
        .with_blocks(|blocks| blocks.finish_command(&session.id, &block.id, exit_code))
        .unwrap_or_default();
    let finished_block = finished_events
        .first()
        .map(|event| event.block.clone())
        .unwrap_or(block);

    for event in finished_events {
        let _ = app.emit(EVENT_BLOCK, event);
    }

    Ok(TerminalRunCommandResponse {
        block: finished_block,
        output: output_text,
    })
}

#[tauri::command]
pub fn terminal_resize(
    manager: State<'_, TerminalManager>,
    request: ResizeTerminalSessionRequest,
) -> Result<(), String> {
    manager
        .get(&request.session_id)?
        .resize(request.rows.max(2), request.cols.max(2))
}

#[tauri::command]
pub fn terminal_kill_session(
    manager: State<'_, TerminalManager>,
    request: TerminalSessionRequest,
) -> Result<(), String> {
    let Some(session) = manager.remove(&request.session_id) else {
        return Ok(());
    };

    session.kill()
}

#[tauri::command]
pub fn terminal_get_blocks(
    manager: State<'_, TerminalManager>,
    request: TerminalSessionRequest,
) -> Result<Vec<TerminalBlock>, String> {
    Ok(manager.get(&request.session_id)?.blocks_snapshot())
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
pub fn terminal_list_directory_entries(
    request: ListDirectoryEntriesRequest,
) -> Result<FilesystemDirectoryListing, String> {
    let target_path = request
        .path
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or(env::current_dir().map_err(|error| format!("failed to read current directory: {error}"))?);
    let normalized_path = target_path
        .canonicalize()
        .map_err(|error| format!("failed to open '{}': {error}", target_path.display()))?;
    let directories_only = request.directories_only.unwrap_or(true);
    let normalized_query = request.query.unwrap_or_default().trim().to_lowercase();
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

        if name.starts_with('.') {
            continue;
        }

        if !normalized_query.is_empty() && !name.to_lowercase().contains(&normalized_query) {
            continue;
        }

        entries.push(FilesystemEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory,
        });
    }

    entries.sort_by(|left, right| {
        right.is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(FilesystemDirectoryListing {
        current_path: normalized_path.to_string_lossy().to_string(),
        parent_path: normalized_path.parent().map(|path| path.to_string_lossy().to_string()),
        entries,
    })
}

#[tauri::command]
pub fn terminal_get_git_context(request: PathRequest) -> Result<Option<GitRepoContext>, String> {
    let cwd = resolve_request_path(request.path)?;
    git_repo_context(&cwd)
}

#[tauri::command]
pub fn terminal_switch_git_branch(
    request: GitBranchSwitchRequest,
) -> Result<Option<GitRepoContext>, String> {
    let cwd = resolve_request_path(request.path)?;
    let branch = request.branch.trim();
    if branch.is_empty() {
        return Err("git branch cannot be empty".to_string());
    }

    let output = Command::new("git")
        .arg("switch")
        .arg(branch)
        .current_dir(&cwd)
        .output()
        .map_err(|error| format!("failed to switch git branch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "git switch failed".to_string()
        } else {
            stderr
        });
    }

    git_repo_context(&cwd)
}

#[tauri::command]
pub fn terminal_get_recent_history() -> Result<Vec<ShellHistoryEntry>, String> {
    let cutoff = Utc::now() - Duration::hours(24);
    let mut entries = Vec::new();

    entries.extend(read_zsh_history(cutoff));
    entries.extend(read_bash_history(cutoff));
    entries.extend(read_fish_history(cutoff));

    entries.sort_by(|left, right| right.executed_at.cmp(&left.executed_at));
    entries.dedup_by(|left, right| {
        left.value == right.value && left.executed_at == right.executed_at
    });

    Ok(entries)
}

fn spawn_reader_thread(
    app: AppHandle,
    manager: TerminalManager,
    session: SharedTerminalSession,
    mut reader: Box<dyn Read + Send>,
) {
    thread::spawn(move || {
        let mut parser = HookParser::default();
        let mut buffer = [0_u8; 8192];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let chunk = &buffer[..size];
                    let _ = app.emit(
                        EVENT_DATA,
                        TerminalDataEvent {
                            session_id: session.id.clone(),
                            data: chunk.to_vec(),
                        },
                    );

                    for stream_event in parser.push_events(chunk) {
                        match stream_event {
                            TerminalStreamEvent::Text(bytes) => {
                                let Some(block_id) = session
                                    .with_blocks(|blocks| blocks.active_block_id())
                                    .flatten()
                                else {
                                    continue;
                                };
                                let data = clean_terminal_text(&bytes);
                                if !data.is_empty() {
                                    let _ = app.emit(
                                        EVENT_BLOCK_OUTPUT,
                                        TerminalBlockOutputEvent {
                                            session_id: session.id.clone(),
                                            block_id,
                                            data,
                                        },
                                    );
                                }
                            }
                            TerminalStreamEvent::Hook(hook) => {
                                let events = session
                                    .with_blocks(|blocks| blocks.handle_hook(&session.id, hook))
                                    .unwrap_or_default();

                                for event in events {
                                    let _ = app.emit(EVENT_BLOCK, event);
                                }
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }

        let exit_code = session.wait();
        manager.remove(&session.id);
        let _ = app.emit(
            EVENT_EXIT,
            TerminalExitEvent {
                session_id: session.id.clone(),
                exit_code,
            },
        );
    });
}

fn run_shell_command(
    shell: &str,
    cwd: Option<&str>,
    command: &str,
) -> Result<(i32, String), String> {
    let mut process = if cfg!(target_os = "windows") {
        let mut process = Command::new(shell);
        process.arg("/C").arg(command);
        process
    } else {
        let mut process = Command::new(shell);
        process.arg("-lc").arg(command);
        process
    };

    if let Some(cwd) = cwd.filter(|value| !value.is_empty()) {
        process.current_dir(cwd);
    }

    let output = process
        .output()
        .map_err(|error| format!("failed to run command: {error}"))?;
    let mut output_text = String::new();
    output_text.push_str(&String::from_utf8_lossy(&output.stdout));
    output_text.push_str(&String::from_utf8_lossy(&output.stderr));

    Ok((output.status.code().unwrap_or(1), output_text))
}

fn home_dir() -> Option<std::path::PathBuf> {
    env::var_os("HOME").map(std::path::PathBuf::from)
}

fn resolve_request_path(path: Option<String>) -> Result<PathBuf, String> {
    path.filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or(env::current_dir().map_err(|error| format!("failed to read current directory: {error}"))?)
        .canonicalize()
        .map_err(|error| format!("failed to resolve path: {error}"))
}

fn git_repo_context(cwd: &Path) -> Result<Option<GitRepoContext>, String> {
    let inside_repo = Command::new("git")
        .arg("rev-parse")
        .arg("--is-inside-work-tree")
        .current_dir(cwd)
        .output();

    let Ok(inside_repo) = inside_repo else {
        return Ok(None);
    };

    if !inside_repo.status.success() || String::from_utf8_lossy(&inside_repo.stdout).trim() != "true" {
        return Ok(None);
    }

    let root_path = run_git_capture(cwd, &["rev-parse", "--show-toplevel"])?;
    let current_branch = run_git_capture(cwd, &["branch", "--show-current"])?;
    let branches = run_git_capture(cwd, &["branch", "--format=%(refname:short)"])?
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    Ok(Some(GitRepoContext {
        root_path,
        current_branch,
        branches,
    }))
}

fn run_git_capture(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("failed to run git {}: {error}", args.join(" ")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git {} failed", args.join(" "))
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn read_zsh_history(cutoff: DateTime<Utc>) -> Vec<ShellHistoryEntry> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    let path = home.join(".zsh_history");
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };

    contents
        .lines()
        .filter_map(|line| {
            let rest = line.strip_prefix(": ")?;
            let (timestamp, command_part) = rest.split_once(':')?;
            let (_, command) = command_part.split_once(';')?;
            let timestamp = timestamp.parse::<i64>().ok()?;
            let executed_at = Utc.timestamp_opt(timestamp, 0).single()?;
            if executed_at < cutoff {
                return None;
            }

            let value = command.trim();
            if value.is_empty() {
                return None;
            }

            Some(ShellHistoryEntry {
                value: value.to_string(),
                executed_at: executed_at.to_rfc3339(),
                source: "zsh".to_string(),
            })
        })
        .collect()
}

fn read_bash_history(cutoff: DateTime<Utc>) -> Vec<ShellHistoryEntry> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    let path = home.join(".bash_history");
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };

    let mut current_timestamp: Option<i64> = None;
    let mut entries = Vec::new();

    for line in contents.lines() {
        if let Some(timestamp) = line.strip_prefix('#').and_then(|value| value.parse::<i64>().ok()) {
            current_timestamp = Some(timestamp);
            continue;
        }

        let Some(timestamp) = current_timestamp.take() else {
            continue;
        };
        let Some(executed_at) = Utc.timestamp_opt(timestamp, 0).single() else {
            continue;
        };
        if executed_at < cutoff {
            continue;
        }

        let value = line.trim();
        if value.is_empty() {
            continue;
        }

        entries.push(ShellHistoryEntry {
            value: value.to_string(),
            executed_at: executed_at.to_rfc3339(),
            source: "bash".to_string(),
        });
    }

    entries
}

fn read_fish_history(cutoff: DateTime<Utc>) -> Vec<ShellHistoryEntry> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    let path = home.join(".local/share/fish/fish_history");
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };

    let mut current_command: Option<String> = None;
    let mut entries = Vec::new();

    for line in contents.lines() {
        let trimmed = line.trim();
        if let Some(command) = trimmed.strip_prefix("- cmd: ") {
            current_command = Some(command.to_string());
            continue;
        }

        let Some(timestamp) = trimmed.strip_prefix("when: ").and_then(|value| value.parse::<i64>().ok()) else {
            continue;
        };
        let Some(command) = current_command.take() else {
            continue;
        };
        let Some(executed_at) = Utc.timestamp_opt(timestamp, 0).single() else {
            continue;
        };
        if executed_at < cutoff {
            continue;
        }

        let value = command.trim();
        if value.is_empty() {
            continue;
        }

        entries.push(ShellHistoryEntry {
            value: value.to_string(),
            executed_at: executed_at.to_rfc3339(),
            source: "fish".to_string(),
        });
    }

    entries
}

#[cfg(unix)]
fn is_executable_command(path: &std::path::Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };

    metadata.is_file() && metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable_command(path: &std::path::Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
}
