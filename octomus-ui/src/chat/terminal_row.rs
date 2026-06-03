use egui::{Color32, Response, RichText, Ui, Widget};

use crate::state::chat::TerminalCommandBlock;

pub struct TerminalTimelineRow<'a> {
    block: &'a TerminalCommandBlock,
    is_expanded: bool,
    is_selected: bool,
    has_user_avatar: bool,
    on_collapse: Option<Box<dyn FnOnce(String)>>,
    on_expand: Option<Box<dyn FnOnce(String)>>,
    on_select: Option<Box<dyn FnOnce(Option<String>)>>,
    on_open_conversation: Option<Box<dyn FnOnce(String)>>,
    working_directory: Option<String>,
}

impl<'a> TerminalTimelineRow<'a> {
    pub fn new(block: &'a TerminalCommandBlock) -> Self {
        let has_user_avatar = block.source.as_deref() == Some("user");
        Self {
            block,
            is_expanded: false,
            is_selected: false,
            has_user_avatar,
            on_collapse: None,
            on_expand: None,
            on_select: None,
            on_open_conversation: None,
            working_directory: None,
        }
    }

    pub fn with_expanded(mut self, expanded: bool) -> Self {
        self.is_expanded = expanded;
        self
    }

    pub fn with_selected(mut self, selected: bool) -> Self {
        self.is_selected = selected;
        self
    }

    pub fn on_collapse(mut self, cb: impl FnOnce(String) + 'static) -> Self {
        self.on_collapse = Some(Box::new(cb));
        self
    }

    pub fn on_expand(mut self, cb: impl FnOnce(String) + 'static) -> Self {
        self.on_expand = Some(Box::new(cb));
        self
    }

    pub fn on_select(mut self, cb: impl FnOnce(Option<String>) + 'static) -> Self {
        self.on_select = Some(Box::new(cb));
        self
    }

    pub fn on_open_conversation(mut self, cb: impl FnOnce(String) + 'static) -> Self {
        self.on_open_conversation = Some(Box::new(cb));
        self
    }

    pub fn with_working_directory(mut self, dir: impl Into<String>) -> Self {
        self.working_directory = Some(dir.into());
        self
    }
}

