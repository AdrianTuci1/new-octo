use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use super::ansi::ShellHook;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalBlock {
    pub id: String,
    pub command: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TerminalBlockEventKind {
    Started,
    Finished,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalBlockEvent {
    pub session_id: String,
    pub kind: TerminalBlockEventKind,
    pub block: TerminalBlock,
}

#[derive(Debug, Default)]
pub struct BlockTracker {
    active: Option<TerminalBlock>,
    blocks: Vec<TerminalBlock>,
}

impl BlockTracker {
    pub fn handle_hook(&mut self, session_id: &str, hook: ShellHook) -> Vec<TerminalBlockEvent> {
        match hook {
            ShellHook::PreExec { command } => {
                if self
                    .active
                    .as_ref()
                    .is_some_and(|block| block.command == command.trim())
                {
                    return Vec::new();
                }

                self.start_block(session_id, command)
            }
            ShellHook::PreCmd { status } => self.finish_active_block(session_id, status),
            ShellHook::Finish { block_id, status } => {
                self.finish_block(session_id, &block_id, status)
            }
        }
    }

    pub fn begin_command(&mut self, session_id: &str, command: String) -> Vec<TerminalBlockEvent> {
        self.start_block(session_id, command)
    }

    pub fn finish_command(
        &mut self,
        session_id: &str,
        block_id: &str,
        exit_code: Option<i32>,
    ) -> Vec<TerminalBlockEvent> {
        self.finish_block(session_id, block_id, exit_code)
    }

    pub fn blocks(&self) -> Vec<TerminalBlock> {
        self.blocks.clone()
    }

    pub fn active_block_id(&self) -> Option<String> {
        self.active.as_ref().map(|block| block.id.clone())
    }

    fn start_block(&mut self, session_id: &str, command: String) -> Vec<TerminalBlockEvent> {
        let mut events = Vec::new();

        if self.active.is_some() {
            events.extend(self.finish_active_block(session_id, None));
        }

        let block = TerminalBlock {
            id: Uuid::new_v4().to_string(),
            command: command.trim().to_string(),
            started_at: Utc::now(),
            finished_at: None,
            exit_code: None,
            duration_ms: None,
        };

        self.active = Some(block.clone());
        events.push(TerminalBlockEvent {
            session_id: session_id.to_string(),
            kind: TerminalBlockEventKind::Started,
            block,
        });

        events
    }

    fn finish_active_block(
        &mut self,
        session_id: &str,
        exit_code: Option<i32>,
    ) -> Vec<TerminalBlockEvent> {
        let Some(active_block) = self.active.as_ref() else {
            return Vec::new();
        };

        let block_id = active_block.id.clone();
        self.finish_block(session_id, &block_id, exit_code)
    }

    fn finish_block(
        &mut self,
        session_id: &str,
        block_id: &str,
        exit_code: Option<i32>,
    ) -> Vec<TerminalBlockEvent> {
        let Some(active_block) = self.active.as_ref() else {
            return Vec::new();
        };

        if active_block.id != block_id {
            return Vec::new();
        }

        let Some(mut block) = self.active.take() else {
            return Vec::new();
        };

        let finished_at = Utc::now();
        block.finished_at = Some(finished_at);
        block.exit_code = exit_code;
        block.duration_ms = Some((finished_at - block.started_at).num_milliseconds());

        self.blocks.push(block.clone());
        if self.blocks.len() > 300 {
            let overflow = self.blocks.len() - 300;
            self.blocks.drain(0..overflow);
        }

        vec![TerminalBlockEvent {
            session_id: session_id.to_string(),
            kind: TerminalBlockEventKind::Finished,
            block,
        }]
    }
}
