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
pub struct TerminalRuntimeContext {
    pub node_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellHistoryEntry {
    pub value: String,
    pub executed_at: String,
    pub source: String,
    pub pwd: Option<String>,
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
pub fn terminal_get_runtime_context(request: PathRequest) -> Result<TerminalRuntimeContext, String> {
    let cwd = resolve_request_path(request.path)?;

    Ok(TerminalRuntimeContext {
        node_version: read_command_version("node", &cwd),
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
pub async fn terminal_get_prediction(
    _ai_manager: State<'_, crate::ai::AgentHarnessManager>,
    input: String,
    cwd: Option<String>,
    last_command: Option<String>,
    available_commands: Vec<String>,
    context_messages: Vec<crate::ai::predict::model::ContextMessageInput>,
) -> Result<Option<crate::ai::predict::CommandPrediction>, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        // 0. Try sequence-based prediction (What usually follows last_command?)
        let cutoff = Utc::now() - Duration::days(180);
        let mut history = Vec::new();
        history.extend(read_zsh_history(cutoff));
        history.extend(read_bash_history(cutoff));
        history.extend(read_fish_history(cutoff));

        if let Some(prediction) = crate::ai::predict::model::predict_from_sequences(last_command.as_deref(), &history) {
            return Ok(Some(prediction));
        }

        // Fallback to folder-based zero state
        let zero_state = crate::ai::predict::model::get_zero_state_suggestions(cwd.as_deref().unwrap_or("."));
        if let Some(first) = zero_state.first() {
            return Ok(Some(crate::ai::predict::CommandPrediction {
                input: "".to_string(),
                suggestion: first.clone(),
                confidence: 0.5,
                kind: crate::ai::predict::model::PredictionKind::Heuristic,
            }));
        }
        return Ok(None);
    }
    // 1. Combine session history with system history
    let cutoff = Utc::now() - Duration::days(180);
    let mut history = Vec::new();
    
    // Add commands from the current session first (highest priority)
    for msg in &context_messages {
        if !msg.input.is_empty() {
            history.push(crate::terminal::ShellHistoryEntry {
                value: msg.input.clone(),
                executed_at: Utc::now().to_rfc3339(), // Assume recent
                source: "session".to_string(),
                pwd: msg.context.pwd.clone(),
            });
        }
    }

    history.extend(read_zsh_history(cutoff));
    history.extend(read_bash_history(cutoff));
    history.extend(read_fish_history(cutoff));

    let mut best_prediction: Option<crate::ai::predict::CommandPrediction> = None;

    // 2. Try local history (immediate) - with PWD prioritization
    if let Some(prediction) = crate::ai::predict::model::predict_from_history(trimmed, cwd.as_deref(), &history) {
        println!("[Predict] History match: '{}' (conf: {:.2})", prediction.suggestion, prediction.confidence);
        if prediction.suggestion.contains(' ') {
            return Ok(Some(prediction));
        }
        best_prediction = Some(prediction);
    }

    // 3. Try Heuristics
    if let Some(prediction) = crate::ai::predict::model::predict_next_command(trimmed, last_command.as_deref()) {
        println!("[Predict] Heuristic match: '{}'", prediction.suggestion);
        if prediction.suggestion.contains(' ') {
            return Ok(Some(prediction));
        }
        if best_prediction.is_none() {
            best_prediction = Some(prediction);
        }
    }

    // 4. Try available commands (system executables)
    if let Some(prediction) = crate::ai::predict::model::predict_from_executables(trimmed, &available_commands) {
        // Only take executable if it's longer than input and we have nothing better
        if prediction.suggestion.len() > trimmed.len() {
            println!("[Predict] Executable match: '{}'", prediction.suggestion);
            if best_prediction.is_none() {
                best_prediction = Some(prediction);
            }
        }
    }

    // Filter out suggestions that don't add anything to the input
    if let Some(ref pred) = best_prediction {
        if pred.suggestion.trim() == trimmed {
            return Ok(None);
        }
    }

    // 5. AI Fallback is disabled as per user request to focus on local history discovery
    Ok(best_prediction)
}

#[tauri::command]
pub fn terminal_get_recent_history() -> Result<Vec<ShellHistoryEntry>, String> {
    let cutoff = Utc::now() - Duration::days(180);
    let mut raw_entries = Vec::new();

    raw_entries.extend(read_zsh_history(cutoff));
    raw_entries.extend(read_bash_history(cutoff));
    raw_entries.extend(read_fish_history(cutoff));

    // Smart ranking: aggregate by value to find frequency
    use std::collections::HashMap;
    let mut stats: HashMap<String, (usize, String)> = HashMap::new();
    
    for entry in raw_entries {
        let current_executed_at = entry.executed_at.clone();
        let current = stats.entry(entry.value).or_insert((0, entry.executed_at));
        current.0 += 1;
        // Keep the most recent timestamp
        if current_executed_at > current.1 {
            current.1 = current_executed_at;
        }
    }

    let mut entries: Vec<ShellHistoryEntry> = stats
        .into_iter()
        .map(|(value, (_freq, executed_at))| ShellHistoryEntry {
            value,
            executed_at,
            source: "global".to_string(), // Combined source
            pwd: None,
        })
        .collect();

    // Sort by most recent
    entries.sort_by(|a, b| b.executed_at.cmp(&a.executed_at));

    // Limit to top 500 for performance
    if entries.len() > 500 {
        entries.truncate(500);
    }

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

fn read_command_version(command: &str, cwd: &Path) -> Option<String> {
    let output = Command::new(command)
        .arg("--version")
        .current_dir(cwd)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return Some(stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        None
    } else {
        Some(stderr)
    }
}

fn read_zsh_history(cutoff: DateTime<Utc>) -> Vec<ShellHistoryEntry> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    let path = home.join(".zsh_history");
    let Ok(contents) = fs::read_to_string(&path) else {
        return Vec::new();
    };

    let count = contents.lines().count();
    println!("[History] Reading Zsh history: {} lines from {:?}", count, path);

    contents
        .lines()
        .filter_map(|line| {
            let trimmed_line = line.trim();
            if trimmed_line.is_empty() { return None; }

            let (executed_at, value) = if trimmed_line.starts_with(": ") {
                // Extended format: : 1234567890:0;command
                if let Some(rest) = trimmed_line.strip_prefix(": ") {
                    if let Some((timestamp, command_part)) = rest.split_once(':') {
                        if let Some((_, command)) = command_part.split_once(';') {
                            let timestamp = timestamp.parse::<i64>().ok().unwrap_or(0);
                            let time = Utc.timestamp_opt(timestamp, 0).single().unwrap_or_else(Utc::now);
                            (time, command.trim())
                        } else {
                            (Utc::now(), command_part.trim())
                        }
                    } else {
                        (Utc::now(), rest.trim())
                    }
                } else {
                    (Utc::now(), trimmed_line)
                }
            } else {
                // Simple format: command
                (Utc::now(), trimmed_line)
            };

            if executed_at < cutoff {
                return None;
            }

            if value.is_empty() {
                return None;
            }

            Some(ShellHistoryEntry {
                value: value.to_string(),
                executed_at: executed_at.to_rfc3339(),
                source: "zsh".to_string(),
                pwd: None,
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
            pwd: None,
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
            pwd: None,
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
