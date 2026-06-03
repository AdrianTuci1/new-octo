use std::sync::{Arc, Mutex};

use super::ansi::{clean_terminal_text, AnsiParser, StyledCell};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputBlockStatus {
    Running,
    Finished { exit_code: Option<i32> },
}

impl Default for OutputBlockStatus {
    fn default() -> Self {
        OutputBlockStatus::Running
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputBlockSource {
    User,
    Agent,
    System,
}

impl Default for OutputBlockSource {
    fn default() -> Self {
        OutputBlockSource::Agent
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputBlockPresentation {
    Default,
    ConversationLink { conversation_id: String },
}

impl Default for OutputBlockPresentation {
    fn default() -> Self {
        OutputBlockPresentation::Default
    }
}

#[derive(Debug, Clone)]
pub struct OutputBlock {
    pub id: String,
    pub command: String,
    pub output: String,
    pub status: OutputBlockStatus,
    pub source: OutputBlockSource,
    pub presentation: OutputBlockPresentation,
    pub duration_ms: Option<i64>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl OutputBlock {
    pub fn new(id: String, command: String, source: OutputBlockSource) -> Self {
        Self {
            id,
            command,
            output: String::new(),
            status: OutputBlockStatus::Running,
            source,
            presentation: OutputBlockPresentation::Default,
            duration_ms: None,
            created_at: chrono::Utc::now(),
        }
    }

    pub fn append_output(&mut self, data: &str) {
        self.output.push_str(data);
    }

    pub fn append_raw(&mut self, bytes: &[u8]) {
        self.output.push_str(&clean_terminal_text(bytes));
    }

    pub fn finish(&mut self, exit_code: Option<i32>, duration_ms: Option<i64>) {
        self.status = OutputBlockStatus::Finished { exit_code };
        self.duration_ms = duration_ms;
    }

    pub fn failed(&self) -> bool {
        matches!(
            self.status,
            OutputBlockStatus::Finished {
                exit_code: Some(code),
            } if code != 0
        )
    }

    pub fn succeeded(&self) -> bool {
        matches!(
            self.status,
            OutputBlockStatus::Finished {
                exit_code: Some(0),
            }
        )
    }

    pub fn is_running(&self) -> bool {
        matches!(self.status, OutputBlockStatus::Running)
    }

    pub fn display_output(&self) -> String {
        let trimmed = self.output.trim_end();
        let without_echo = if trimmed.starts_with(&self.command) {
            trimmed[self.command.len()..]
                .trim_start_matches(|c: char| c.is_whitespace() || c == '\n')
                .to_string()
        } else {
            trimmed.to_string()
        };

        if without_echo.is_empty() && self.is_running() {
            return "Running command...".to_string();
        }

        without_echo
    }

    pub fn styled_cells(&self) -> Vec<Vec<StyledCell>> {
        self.display_output()
            .lines()
            .map(|line| AnsiParser::parse_styled_line(line))
            .collect()
    }
}

#[derive(Debug, Default)]
pub struct OutputBuffer {
    blocks: Vec<OutputBlock>,
    active_block_id: Option<String>,
    max_blocks: usize,
}

impl OutputBuffer {
    pub fn new() -> Self {
        Self {
            blocks: Vec::new(),
            active_block_id: None,
            max_blocks: 300,
        }
    }

    pub fn with_max_blocks(max_blocks: usize) -> Self {
        Self {
            blocks: Vec::new(),
            active_block_id: None,
            max_blocks,
        }
    }

    pub fn start_block(
        &mut self,
        id: String,
        command: String,
        source: OutputBlockSource,
    ) -> &mut OutputBlock {
        if let Some(active_id) = &self.active_block_id {
            self.finish_block(active_id.clone(), None, None);
        }

        let block = OutputBlock::new(id.clone(), command, source);
        self.blocks.push(block);
        self.active_block_id = Some(id.clone());
        self.trim_old_blocks();

        self.blocks.last_mut().unwrap()
    }

    pub fn finish_block(
        &mut self,
        block_id: String,
        exit_code: Option<i32>,
        duration_ms: Option<i64>,
    ) {
        if let Some(block) = self.blocks.iter_mut().find(|b| b.id == block_id) {
            block.finish(exit_code, duration_ms);
        }
        if self.active_block_id.as_ref() == Some(&block_id) {
            self.active_block_id = None;
        }
    }

    pub fn append_to_block(&mut self,
        block_id: &str,
        data: &str,
    ) {
        if let Some(block) = self.blocks.iter_mut().find(|b| b.id == block_id) {
            block.append_output(data);
        }
    }

    pub fn append_raw_to_block(&mut self,
        block_id: &str,
        bytes: &[u8],
    ) {
        if let Some(block) = self.blocks.iter_mut().find(|b| b.id == block_id) {
            block.append_raw(bytes);
        }
    }

    pub fn active_block(&self) -> Option<&OutputBlock> {
        self.active_block_id
            .as_ref()
            .and_then(|id| self.blocks.iter().find(|b| b.id == *id))
    }

    pub fn active_block_mut(&mut self) -> Option<&mut OutputBlock> {
        let id = self.active_block_id.clone()?;
        self.blocks.iter_mut().find(|b| b.id == id)
    }

    pub fn blocks(&self) -> &[OutputBlock] {
        &self.blocks
    }

    pub fn blocks_mut(&mut self) -> &mut [OutputBlock] {
        &mut self.blocks
    }

    pub fn get_block(&self, id: &str) -> Option<&OutputBlock> {
        self.blocks.iter().find(|b| b.id == id)
    }

    pub fn get_block_mut(&mut self, id: &str) -> Option<&mut OutputBlock> {
        self.blocks.iter_mut().find(|b| b.id == id)
    }

    pub fn clear(&mut self) {
        self.blocks.clear();
        self.active_block_id = None;
    }

    pub fn len(&self) -> usize {
        self.blocks.len()
    }

    pub fn is_empty(&self) -> bool {
        self.blocks.is_empty()
    }

    fn trim_old_blocks(&mut self) {
        if self.blocks.len() > self.max_blocks {
            let overflow = self.blocks.len() - self.max_blocks;
            self.blocks.drain(0..overflow);
        }
    }
}

#[derive(Debug, Clone)]
pub struct SharedOutputBuffer(Arc<Mutex<OutputBuffer>>);

impl SharedOutputBuffer {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(OutputBuffer::new())))
    }

    pub fn with_max_blocks(max_blocks: usize) -> Self {
        Self(Arc::new(Mutex::new(OutputBuffer::with_max_blocks(max_blocks))))
    }

    pub fn lock(&self) -> Option<std::sync::MutexGuard<'_, OutputBuffer>> {
        self.0.lock().ok()
    }

    pub fn start_block(&self, id: String, command: String, source: OutputBlockSource) {
        if let Ok(mut buf) = self.0.lock() {
            buf.start_block(id, command, source);
        }
    }

    pub fn finish_block(&self, block_id: String, exit_code: Option<i32>, duration_ms: Option<i64>) {
        if let Ok(mut buf) = self.0.lock() {
            buf.finish_block(block_id, exit_code, duration_ms);
        }
    }

    pub fn append_to_block(&self, block_id: &str, data: &str) {
        if let Ok(mut buf) = self.0.lock() {
            buf.append_to_block(block_id, data);
        }
    }

    pub fn append_raw_to_block(&self, block_id: &str, bytes: &[u8]) {
        if let Ok(mut buf) = self.0.lock() {
            buf.append_raw_to_block(block_id, bytes);
        }
    }

    pub fn blocks_snapshot(&self) -> Vec<OutputBlock> {
        self.0
            .lock()
            .map(|buf| buf.blocks().to_vec())
            .unwrap_or_default()
    }

    pub fn clear(&self) {
        if let Ok(mut buf) = self.0.lock() {
            buf.clear();
        }
    }
}

impl Default for SharedOutputBuffer {
    fn default() -> Self {
        Self::new()
    }
}
