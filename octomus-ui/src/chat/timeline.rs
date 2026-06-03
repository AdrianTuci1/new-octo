use egui::{Response, Ui, Widget};
use crate::chat::types::ChatMessage;
use crate::chat::bubble::MessageBubble;

pub struct Timeline<'a> {
    messages: &'a [ChatMessage],
    is_loading: bool,
}

impl<'a> Timeline<'a> {
    pub fn new(messages: &'a [ChatMessage], is_loading: bool) -> Self {
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
                        ui.add_space(8.0);
                        ui.add(MessageBubble::new(message.clone()));
                    }
                    if self.is_loading {
                        ui.add_space(8.0);
                        ui.horizontal(|ui| {
                            ui.spinner();
                            ui.label("Loading...");
                        });
                    }
                })
                .response
            })
            .inner
    }
}
