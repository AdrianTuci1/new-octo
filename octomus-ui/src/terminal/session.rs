use std::sync::{Arc, Mutex};

use super::output::{OutputBlockSource, SharedOutputBuffer};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionStatus {
    Starting,
    Connecting,
    Running,
    Connected,
    Exited,
    Error,
    Disconnected,
}

impl Default for SessionStatus {
    fn default() -> Self {
        SessionStatus::Starting
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionKind {
    Local,
    Cloud,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionProvider {
    Local,
    CustomVm,
    Modal,
}

#[derive(Debug, Clone)]
pub struct TerminalSession {
    pub id: String,
    pub shell: String,
    pub kind: SessionKind,
    pub provider: SessionProvider,
    pub status: SessionStatus,
    pub cwd: Option<String>,
    pub profile_id: Option<String>,
    pub output: SharedOutputBuffer,
}

impl TerminalSession {
    pub fn new(
        id: String,
        shell: String,
        kind: SessionKind,
        provider: SessionProvider,
        cwd: Option<String>,
    ) -> Self {
        Self {
            id,
            shell,
            kind,
            provider,
            status: SessionStatus::Starting,
            cwd,
            profile_id: None,
            output: SharedOutputBuffer::new(),
        }
    }

    pub fn local(shell: String, cwd: Option<String>) -> Self {
        Self::new(
            uuid(),
            shell,
            SessionKind::Local,
            SessionProvider::Local,
            cwd,
        )
    }

    pub fn set_status(&mut self, status: SessionStatus) {
        self.status = status;
    }

    pub fn set_cwd(&mut self, cwd: Option<String>) {
        self.cwd = cwd;
    }

    pub fn is_active(&self) -> bool {
        matches!(
            self.status,
            SessionStatus::Running | SessionStatus::Connected
        )
    }

    pub fn start_command_block(
        &self,
        block_id: String,
        command: String,
        source: OutputBlockSource,
    ) {
        self.output.start_block(block_id, command, source);
    }

    pub fn finish_command_block(
        &self,
        block_id: String,
        exit_code: Option<i32>,
        duration_ms: Option<i64>,
    ) {
        self.output.finish_block(block_id, exit_code, duration_ms);
    }

    pub fn append_to_block(&self, block_id: &str, data: &str) {
        self.output.append_to_block(block_id, data);
    }

    pub fn append_raw_to_block(&self, block_id: &str, bytes: &[u8]) {
        self.output.append_raw_to_block(block_id, bytes);
    }
}

#[derive(Debug, Default)]
pub struct SessionRegistry {
    sessions: Vec<Arc<Mutex<TerminalSession>>>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, session: TerminalSession) -> Arc<Mutex<TerminalSession>> {
        let shared = Arc::new(Mutex::new(session));
        self.sessions.push(shared.clone());
        shared
    }

    pub fn remove(&mut self, session_id: &str) -> Option<Arc<Mutex<TerminalSession>>> {
        let index = self
            .sessions
            .iter()
            .position(|s| {
                s.lock()
                    .map(|sess| sess.id == session_id)
                    .unwrap_or(false)
            })?;
        Some(self.sessions.remove(index))
    }

    pub fn get(&self, session_id: &str) -> Option<Arc<Mutex<TerminalSession>>> {
        self.sessions
            .iter()
            .find(|s| {
                s.lock()
                    .map(|sess| sess.id == session_id)
                    .unwrap_or(false)
            })
            .cloned()
    }

    pub fn sessions(&self) -> &[Arc<Mutex<TerminalSession>>] {
        &self.sessions
    }

    pub fn len(&self) -> usize {
        self.sessions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.sessions.is_empty()
    }
}

fn uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("sess-{}", ts)
}
