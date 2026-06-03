use egui::{Response, Ui, Widget};
use crate::chat::types::*;
use crate::chat::blocks::*;
use crate::chat::diff::FileArtifactBlock;

pub struct BlockDispatcher<'a> {
    block: &'a MessageBlock,
    is_streaming: bool,
}

impl<'a> BlockDispatcher<'a> {
    pub fn new(block: &'a MessageBlock, is_streaming: bool) -> Self {
        Self { block, is_streaming }
    }
}

impl<'a> Widget for BlockDispatcher<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        match self.block {
            MessageBlock::Thinking { body, duration_seconds } => {
                ui.add(ThinkingBlock::new(body.clone(), self.is_streaming, *duration_seconds))
            }
            MessageBlock::WebSearch { status, results, query } => {
                let results_clone = results.clone();
                let query_clone = query.clone();
                ui.add(WebSearchBlock::new(status.clone(), results_clone, query_clone))
            }
            MessageBlock::WorkspaceExploration { exploration } => {
                ui.add(WorkspaceExplorationBlock::new(exploration.clone(), self.is_streaming))
            }
            MessageBlock::FileRead { artifact } => {
                ui.add(WorkspaceFileReadBlock::new(artifact.clone(), self.is_streaming))
            }
            MessageBlock::CodeDisplay { code, title, status, detail } => {
                ui.add(CodeDisplayBlock::new(code.clone(), title.clone(), status.clone(), detail.clone()))
            }
            MessageBlock::FileArtifact { artifact } => {
                let diffs = vec![artifact.clone()];
                ui.add(FileArtifactBlock::new(diffs, FileDiffPreviewStatus::Pending))
            }
            MessageBlock::ImplementationPlan { title, version } => {
                ui.add(ImplementationPlanBlock::new(title.clone(), version.clone()))
            }
            MessageBlock::MultiAgent { agent_name, task_summary, status, color_scheme } => {
                ui.add(MultiAgentBlock::new(agent_name.clone(), task_summary.clone(), status.clone(), color_scheme.clone()))
            }
            MessageBlock::Terminal { block, is_expanded, is_selected } => {
                ui.add(TerminalBlockCard::new(block.clone(), *is_expanded, *is_selected))
            }
            MessageBlock::NewConversation => {
                ui.add(NewConversationBlock)
            }
        }
    }
}