impl<'a> Widget for TerminalTimelineRow<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let is_conversation_link = self.block.presentation.as_deref() == Some("conversation-link");
        let failed = self.block.status == "finished"
            && self.block.exit_code.is_some()
            && self.block.exit_code.unwrap() != 0;
        let succeeded = self.block.status == "finished" && !failed;
        let should_collapse = succeeded
            && self.block.source.as_deref() != Some("user")
            && !self.is_expanded
            && !self.is_selected;

        ui.horizontal(|ui| {
            // Avatar container
            if self.has_user_avatar {
                ui.allocate_exact_size(egui::vec2(24.0, 24.0), egui::Sense::hover());
            } else {
                ui.allocate_exact_size(egui::vec2(24.0, 24.0), egui::Sense::hover());
            }

            ui.add_space(12.0);

            // Terminal block card
            if is_conversation_link && self.block.conversation_id.is_some() {
                // Conversation link summary
                let label = self
                    .block
                    .conversation_title
                    .clone()
                    .unwrap_or_else(|| "Return to AI conversation".to_string());
                if ui
                    .button(
                        RichText::new(format!("▶ {}", label))
                            .color(Color32::from_rgb(48, 184, 111)),
                    )
                    .clicked()
                {
                    if let Some(cb) = self.on_open_conversation {
                        cb(self.block.conversation_id.clone().unwrap());
                    }
                }
            } else if should_collapse {
                // Collapsed summary
                let label = &self.block.command;
                if ui
                    .button(
                        RichText::new(format!("✓ {}", label))
                            .color(Color32::from_rgb(244, 247, 246).gamma_multiply(0.92)),
                    )
                    .clicked()
                {
                    if let Some(cb) = self.on_expand {
                        cb(self.block.id.clone());
                    }
                }
            } else {
                // Expanded detail
                ui.vertical(|ui| {
                    // Top bar for non-failed, non-user blocks
                    if !failed && self.block.source.as_deref() != Some("user") {
                        let top_bar_bg = Color32::from_rgb(45, 47, 47).gamma_multiply(0.96);
                        egui::Frame::NONE
                            .fill(top_bar_bg)
                            .inner_margin(egui::vec2(12.0, 0.0))
                            .show(ui, |ui| {
                                ui.horizontal(|ui| {
                                    ui.set_min_height(36.0);
                                    if self.is_selected {
                                        ui.label(RichText::new("✓").size(17.0).color(Color32::from_rgb(48, 184, 111)));
                                        ui.label(RichText::new("Viewing command detail").size(13.0).strong());
                                    } else {
                                        ui.label(RichText::new("$").size(15.0).color(Color32::from_rgb(48, 184, 111)));
                                        ui.label(
                                            RichText::new(&self.block.command)
                                                .size(13.0)
                                                .strong(),
                                        );
                                    }
                                    if ui
                                        .button(RichText::new("▼").size(16.0).weak())
                                        .clicked()
                                    {
                                        if let Some(cb) = self.on_collapse {
                                            cb(self.block.id.clone());
                                        }
                                    }
                                });
                            });
                    }

                    // Body
                    let body_bg = if failed {
                        Color32::from_rgb(255, 95, 87).gamma_multiply(0.03)
                    } else if self.is_selected {
                        Color32::from_rgb(45, 36, 22).gamma_multiply(0.82)
                    } else {
                        Color32::TRANSPARENT
                    };

                    egui::Frame::NONE
                        .fill(body_bg)
                        .inner_margin(egui::vec2(16.0, 14.0))
                        .show(ui, |ui| {
                            ui.vertical(|ui| {
                                // Header
                                ui.horizontal(|ui| {
                                    ui.label(
                                        RichText::new("~")
                                            .monospace()
                                            .size(12.0)
                                            .color(Color32::from_rgb(244, 247, 246).gamma_multiply(0.58)),
                                    );
                                    let duration_text = match self.block.duration_ms {
                                        Some(ms) if ms < 1000 => {
                                            format!("{:.3}s", ms as f64 / 1000.0)
                                        }
                                        Some(ms) => format!("{:.2}s", ms as f64 / 1000.0),
                                        None => "running".to_string(),
                                    };
                                    ui.label(
                                        RichText::new(format!("({})", duration_text))
                                            .monospace()
                                            .size(12.0)
                                            .color(Color32::from_rgb(244, 247, 246).gamma_multiply(0.58)),
                                    );
                                });

                                ui.add_space(8.0);

                                // Command
                                ui.label(
                                    RichText::new(&self.block.command)
                                        .monospace()
                                        .size(13.0)
                                        .strong()
                                        .color(Color32::from_rgb(244, 247, 246).gamma_multiply(0.98)),
                                );

                                ui.add_space(8.0);

                                // Output
                                let output = self.block.output.trim_end();
                                let without_echo = if output.starts_with(&self.block.command) {
                                    output[self.block.command.len()..]
                                        .trim_start_matches('\n')
                                        .to_string()
                                } else {
                                    output.to_string()
                                };

                                let display_output = if without_echo.is_empty() {
                                    if self.block.status == "running" {
                                        "Running command...".to_string()
                                    } else {
                                        String::new()
                                    }
                                } else {
                                    without_echo
                                };

                                if !display_output.is_empty() {
                                    ui.label(
                                        RichText::new(display_output)
                                            .monospace()
                                            .size(13.0)
                                            .color(Color32::from_rgb(244, 247, 246).gamma_multiply(0.92)),
                                    );
                                }
                            });
                        });
                });
            }
        })
        .response
    }
}
