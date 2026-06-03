use egui::{Response, RichText, Ui, Widget};

use crate::chat::{code_block::CodeBlock, diff::DiffView, markdown::MarkdownRenderer};

pub struct BlockRenderer<'a> {
    block: &'a octomus_state::chat::MessageBlock,
}

impl<'a> BlockRenderer<'a> {
    pub fn new(block: &'a octomus_state::chat::MessageBlock) -> Self {
        Self { block }
    }
}

impl<'a> Widget for BlockRenderer<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        match self.block {
            octomus_state::chat::MessageBlock::Text(text) => {
                ui.label(text.as_str())
            }
            octomus_state::chat::MessageBlock::Code { language, code } => {
                ui.add(CodeBlock::new(language.clone(), code.clone()))
            }
            octomus_state::chat::MessageBlock::Diff { path, diff } => {
                ui.add(DiffView::new(path.clone(), diff.clone()))
            }
            octomus_state::chat::MessageBlock::Thinking(content) => {
                egui::CollapsingHeader::new("🧠 Thinking")
                    .default_open(false)
                    .show(ui, |ui| {
                        ui.label(RichText::new(content.as_str()).italics().color(ui.visuals().weak_text_color()));
                    })
                    .header_response
            }
            octomus_state::chat::MessageBlock::Exploration(content) => {
                egui::CollapsingHeader::new("🔍 Exploration")
                    .default_open(false)
                    .show(ui, |ui| {
                        ui.label(RichText::new(content.as_str()).monospace());
                    })
                    .header_response
            }
            octomus_state::chat::MessageBlock::WebSearch(content) => {
                egui::CollapsingHeader::new("🌐 Web Search")
                    .default_open(false)
                    .show(ui, |ui| {
                        ui.add(MarkdownRenderer::new(content.as_str()));
                    })
                    .header_response
            }
        }
    }
}
