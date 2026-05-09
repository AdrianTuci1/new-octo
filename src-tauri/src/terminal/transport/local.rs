use std::{io::Read, sync::Arc};

use crate::terminal::pty::spawn_terminal;
use crate::terminal::session::SharedTerminalSession;

pub struct LocalTerminalSpawn {
    pub session: SharedTerminalSession,
    pub reader: Option<Box<dyn Read + Send>>,
}

pub fn create_session(
    rows: u16,
    cols: u16,
    cwd: Option<String>,
) -> Result<LocalTerminalSpawn, String> {
    let spawned = spawn_terminal(rows, cols, cwd)?;

    Ok(LocalTerminalSpawn {
        session: Arc::new(spawned.session),
        reader: spawned.reader,
    })
}
