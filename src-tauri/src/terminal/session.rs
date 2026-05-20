use std::{
    io::Write,
    sync::{Arc, Mutex},
};

use portable_pty::{Child, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::block::{BlockTracker, TerminalBlock};
use super::completions::{CompletionTracker, ShellCompletion, ShellCompletionFormat, ShellData};

pub type SharedTerminalSession = Arc<TerminalSession>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalSessionKind {
    Local,
    Cloud,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalSessionProvider {
    Local,
    CustomVm,
    Modal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalSessionStatus {
    Starting,
    Connecting,
    Running,
    Connected,
    Exited,
    Error,
    Disconnected,
}

#[derive(Debug, Clone)]
pub struct TerminalSessionRuntime {
    pub kind: TerminalSessionKind,
    pub provider: TerminalSessionProvider,
    pub profile_id: Option<String>,
}

impl TerminalSessionRuntime {
    pub fn local() -> Self {
        Self {
            kind: TerminalSessionKind::Local,
            provider: TerminalSessionProvider::Local,
            profile_id: None,
        }
    }
}

pub struct TerminalSession {
    pub id: String,
    pub shell: String,
    runtime: TerminalSessionRuntime,
    cwd: Mutex<Option<String>>,
    status: Mutex<TerminalSessionStatus>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    child: Mutex<Option<Box<dyn Child + Send>>>,
    blocks: Mutex<BlockTracker>,
    completions: Mutex<CompletionTracker>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub id: String,
    pub shell: String,
    pub kind: TerminalSessionKind,
    pub provider: TerminalSessionProvider,
    pub status: TerminalSessionStatus,
    pub cwd: Option<String>,
    pub profile_id: Option<String>,
}

impl TerminalSession {
    pub fn new(
        runtime: TerminalSessionRuntime,
        initial_status: TerminalSessionStatus,
        shell: String,
        cwd: Option<String>,
        master: Box<dyn MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        child: Box<dyn Child + Send>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            shell,
            runtime,
            cwd: Mutex::new(cwd),
            status: Mutex::new(initial_status),
            master: Mutex::new(Some(master)),
            writer: Mutex::new(Some(writer)),
            child: Mutex::new(Some(child)),
            blocks: Mutex::new(BlockTracker::default()),
            completions: Mutex::new(CompletionTracker::default()),
        }
    }

    pub fn new_headless(
        runtime: TerminalSessionRuntime,
        initial_status: TerminalSessionStatus,
        shell: String,
        cwd: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            shell,
            runtime,
            cwd: Mutex::new(cwd),
            status: Mutex::new(initial_status),
            master: Mutex::new(None),
            writer: Mutex::new(None),
            child: Mutex::new(None),
            blocks: Mutex::new(BlockTracker::default()),
            completions: Mutex::new(CompletionTracker::default()),
        }
    }

    pub fn info(&self) -> TerminalSessionInfo {
        TerminalSessionInfo {
            id: self.id.clone(),
            shell: self.shell.clone(),
            kind: self.runtime.kind.clone(),
            provider: self.runtime.provider.clone(),
            status: self.status(),
            cwd: self.cwd(),
            profile_id: self.runtime.profile_id.clone(),
        }
    }

    pub fn status(&self) -> TerminalSessionStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or(TerminalSessionStatus::Error)
    }

    pub fn set_status(&self, status: TerminalSessionStatus) {
        if let Ok(mut current_status) = self.status.lock() {
            *current_status = status;
        }
    }

    pub fn cwd(&self) -> Option<String> {
        self.cwd.lock().ok().and_then(|cwd| cwd.clone())
    }

    pub fn set_cwd(&self, cwd: Option<String>) {
        if let Some(cwd) = cwd {
            if let Ok(mut current_cwd) = self.cwd.lock() {
                *current_cwd = Some(cwd);
            }
        }
    }

    pub fn write(&self, data: &str) -> Result<(), String> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| "terminal writer lock is poisoned".to_string())?;
        let Some(writer) = writer.as_mut() else {
            return Ok(());
        };
        writer
            .write_all(data.as_bytes())
            .map_err(|error| format!("failed to write to terminal: {error}"))?;
        writer
            .flush()
            .map_err(|error| format!("failed to flush terminal input: {error}"))
    }

    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        let master = self
            .master
            .lock()
            .map_err(|_| "terminal resize lock is poisoned".to_string())?;
        let Some(master) = master.as_ref() else {
            return Ok(());
        };
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("failed to resize terminal: {error}"))
    }

    pub fn kill(&self) -> Result<(), String> {
        let mut child = self
            .child
            .lock()
            .map_err(|_| "terminal child lock is poisoned".to_string())?;
        let Some(child) = child.as_mut() else {
            return Ok(());
        };
        child
            .kill()
            .map_err(|error| format!("failed to kill terminal session: {error}"))
    }

    pub fn wait(&self) -> Option<i32> {
        let mut child = self.child.lock().ok()?;
        child
            .as_mut()
            .and_then(|process| process.wait().ok().map(|status| status.exit_code() as i32))
    }

    pub fn with_blocks<T>(&self, f: impl FnOnce(&mut BlockTracker) -> T) -> Option<T> {
        let mut blocks = self.blocks.lock().ok()?;
        Some(f(&mut blocks))
    }

    pub fn start_completions_output(&self, format: ShellCompletionFormat) {
        if let Ok(mut completions) = self.completions.lock() {
            completions.start(format);
        }
    }

    pub fn end_completions_output(&self) -> Option<ShellData> {
        self.completions
            .lock()
            .ok()
            .and_then(|mut completions| completions.finish())
    }

    pub fn on_completion_result_received(&self, completion_result: ShellCompletion) {
        if let Ok(mut completions) = self.completions.lock() {
            completions.push_result(completion_result);
        }
    }

    pub fn update_last_completion_result(&self, update_value: String) {
        if let Ok(mut completions) = self.completions.lock() {
            completions.update_last_description(update_value);
        }
    }

    pub fn blocks_snapshot(&self) -> Vec<TerminalBlock> {
        self.blocks
            .lock()
            .map(|blocks| blocks.blocks())
            .unwrap_or_default()
    }
}
