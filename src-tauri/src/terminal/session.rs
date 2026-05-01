use std::{
    io::Write,
    sync::{Arc, Mutex},
};

use portable_pty::{Child, MasterPty, PtySize};
use serde::Serialize;
use uuid::Uuid;

use super::block::{BlockTracker, TerminalBlock};

pub type SharedTerminalSession = Arc<TerminalSession>;

pub struct TerminalSession {
    pub id: String,
    pub shell: String,
    pub cwd: Option<String>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send>>,
    blocks: Mutex<BlockTracker>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub id: String,
    pub shell: String,
    pub cwd: Option<String>,
}

impl TerminalSession {
    pub fn new(
        shell: String,
        cwd: Option<String>,
        master: Box<dyn MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        child: Box<dyn Child + Send>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            shell,
            cwd,
            master: Mutex::new(master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
            blocks: Mutex::new(BlockTracker::default()),
        }
    }

    pub fn info(&self) -> TerminalSessionInfo {
        TerminalSessionInfo {
            id: self.id.clone(),
            shell: self.shell.clone(),
            cwd: self.cwd.clone(),
        }
    }

    pub fn write(&self, data: &str) -> Result<(), String> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| "terminal writer lock is poisoned".to_string())?;
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
        child
            .kill()
            .map_err(|error| format!("failed to kill terminal session: {error}"))
    }

    pub fn wait(&self) -> Option<i32> {
        let mut child = self.child.lock().ok()?;
        child.wait().ok().map(|status| status.exit_code() as i32)
    }

    pub fn with_blocks<T>(&self, f: impl FnOnce(&mut BlockTracker) -> T) -> Option<T> {
        let mut blocks = self.blocks.lock().ok()?;
        Some(f(&mut blocks))
    }

    pub fn blocks_snapshot(&self) -> Vec<TerminalBlock> {
        self.blocks
            .lock()
            .map(|blocks| blocks.blocks())
            .unwrap_or_default()
    }
}
