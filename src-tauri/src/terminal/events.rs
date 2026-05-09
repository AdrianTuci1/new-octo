use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::completions::{ShellCompletion, ShellCompletionFormat};
use super::session::{
    SharedTerminalSession, TerminalSessionInfo, TerminalSessionKind, TerminalSessionProvider,
    TerminalSessionStatus,
};

pub const EVENT_DATA: &str = "terminal:data";
pub const EVENT_BLOCK: &str = "terminal:block";
pub const EVENT_BLOCK_OUTPUT: &str = "terminal:block-output";
pub const EVENT_EXIT: &str = "terminal:exit";
pub const EVENT_SESSION_CWD: &str = "terminal:session-cwd";
pub const EVENT_SESSION_STATE: &str = "terminal:session-state";
pub const EVENT_COMPLETIONS_STARTED: &str = "terminal:completions-started";
pub const EVENT_COMPLETIONS_FINISHED: &str = "terminal:completions-finished";
pub const EVENT_COMPLETION_RESULT: &str = "terminal:completion-result";
pub const EVENT_COMPLETION_UPDATE: &str = "terminal:completion-update";
pub const EVENT_COMPLETIONS_PROMPT: &str = "terminal:completions-prompt";

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
pub struct TerminalSessionCwdEvent {
    pub session_id: String,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionStateEvent {
    pub session_id: String,
    pub kind: TerminalSessionKind,
    pub provider: TerminalSessionProvider,
    pub status: TerminalSessionStatus,
    pub cwd: Option<String>,
    pub profile_id: Option<String>,
}

impl TerminalSessionStateEvent {
    pub fn from_info(info: TerminalSessionInfo) -> Self {
        Self {
            session_id: info.id,
            kind: info.kind,
            provider: info.provider,
            status: info.status,
            cwd: info.cwd,
            profile_id: info.profile_id,
        }
    }
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
pub struct TerminalCompletionsStartedEvent {
    pub session_id: String,
    pub format: ShellCompletionFormat,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCompletionsFinishedEvent {
    pub session_id: String,
    pub data: Vec<ShellCompletion>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCompletionResultEvent {
    pub session_id: String,
    pub completion: ShellCompletion,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCompletionUpdateEvent {
    pub session_id: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCompletionsPromptEvent {
    pub session_id: String,
}

pub fn emit_session_state(
    app: &AppHandle,
    session: &SharedTerminalSession,
    status: TerminalSessionStatus,
) {
    session.set_status(status);
    let _ = app.emit(
        EVENT_SESSION_STATE,
        TerminalSessionStateEvent::from_info(session.info()),
    );
}
