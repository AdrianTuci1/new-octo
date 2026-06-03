use egui::{Response, Ui, Widget};

use crate::chat::ChatPanel;
use crate::state::chat::ChatState;

pub struct ChatPanelWrapper {
    state: std::sync::Arc<std::sync::Mutex<ChatState>>,
}

impl ChatPanelWrapper {
    pub fn new(state: std::sync::Arc<std::sync::Mutex<ChatState>>) -> Self {
        Self { state }
    }
}

impl Widget for ChatPanelWrapper {
    fn ui(self, ui: &mut Ui) -> Response {
        ui.add(ChatPanel::new(self.state))
    }
}
