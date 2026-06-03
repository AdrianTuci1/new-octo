use egui::{Response, Ui, Widget};

pub mod approval;
pub mod block_index;
pub mod blocks;
pub mod bubble;
pub mod bubble_content;
pub mod bubble_presenter;
pub mod code_block;
pub mod diff;
pub mod file_proposal_state;
pub mod file_proposals;
pub mod find_overlay;
pub mod highlight;
pub mod markdown;
pub mod markdown_text;
pub mod message_time;
pub mod timeline;
pub mod timeline_utils;
pub mod tool_message;
pub mod types;

pub struct ChatPanel {
    state: std::sync::Arc<std::sync::Mutex<crate::state::chat::ChatState>>,
}

impl ChatPanel {
    pub fn new(state: std::sync::Arc<std::sync::Mutex<crate::state::chat::ChatState>>) -> Self {
        Self { state }
    }
}

impl Widget for ChatPanel {
    fn ui(self, ui: &mut Ui) -> Response {
        let state = self.state.lock().unwrap();
        let is_loading = state.is_loading;
        let find_visible = state.find_visible;
        let find_query = state.find_query.clone();

        ui.vertical(|ui| {
            timeline::Timeline::new(&state.messages.iter().map(|m| types::ChatMessage {
                id: m.id.clone(),
                role: match m.role {
                    crate::state::chat::MessageRole::User => types::MessageRole::User,
                    crate::state::chat::MessageRole::Assistant => types::MessageRole::Assistant,
                    crate::state::chat::MessageRole::System => types::MessageRole::System,
                },
                title: m.content.clone(),
                body: m.content.clone(),
                created_at: None,
                conversation_id: None,
                run_id: None,
                is_streaming: false,
                is_error: false,
                status: None,
                tool_call_id: None,
                file_diffs: None,
                file_change_status: None,
                message_kind: None,
                thinking_duration_seconds: None,
                has_native_thinking: false,
                parent_message_id: None,
                tool_kind: None,
                web_search_status: None,
                web_search_query: None,
                web_search_results: None,
                workspace_exploration: None,
                workspace_file_read: None,
                execution_plan: None,
            }).collect::<Vec<_>>(),
            is_loading,
        ).ui(ui);

            if find_visible {
                let mut opt_query = if find_query.is_empty() { None } else { Some(find_query.clone()) };
                find_overlay::ChatFindOverlay::new(&mut opt_query).ui(ui);
            }
        })
        .response
    }
}
