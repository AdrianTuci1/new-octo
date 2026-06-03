use egui::{Response, Ui, Widget};

use crate::chat::{
    approval::CommandApprovalRow,
    find_overlay::ChatFindOverlay,
    layout::{ChatEmptyState, ChatTopbar},
    timeline::Timeline,
};
use crate::state::chat::ChatState;

pub mod approval;
pub mod blocks;
pub mod bubble;
pub mod chat_panel_wrapper;
pub mod code_block;
pub mod diff;
pub mod find_overlay;
pub mod layout;
pub mod markdown;
pub mod message_row;
pub mod multi_agent_row;
pub mod terminal_error_row;
pub mod terminal_row;
pub mod timeline;

pub struct ChatPanel {
    state: std::sync::Arc<std::sync::Mutex<ChatState>>,
}

impl ChatPanel {
    pub fn new(state: std::sync::Arc<std::sync::Mutex<ChatState>>) -> Self {
        Self { state }
    }
}

impl Widget for ChatPanel {
    fn ui(self, ui: &mut Ui) -> Response {
        let mut state = self.state.lock().unwrap();

        let is_open = state.is_open;
        let has_content = state.has_content();
        let title = state.title.clone();
        let empty_variant = state.empty_state_variant.clone();
        let show_empty_topbar = state.show_empty_topbar;
        let find_visible = state.find_visible;
        let find_query = state.find_query.clone();
        let find_case_sensitive = state.find_case_sensitive;
        let find_use_regex = state.find_use_regex;
        let find_whole_word = state.find_whole_word;
        let find_match_count = state.find_match_count;
        let find_active_index = state.find_active_index;
        let pending_approval = state.pending_approval.clone();

        ui.vertical(|ui| {
            // Topbar
            ui.add(ChatTopbar::new(
                title,
                empty_variant == "workspace" && show_empty_topbar,
            ));

            // Find overlay
            if find_visible {
                ui.add(
                    ChatFindOverlay::new()
                        .with_query(find_query)
                        .with_case_sensitive(find_case_sensitive)
                        .with_use_regex(find_use_regex)
                        .with_whole_word(find_whole_word)
                        .with_match_count(find_match_count)
                        .with_active_index(find_active_index)
                        .on_close({
                            let state_clone = self.state.clone();
                            move || {
                                if let Ok(mut s) = state_clone.lock() {
                                    s.close_find();
                                }
                            }
                        })
                        .on_next({
                            let state_clone = self.state.clone();
                            move || {
                                if let Ok(mut s) = state_clone.lock() {
                                    s.select_next_match();
                                }
                            }
                        })
                        .on_previous({
                            let state_clone = self.state.clone();
                            move || {
                                if let Ok(mut s) = state_clone.lock() {
                                    s.select_previous_match();
                                }
                            }
                        })
                        .on_toggle_regex({
                            let state_clone = self.state.clone();
                            move || {
                                if let Ok(mut s) = state_clone.lock() {
                                    s.find_use_regex = !s.find_use_regex;
                                }
                            }
                        })
                        .on_toggle_case({
                            let state_clone = self.state.clone();
                            move || {
                                if let Ok(mut s) = state_clone.lock() {
                                    s.find_case_sensitive = !s.find_case_sensitive;
                                }
                            }
                        })
                        .on_toggle_whole_word({
                            let state_clone = self.state.clone();
                            move || {
                                if let Ok(mut s) = state_clone.lock() {
                                    s.find_whole_word = !s.find_whole_word;
                                }
                            }
                        }),
                );
            }

            // Content area
            if has_content {
                ui.add(Timeline::new(&state));
            } else {
                ui.add(ChatEmptyState::new(empty_variant));
            }

            // Command approval row (also shown in timeline, but this is the standalone version)
            if let Some(approval) = pending_approval {
                ui.add(CommandApprovalRow::new(Some(approval)));
            }
        })
        .response
    }
}
