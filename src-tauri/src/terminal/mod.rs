mod ansi;
mod block;
mod pty;
mod session;

use std::{
    collections::HashMap,
    io::Read,
    process::Command,
    sync::{Arc, Mutex},
    thread,
};

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
