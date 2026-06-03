use egui::{Response, Ui, Widget};

use crate::chat::{
    approval::CommandApprovalRow,
    message_row::MessageTimelineRow,
    multi_agent_row::MultiAgentTimelineRow,
    terminal_error_row::TerminalErrorRow,
    terminal_row::TerminalTimelineRow,
};
use crate::state::chat::{ChatState, TimelineItem, TimelineItemKind};

pub struct Timeline<'a> {
    state: &'a ChatState,
}

impl<'a> Timeline<'a> {
    pub fn new(state: &'a ChatState) -> Self {
        Self { state }
    }

    fn build_timeline_items(state: &ChatState) -> Vec<TimelineItem> {
        let mut items: Vec<TimelineItem> = Vec::new();
        let mut order: u64 = 0;

        // Message items
        for msg in &state.chat_messages {
            let at = if let Some(ref created_at) = msg.created_at {
                created_at.parse::<u64>().unwrap_or(0)
            } else {
                let parts: Vec<&str> = msg.id.split('-').collect();
                parts.last().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)
            };

            items.push(TimelineItem {
                id: msg.id.clone(),
                kind: TimelineItemKind::Message { message: msg.clone() },
                at,
                order,
            });
            order += 1;
        }

        // Terminal block items
        for block in &state.terminal_blocks {
            let at = block.started_at.parse::<u64>().unwrap_or(u64::MAX);
            items.push(TimelineItem {
                id: block.id.clone(),
                kind: TimelineItemKind::TerminalBlock { block: block.clone() },
                at,
                order,
            });
            order += 1;
        }

        // Terminal error
        if let Some(ref error) = state.terminal_error {
            items.push(TimelineItem {
                id: "terminal-error".to_string(),
                kind: TimelineItemKind::TerminalError { error: error.clone() },
                at: u64::MAX,
                order,
            });
            order += 1;
        }

        // Sort by at, then order
        items.sort_by(|a, b| {
            if a.at != b.at {
                a.at.cmp(&b.at)
            } else {
                a.order.cmp(&b.order)
            }
        });

        items
    }
}

impl<'a> Widget for Timeline<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let items = Self::build_timeline_items(self.state);
        let expanded_ids = &self.state.expanded_terminal_block_ids;
        let selected_id = &self.state.selected_terminal_block_id;

        egui::ScrollArea::vertical()
            .auto_shrink([false; 2])
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    // Spacer at top to push content to bottom
                    ui.add_space(ui.available_height());

                    for (index, item) in items.iter().enumerate() {
                        match &item.kind {
                            TimelineItemKind::Message { message } => {
                                ui.add(MessageTimelineRow::new(message));
                            }
                            TimelineItemKind::TerminalBlock { block } => {
                                let is_expanded = expanded_ids.contains(&block.id);
                                let is_selected = selected_id.as_ref() == Some(&block.id);

                                // Check next item for bottom divider
                                let next_is_terminal = items.get(index + 1).map(|next| {
                                    matches!(&next.kind,
                                        TimelineItemKind::TerminalBlock { .. }
                                    )
                                }).unwrap_or(false);

                                let mut row = TerminalTimelineRow::new(block)
                                    .with_expanded(is_expanded)
                                    .with_selected(is_selected);

                                if is_expanded {
                                    row = row.on_collapse(|_id| {});
                                } else {
                                    row = row.on_expand(|_id| {});
                                }

                                ui.add(row);

                                // Bottom divider for user commands
                                if block.source.as_deref() == Some("user") && !next_is_terminal {
                                    ui.separator();
                                }
                            }
                            TimelineItemKind::MultiAgentBlock { agent_name, status, task_summary, color_scheme } => {
                                ui.add(MultiAgentTimelineRow::new(
                                    agent_name.clone(),
                                    task_summary.clone(),
                                    status.clone(),
                                    color_scheme.clone(),
                                ));
                            }
                            TimelineItemKind::TerminalError { error } => {
                                ui.add(TerminalErrorRow::new(error.clone()));
                            }
                        }
                    }

                    // Command approval row at bottom
                    if self.state.pending_approval.is_some() {
                        ui.add(CommandApprovalRow::new(self.state.pending_approval.clone()));
                    }
                })
                .response
            })
            .inner
    }
}
