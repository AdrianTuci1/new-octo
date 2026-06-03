use egui::{Response, Ui, Widget};

use crate::chat::{find_overlay::ChatFindOverlay, timeline::Timeline};

pub mod approval;
pub mod blocks;
pub mod bubble;
pub mod code_block;
pub mod diff;
pub mod find_overlay;
pub mod markdown;
pub mod timeline;

pub struct ChatPanel {
    state: std::sync::Arc<std::sync::Mutex<octomus_state::chat::ChatState>>,
}

impl ChatPanel {
    pub fn new(state: std::sync::Arc<std::sync::Mutex<octomus_state::chat::ChatState>>) -> Self {
        Self { state }
    }
}

impl Widget for ChatPanel {
    fn ui(self, ui: &mut Ui) -> Response {
        let state = self.state.lock().unwrap();
        let is_loading = state.is_loading;
        let find_visible = state.find_visible;
        let mut find_query = state.find_query.clone();

        ui.vertical(|ui| {
            Timeline::new(&state.messages, is_loading).ui(ui);

            if find_visible {
                ChatFindOverlay::new(&mut find_query).ui(ui);
            }
        })
        .response
    }
}
