use egui::{Response, RichText, Ui, Widget};
use crate::chat::types::*;
use crate::chat::blocks::*;
use crate::chat::block_index::BlockDispatcher;

pub struct ToolMessageContent {
    content: String,
    blocks: Vec<MessageBlock>,
    is_streaming: bool,
}

impl ToolMessageContent {
    pub fn new(content: String, blocks: Vec<MessageBlock>, is_streaming: bool) -> Self {
        Self { content, blocks, is_streaming }
    }
}

impl Widget for ToolMessageContent {
    fn ui(self, ui: &mut Ui) -> Response {
        let has_blocks = !self.blocks.is_empty();
        let has_content = !self.content.trim().is_empty();
        
        ui.vertical(|ui| {
            if has_blocks {
                for block in &self.blocks {
                    ui.add(BlockDispatcher::new(block, self.is_streaming));
                }
            }
            
            if has_content {
                ui.add(crate::chat::markdown::MarkdownRenderer::new(&self.content));
            }
        }).response
    }
}
