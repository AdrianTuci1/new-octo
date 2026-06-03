use egui::{Response, Ui, Widget};

use crate::chat::bubble::MessageBubble;

pub struct Timeline<'a> {
    messages: &'a [octomus_state::chat::Message],
    is_loading: bool,
}

impl<'a> Timeline<'a> {
    pub fn new(
        messages: &'a [octomus_state::chat::Message],
        is_loading: bool,
    ) -> Self {
        Self { messages, is_loading }
    }
}

impl<'a> Widget for Timeline<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        egui::ScrollArea::vertical()
            .auto_shrink([false; 2])
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    for message in self.messages {
                        MessageBubble::new(message).ui(ui);
                    }
                    if self.is_loading {
                        ui.horizontal(|ui| {
                            ui.spinner();
                            ui.label("Thinking...");
                        });
                    }
                })
                .response
            })
            .inner
    }
}
