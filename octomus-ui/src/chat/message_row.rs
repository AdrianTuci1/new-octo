use egui::{Response, Ui, Widget};

use crate::chat::bubble::MessageBubble;
use crate::state::chat::{ChatMessage, MessageRole};

pub struct MessageTimelineRow<'a> {
    message: &'a ChatMessage,
}

impl<'a> MessageTimelineRow<'a> {
    pub fn new(message: &'a ChatMessage) -> Self {
        Self { message }
    }
}

impl<'a> Widget for MessageTimelineRow<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        // Convert ChatMessage to Message for the bubble renderer
        let role = match self.message.role.as_str() {
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            _ => MessageRole::Assistant,
        };

        let message = crate::state::chat::Message {
            id: self.message.id.clone(),
            role,
            content: self.message.body.clone(),
            blocks: vec![],
        };

        ui.add(MessageBubble::new(&message))
    }
}
