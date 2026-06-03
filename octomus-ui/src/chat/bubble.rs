use egui::{Color32, CornerRadius, Response, RichText, Stroke, Ui, Widget};
use crate::chat::types::*;
use crate::chat::bubble_presenter::{MessageBubblePresenter, MessageBubbleViewModel};
use crate::chat::bubble_content::MessageBubbleContent;
use crate::chat::diff::FileDiffPreviewGroup;

pub struct MessageBubble {
    message: ChatMessage,
}

impl MessageBubble {
    pub fn new(message: ChatMessage) -> Self {
        Self { message }
    }

    fn background_color(role: &MessageRole) -> Color32 {
        match role {
            MessageRole::User => Color32::from_rgb(40, 80, 120),
            MessageRole::Assistant => Color32::from_rgb(50, 50, 55),
            MessageRole::System => Color32::from_rgb(60, 60, 40),
            MessageRole::Tool => Color32::from_rgb(45, 55, 45),
        }
    }

    fn role_icon(role: &MessageRole) -> &'static str {
        match role {
            MessageRole::User => "👤",
            MessageRole::Assistant => "🤖",
            MessageRole::System => "⚙",
            MessageRole::Tool => "🔧",
        }
    }

    fn role_label(role: &MessageRole) -> &'static str {
        match role {
            MessageRole::User => "You",
            MessageRole::Assistant => "Assistant",
            MessageRole::System => "System",
            MessageRole::Tool => "Tool",
        }
    }
}

impl Widget for MessageBubble {
    fn ui(self, ui: &mut Ui) -> Response {
        let view_model = MessageBubblePresenter::create(&self.message);
        let bg = Self::background_color(&self.message.role);
        let rounding = CornerRadius::same(12);
        
        egui::Frame::NONE
            .fill(bg)
            .corner_radius(rounding)
            .stroke(Stroke::NONE)
            .inner_margin(egui::vec2(12.0, 8.0))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    // Header: role icon + label + timestamp
                    ui.horizontal(|ui| {
                        ui.label(Self::role_icon(&self.message.role));
                        ui.label(RichText::new(Self::role_label(&self.message.role)).strong().size(12.0));
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if let Some(ref created_at) = self.message.created_at {
                                ui.label(RichText::new(created_at.clone()).small().color(Color32::from_rgb(150, 150, 150)));
                            }
                        });
                    });
                    ui.add_space(4.0);
                    
                    // Content
                    ui.add(MessageBubbleContent::new(self.message.clone(), view_model.clone()));
                    
                    // File diffs
                    if !view_model.display_file_diffs.is_empty() {
                        ui.add_space(8.0);
                        ui.add(FileDiffPreviewGroup::new(
                            view_model.display_file_diffs,
                            view_model.file_preview_status,
                        ));
                    }
                })
                .response
            })
            .response
    }
}
