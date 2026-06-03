use egui::{Response, Ui, Widget};
use crate::chat::types::*;
use crate::chat::blocks::ThinkingBlock;
use crate::chat::markdown::MarkdownRenderer;
use crate::chat::tool_message::ToolMessageContent;
use crate::chat::bubble_presenter::MessageBubbleViewModel;

pub struct MessageBubbleContent {
    message: ChatMessage,
    view_model: MessageBubbleViewModel,
}

impl MessageBubbleContent {
    pub fn new(message: ChatMessage, view_model: MessageBubbleViewModel) -> Self {
        Self { message, view_model }
    }
}

impl Widget for MessageBubbleContent {
    fn ui(self, ui: &mut Ui) -> Response {
        if self.message.message_kind.as_deref() == Some("reasoning") {
            return ui.add(ThinkingBlock::new(
                self.view_model.visible_body.clone(),
                self.message.is_streaming,
                self.message.thinking_duration_seconds,
            ));
        }
        
        if self.view_model.show_streaming_hint {
            return ui.horizontal(|ui| {
                ui.label("Thinking");
                if let Some(ref status) = self.message.status {
                    ui.label(format!("({})", format_status(status)));
                }
            }).response;
        }
        
        if self.message.role == MessageRole::Tool {
            let blocks = extract_blocks(&self.message);
            return ui.add(ToolMessageContent::new(
                self.view_model.visible_body.clone(),
                blocks,
                self.message.is_streaming,
            ));
        }
        
        ui.add(MarkdownRenderer::new(&self.view_model.visible_body))
    }
}

fn extract_blocks(message: &ChatMessage) -> Vec<MessageBlock> {
    let mut blocks = Vec::new();
    
    if let Some(ref status) = message.web_search_status {
        blocks.push(MessageBlock::WebSearch {
            status: status.clone(),
            results: message.web_search_results.clone().unwrap_or_default(),
            query: message.web_search_query.clone(),
        });
    }
    
    if let Some(ref exploration) = message.workspace_exploration {
        blocks.push(MessageBlock::WorkspaceExploration {
            exploration: exploration.clone(),
        });
    }
    
    if let Some(ref artifact) = message.workspace_file_read {
        blocks.push(MessageBlock::FileRead {
            artifact: artifact.clone(),
        });
    }
    
    if let Some(ref plan) = message.execution_plan {
        if let Some(ref version) = plan.version {
            blocks.push(MessageBlock::ImplementationPlan {
                title: plan.title.clone(),
                version: version.clone(),
            });
        }
    }
    
    if message.has_native_thinking {
        blocks.push(MessageBlock::Thinking {
            body: message.body.clone(),
            duration_seconds: message.thinking_duration_seconds,
        });
    }
    
    blocks
}

fn format_status(status: &AgentRunStatus) -> String {
    match status {
        AgentRunStatus::Queued => "queued".to_string(),
        AgentRunStatus::Running => "running".to_string(),
        AgentRunStatus::Completed => "completed".to_string(),
        AgentRunStatus::Failed => "failed".to_string(),
    }
}
