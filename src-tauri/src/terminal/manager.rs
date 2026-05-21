use std::{collections::HashMap, io::Read, path::PathBuf, process::Command, sync::Mutex, thread};

use tauri::{AppHandle, Emitter, State};

use super::ansi::{clean_terminal_text, HookParser, TerminalStreamEvent};
use super::block::TerminalBlock;
use super::completions::{ShellCompletion, ShellCompletionFormat};
use super::fs::home_dir;
use super::events::{
    emit_session_state, TerminalBlockOutputEvent, TerminalCompletionResultEvent,
    TerminalCompletionUpdateEvent, TerminalCompletionsFinishedEvent,
    TerminalCompletionsPromptEvent, TerminalCompletionsStartedEvent, TerminalDataEvent,
    TerminalExitEvent, TerminalSessionCwdEvent, EVENT_BLOCK, EVENT_BLOCK_OUTPUT,
    EVENT_COMPLETIONS_FINISHED, EVENT_COMPLETIONS_PROMPT, EVENT_COMPLETIONS_STARTED,
    EVENT_COMPLETION_RESULT, EVENT_COMPLETION_UPDATE, EVENT_DATA, EVENT_EXIT, EVENT_SESSION_CWD,
};
use super::requests::{
    CreateTerminalSessionRequest, ResizeTerminalSessionRequest, RunTerminalCommandRequest,
    TerminalRunCommandResponse, TerminalSessionRequest, WriteTerminalSessionRequest,
};
use super::session::{
    SharedTerminalSession, TerminalSessionInfo, TerminalSessionKind, TerminalSessionStatus,
};
use crate::shell_signatures::parser::parse_shell_input;
use super::transport;

#[derive(Clone)]
pub struct ManagedTerminalSession {
    pub session: SharedTerminalSession,
    pub attachment_count: usize,
}

#[derive(Clone, Default)]
pub struct TerminalManager {
    pub sessions: std::sync::Arc<Mutex<HashMap<String, ManagedTerminalSession>>>,
}

impl TerminalManager {
    pub fn insert(&self, session: SharedTerminalSession) -> Result<(), String> {
        self.sessions
            .lock()
            .map_err(|_| "terminal session map lock is poisoned".to_string())?
            .insert(
                session.id.clone(),
                ManagedTerminalSession {
                    session,
                    attachment_count: 1,
                },
            );
        Ok(())
    }

    pub fn get(&self, session_id: &str) -> Result<SharedTerminalSession, String> {
        self.sessions
            .lock()
            .map_err(|_| "terminal session map lock is poisoned".to_string())?
            .get(session_id)
            .map(|managed| managed.session.clone())
            .ok_or_else(|| format!("terminal session '{session_id}' was not found"))
    }

    pub fn attach(&self, session_id: &str) -> Result<Option<SharedTerminalSession>, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "terminal session map lock is poisoned".to_string())?;
        let Some(managed) = sessions.get_mut(session_id) else {
            return Ok(None);
        };

        managed.attachment_count += 1;
        Ok(Some(managed.session.clone()))
    }

    pub fn release(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "terminal session map lock is poisoned".to_string())?;
        let Some(managed) = sessions.get_mut(session_id) else {
            return Ok(());
        };

        if managed.attachment_count > 0 {
            managed.attachment_count -= 1;
        }

        Ok(())
    }

    pub fn remove(&self, session_id: &str) -> Option<SharedTerminalSession> {
        self.sessions
            .lock()
            .ok()?
            .remove(session_id)
            .map(|managed| managed.session)
    }
}

pub fn terminal_create_session(
    app: AppHandle,
    manager: State<'_, TerminalManager>,
    request: CreateTerminalSessionRequest,
) -> Result<TerminalSessionInfo, String> {
    if let Some(existing_session_id) = request
        .session_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        if let Some(session) = manager.attach(existing_session_id)? {
            return Ok(session.info());
        }
    }

    let rows = request.rows.unwrap_or(24).max(2);
    let cols = request.cols.unwrap_or(80).max(2);
    let target = request.resolved_target();
    let cwd = request.cwd.clone();
    let spawned = match target.resolved_kind() {
        TerminalSessionKind::Local => transport::local::create_session(rows, cols, cwd)?,
        TerminalSessionKind::Cloud => transport::cloud::create_session(rows, cols, cwd, &target)?,
    };
    let session = spawned.session;
    let info = session.info();
    let manager_handle = manager.inner().clone();

    manager.insert(session.clone())?;
    emit_session_state(&app, &session, info.status.clone());
    if let Some(reader) = spawned.reader {
        spawn_reader_thread(app, manager_handle, session, reader);
    }

    Ok(info)
}

