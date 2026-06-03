use egui::{Color32, CornerRadius, Response, RichText, Stroke, Ui, Widget};

use crate::chat::blocks::BlockRenderer;

pub struct MessageBubble<'a> {
    message: &'a crate::state::chat::Message,
}

impl<'a> MessageBubble<'a> {
    pub fn new(message: &'a crate::state::chat::Message) -> Self {
        Self { message }
    }

    fn background_color(&self) -> Color32 {
        match self.message.role {
            crate::state::chat::MessageRole::User => Color32::from_rgb(40, 80, 120),
            crate::state::chat::MessageRole::Assistant => Color32::from_rgb(50, 50, 55),
            crate::state::chat::MessageRole::System => Color32::from_rgb(60, 60, 40),
        }
    }
}

impl<'a> Widget for MessageBubble<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let bg = self.background_color();
        let rounding = CornerRadius::same(12);
        let stroke = Stroke::NONE;

        egui::Frame::NONE
            .fill(bg)
            .corner_radius(rounding)
            .stroke(stroke)
            .inner_margin(egui::vec2(12.0, 8.0))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    let role_label = match self.message.role {
                        crate::state::chat::MessageRole::User => "You",
                        crate::state::chat::MessageRole::Assistant => "Assistant",
                        crate::state::chat::MessageRole::System => "System",
                    };
                    ui.label(RichText::new(role_label).strong().size(12.0));
                    ui.add_space(4.0);

                    for block in &self.message.blocks {
                        ui.add(BlockRenderer::new(block));
                    }

                    if self.message.blocks.is_empty() {
                        ui.label(&self.message.content);
                    }
                })
                .response
            })
            .response
    }
}