pub fn terminal_release_session(
    manager: State<'_, TerminalManager>,
    request: TerminalSessionRequest,
) -> Result<(), String> {
    manager.release(&request.session_id)?;
    Ok(())
}

pub fn terminal_write(
    manager: State<'_, TerminalManager>,
    request: WriteTerminalSessionRequest,
) -> Result<(), String> {
    manager.get(&request.session_id)?.write(&request.data)
}

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

    if request.wait_for_completion == Some(false) {
        let app_handle = app.clone();
        let session_handle = session.clone();
        let block_id = block.id.clone();
        let command = command.to_string();
        thread::spawn(move || {
            finish_terminal_command(app_handle, session_handle, block_id, command);
        });

        return Ok(TerminalRunCommandResponse {
            block,
            output: String::new(),
            pending: Some(true),
        });
    }

    let (finished_block, output_text) =
        finish_terminal_command(app, session, block.id.clone(), command.to_string());

    Ok(TerminalRunCommandResponse {
        block: finished_block,
        output: output_text,
        pending: Some(false),
    })
}

fn finish_terminal_command(
    app: AppHandle,
    session: SharedTerminalSession,
    block_id: String,
    command: String,
) -> (TerminalBlock, String) {
    let output = run_shell_command(&session.shell, session.cwd().as_deref(), &command);
    let (exit_code, output_text) = match output {
        Ok((exit_code, output_text)) => (Some(exit_code), output_text),
        Err(error) => (Some(1), format!("{error}\n")),
    };

    if exit_code == Some(0) {
        if let Some(next_cwd) = resolve_command_cwd_change(&command, session.cwd().as_deref(), session.previous_cwd().as_deref()) {
            session.set_cwd(Some(next_cwd));
        }
    }

    if !output_text.is_empty() {
        let _ = session.with_blocks(|blocks| blocks.append_output(&block_id, &output_text));
        let _ = app.emit(
            EVENT_BLOCK_OUTPUT,
            TerminalBlockOutputEvent {
                session_id: session.id.clone(),
                block_id: block_id.clone(),
                data: output_text.clone(),
            },
        );
    }

    let finished_events = session
        .with_blocks(|blocks| blocks.finish_command(&session.id, &block_id, exit_code))
        .unwrap_or_default();
    let finished_block = finished_events
        .first()
        .map(|event| event.block.clone())
        .unwrap_or_else(|| TerminalBlock {
            id: block_id,
            command,
            output: output_text.clone(),
            started_at: chrono::Utc::now(),
            finished_at: Some(chrono::Utc::now()),
            exit_code,
            duration_ms: None,
        });

    for event in finished_events {
        let _ = app.emit(EVENT_BLOCK, event);
    }

    (finished_block, output_text)
}

pub fn terminal_resize(
    manager: State<'_, TerminalManager>,
    request: ResizeTerminalSessionRequest,
) -> Result<(), String> {
    manager
        .get(&request.session_id)?
        .resize(request.rows.max(2), request.cols.max(2))
}

pub fn terminal_kill_session(
    manager: State<'_, TerminalManager>,
    request: TerminalSessionRequest,
) -> Result<(), String> {
    let Some(session) = manager.remove(&request.session_id) else {
        return Ok(());
    };

    session.kill()
}

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
                                    let _ = session.with_blocks(|blocks| {
                                        blocks.append_output(&block_id, &data)
                                    });
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
                                let hook_for_completion = hook.clone();
                                let updated_cwd = match &hook {
                                    super::ansi::ShellHook::PreCmd { cwd, .. } => cwd.clone(),
                                    _ => None,
                                };
                                let events = session
                                    .with_blocks(|blocks| blocks.handle_hook(&session.id, hook))
                                    .unwrap_or_default();

                                if updated_cwd.is_some() {
                                    let cwd_event = TerminalSessionCwdEvent {
                                        session_id: session.id.clone(),
                                        cwd: updated_cwd.clone(),
                                    };
                                    session.set_cwd(updated_cwd);
                                    let _ = app.emit(EVENT_SESSION_CWD, cwd_event);
                                }

                                match hook_for_completion {
                                    super::ansi::ShellHook::CompletionsStart { format } => {
                                        if let Some(format) =
                                            ShellCompletionFormat::from_format_type(&format)
                                        {
                                            session.start_completions_output(format);
                                            let _ = app.emit(
                                                EVENT_COMPLETIONS_STARTED,
                                                TerminalCompletionsStartedEvent {
                                                    session_id: session.id.clone(),
                                                    format,
                                                },
                                            );
                                        }
                                    }
                                    super::ansi::ShellHook::CompletionsEnd => {
                                        if let Some(data) = session.end_completions_output() {
                                            let completions: Vec<ShellCompletion> = data.into();
                                            let _ = app.emit(
                                                EVENT_COMPLETIONS_FINISHED,
                                                TerminalCompletionsFinishedEvent {
                                                    session_id: session.id.clone(),
                                                    data: completions,
                                                },
                                            );
                                        }
                                    }
                                    super::ansi::ShellHook::CompletionResult { completion } => {
                                        let completion = ShellCompletion::new(completion);
                                        session.on_completion_result_received(completion.clone());
                                        let _ = app.emit(
                                            EVENT_COMPLETION_RESULT,
                                            TerminalCompletionResultEvent {
                                                session_id: session.id.clone(),
                                                completion,
                                            },
                                        );
                                    }
                                    super::ansi::ShellHook::CompletionUpdateDescription {
                                        value,
                                    } => {
                                        session.update_last_completion_result(value.clone());
                                        let _ = app.emit(
                                            EVENT_COMPLETION_UPDATE,
                                            TerminalCompletionUpdateEvent {
                                                session_id: session.id.clone(),
                                                value,
                                            },
                                        );
                                    }
                                    super::ansi::ShellHook::CompletionsPrompt => {
                                        let _ = app.emit(
                                            EVENT_COMPLETIONS_PROMPT,
                                            TerminalCompletionsPromptEvent {
                                                session_id: session.id.clone(),
                                            },
                                        );
                                    }
                                    _ => {}
                                }

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
        emit_session_state(&app, &session, TerminalSessionStatus::Exited);
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

fn resolve_command_cwd_change(
    command: &str,
    current_cwd: Option<&str>,
    previous_cwd: Option<&str>,
) -> Option<String> {
    let parsed = parse_shell_input(command);
    let first = parsed.tokens.first()?.as_str();
    if first != "cd" {
        return None;
    }

    let target = parsed.tokens.get(1).map(String::as_str).unwrap_or("");
    resolve_cd_target(target, current_cwd, previous_cwd)
}

fn resolve_cd_target(
    target: &str,
    current_cwd: Option<&str>,
    previous_cwd: Option<&str>,
) -> Option<String> {
    let target = target.trim();
    let home = home_dir();

    let resolved = if target.is_empty() {
        home
    } else if target == "-" {
        previous_cwd
            .map(PathBuf::from)
            .or_else(|| current_cwd.map(PathBuf::from))
    } else if target == "~" {
        home
    } else if let Some(rest) = target.strip_prefix("~/") {
        home.map(|home_dir| home_dir.join(rest))
    } else {
        let path = PathBuf::from(target);
        if path.is_absolute() {
            Some(path)
        } else {
            current_cwd.map(|cwd| PathBuf::from(cwd).join(path))
        }
    }?;

    resolved
        .canonicalize()
        .map(|path| path.to_string_lossy().to_string())
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::terminal::session::{
        TerminalSession, TerminalSessionRuntime, TerminalSessionStatus,
    };
    use std::sync::Arc;

    #[test]
    fn release_detaches_without_removing_session() {
        let manager = TerminalManager::default();
        let session = Arc::new(TerminalSession::new_headless(
            TerminalSessionRuntime::local(),
            TerminalSessionStatus::Running,
            "zsh".to_string(),
            Some("/Users/adriantucicovenco".to_string()),
        ));
        let session_id = session.id.clone();

        manager.insert(session).expect("insert session");
        assert!(manager.attach(&session_id).expect("attach").is_some());

        manager.release(&session_id).expect("release");

        let sessions = manager.sessions.lock().expect("session map lock");
        let managed = sessions.get(&session_id).expect("session still present");
        assert_eq!(managed.attachment_count, 1);
        drop(sessions);

        assert!(manager.attach(&session_id).expect("reattach").is_some());

        let sessions = manager.sessions.lock().expect("session map lock");
        let managed = sessions.get(&session_id).expect("session still present");
        assert_eq!(managed.attachment_count, 2);
    }
}
