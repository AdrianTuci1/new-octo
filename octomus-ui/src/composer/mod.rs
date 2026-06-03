pub mod branch_picker;
pub mod command_approval;
pub mod composer_state;
pub mod context_menu;
pub mod context_menu_store;
pub mod controller;
pub mod directory_picker;
pub mod input_selection;
pub mod mentions;
pub mod model_setup;
pub mod slash;
pub mod terminal_composer;
pub mod terminal_controller;

pub use branch_picker::*;
pub use command_approval::*;
pub use composer_state::*;
pub use context_menu::*;
pub use context_menu_store::*;
pub use controller::*;
pub use directory_picker::*;
pub use input_selection::*;
pub use mentions::*;
pub use model_setup::*;
pub use slash::*;
pub use terminal_composer::*;
pub use terminal_controller::*;

use egui::{Color32, Frame, Margin, Response, RichText, CornerRadius, Sense, Stroke, Ui, Vec2, Widget};

/// Main ComposerBar widget — 1:1 port of React `ComposerBar.tsx`.
pub struct ComposerBar<'a> {
    pub query: &'a mut String,
    pub composer_placeholder: &'a str,
    pub show_input_hint_text: bool,
    pub view_mode: &'a str,
    pub model_setup_required: bool,
    pub selected_model_label: &'a str,
    pub selected_model_supports_attachments: bool,
    pub context_usage_progress: f32,
    pub context_indicator_tone: &'a str,
    pub context_usage_title: Option<&'a str>,
    pub context_indicator_title: Option<&'a str>,
    pub attached_files: &'a [crate::state::chat::ChatAttachment],
    pub working_directory: Option<&'a str>,
    pub working_directory_label: &'a str,
    pub working_directory_picker_open: bool,
    pub working_directory_listing: Option<&'a DirectoryListing>,
    pub working_directory_search: &'a str,
    pub git_branches: &'a [String],
    pub git_current_branch: Option<&'a str>,
    pub git_branch_menu_open: bool,
    pub terminal_auto_detect_enabled: bool,
    pub restrict_actions: bool,
    pub remote_session_label: Option<&'a str>,
    pub remote_session_title: Option<&'a str>,
    pub recommended_action: Option<&'a str>,
    pub recommended_action_description: Option<&'a str>,
    pub prediction_completion_text: Option<&'a str>,
    pub prediction_full_command: Option<&'a str>,
}

impl<'a> ComposerBar<'a> {
    pub fn new(query: &'a mut String) -> Self {
        Self {
            query,
            composer_placeholder: "Octomus anything, or use / for tools",
            show_input_hint_text: true,
            view_mode: "agent",
            model_setup_required: false,
            selected_model_label: "Auto",
            selected_model_supports_attachments: false,
            context_usage_progress: 0.0,
            context_indicator_tone: "agent",
            context_usage_title: None,
            context_indicator_title: None,
            attached_files: &[],
            working_directory: None,
            working_directory_label: "~",
            working_directory_picker_open: false,
            working_directory_listing: None,
            working_directory_search: "",
            git_branches: &[],
            git_current_branch: None,
            git_branch_menu_open: false,
            terminal_auto_detect_enabled: true,
            restrict_actions: false,
            remote_session_label: None,
            remote_session_title: None,
            recommended_action: None,
            recommended_action_description: None,
            prediction_completion_text: None,
            prediction_full_command: None,
        }
    }
}

impl<'a> Widget for ComposerBar<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let shell_bg = ui.visuals().widgets.inactive.bg_fill;
        let text_color = ui.visuals().text_color();
        let dim_color = Color32::from_rgba_premultiplied(255, 255, 255, 140);
        let soft_color = Color32::from_rgba_premultiplied(255, 255, 255, 180);

        Frame::none()
            .fill(shell_bg)
            .inner_margin(Margin::same(0))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    ui.set_min_height(90.0);

                    // Input row
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            // Recommendation chip
                            if let Some(action) = self.recommended_action {
                                if self.query.is_empty() {
                                    ui.add(
                                        egui::Button::new(
                                            RichText::new(format!("✨  {}  ↑↵", action))
                                                .size(11.0)
                                                .color(text_color),
                                        )
                                        .sense(Sense::click())
                                        .fill(Color32::from_rgba_premultiplied(255, 255, 255, 20))
                                        .stroke(Stroke::new(1.0, Color32::from_rgba_premultiplied(168, 129, 255, 60)))
                                        .corner_radius(CornerRadius::same(4)),
                                    );
                                }
                            }

                            // Suggestion overlay
                            if let Some(suffix) = self.prediction_completion_text {
                                ui.add(
                                    egui::Label::new(
                                        RichText::new(format!("{}{}", self.query, suffix))
                                            .size(12.0)
                                            .color(Color32::from_rgba_premultiplied(255, 255, 255, 87)),
                                    )
                                    .selectable(false),
                                );
                            }

                            // Slash / mention highlight
                            ui.add(SlashCommandHighlight::new(self.query));

                            // Textarea
                            let placeholder = if self.view_mode == "shell" {
                                "Run a terminal command"
                            } else if self.show_input_hint_text {
                                self.composer_placeholder
                            } else {
                                "Octomus anything, or use / for tools"
                            };
                            let mut text = self.query.clone();
                            let text_color_override = if self.view_mode == "shell" {
                                Color32::from_rgb(68, 201, 127)
                            } else {
                                text_color
                            };
                            let te = egui::TextEdit::multiline(&mut text)
                                .desired_rows(if self.recommended_action.is_some() && self.query.is_empty() { 1 } else { 2 })
                                .desired_width(f32::INFINITY)
                                .font(egui::TextStyle::Monospace)
                                .hint_text(placeholder)
                                .text_color(text_color_override);
                            let _te_resp = ui.add(te);
                            if text != *self.query {
                                *self.query = text;
                            }

                            // Model setup card
                            if self.model_setup_required {
                                ui.add_space(8.0);
                                ui.add(ModelSetupOverlay::new());
                            }
                        });
                    });

                    ui.add_space(8.0);

                    // Attachments strip
                    if !self.attached_files.is_empty() {
                        Frame::none()
                            .fill(Color32::from_rgba_premultiplied(255, 255, 255, 8))
                            .stroke(Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 20)))
                            .corner_radius(CornerRadius::same(10))
                            .inner_margin(Margin::same(10))
                            .show(ui, |ui| {
                                ui.horizontal(|ui| {
                                    ui.label(
                                        RichText::new(format!(
                                            "{} attached file{}",
                                            self.attached_files.len(),
                                            if self.attached_files.len() == 1 { "" } else { "s" }
                                        ))
                                        .size(11.0)
                                        .color(dim_color),
                                    );
                                    ui.add(
                                        egui::Button::new(RichText::new("Clear all").size(11.0).color(soft_color))
                                            .fill(Color32::TRANSPARENT)
                                            .sense(Sense::click()),
                                    );
                                });

                                ui.horizontal_wrapped(|ui| {
                                    for file in self.attached_files {
                                        ui.add(
                                            egui::Button::new(
                                                RichText::new(format!("📎  {}  ✕", file.name))
                                                    .size(11.0)
                                                    .color(text_color),
                                            )
                                            .sense(Sense::click())
                                            .fill(Color32::from_rgba_premultiplied(0, 163, 255, 30))
                                            .stroke(Stroke::new(1.0, Color32::from_rgba_premultiplied(0, 163, 255, 46)))
                                            .corner_radius(CornerRadius::same(255))
                                            .min_size(Vec2::new(0.0, 24.0)),
                                        );
                                    }
                                });
                            });
                        ui.add_space(8.0);
                    }

                    // Action bar
                    if !self.restrict_actions {
                        ui.horizontal(|ui| {
                            // Left actions
                            ui.horizontal(|ui| {
                                if let Some(label) = self.remote_session_label {
                                    ui.add(
                                        egui::Button::new(
                                            RichText::new(format!("🔌 {}", label))
                                                .size(10.0)
                                                .color(Color32::from_rgb(141, 215, 255))
                                                .strong(),
                                        )
                                        .sense(Sense::hover())
                                        .fill(Color32::TRANSPARENT)
                                        .corner_radius(CornerRadius::same(8))
                                        .min_size(Vec2::new(0.0, 24.0)),
                                    );
                                }

                                if let Some(_dir) = self.working_directory {
                                    ui.add(WorkingDirectoryPicker::new(self.working_directory_label));
                                }

                                if let Some(current) = self.git_current_branch {
                                    if !self.git_branches.is_empty() {
                                        ui.add(GitBranchPicker::new(current, self.git_branches));
                                    }
                                }

                                let auto_detect_active = self.terminal_auto_detect_enabled;
                                ui.add(
                                    egui::Button::new(
                                        RichText::new("A*")
                                            .size(10.0)
                                            .color(if auto_detect_active {
                                                Color32::from_rgb(0, 163, 255)
                                            } else {
                                                soft_color
                                            }),
                                    )
                                    .sense(Sense::click())
                                    .fill(ui.visuals().widgets.inactive.bg_fill)
                                    .corner_radius(CornerRadius::same(8))
                                    .min_size(Vec2::new(0.0, 24.0)),
                                );
                            });

                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                // Attach button
                                let can_attach = !self.model_setup_required && self.selected_model_supports_attachments;
                                let attach_tooltip = if self.model_setup_required {
                                    "Set up a model first"
                                } else if can_attach {
                                    "Attach files"
                                } else {
                                    "Selected model does not support attachments"
                                };
                                let attach_resp = ui.add(
                                    egui::Button::new(RichText::new("+").size(12.0))
                                        .sense(if can_attach { Sense::click() } else { Sense::hover() })
                                        .fill(ui.visuals().widgets.inactive.bg_fill)
                                        .corner_radius(CornerRadius::same(8))
                                        .min_size(Vec2::new(24.0, 24.0)),
                                );
                                let attach_resp = attach_resp.on_hover_text(attach_tooltip);
                                let _ = attach_resp;

                                // Model chip
                                let model_resp = ui.add(
                                    egui::Button::new(
                                        RichText::new(self.selected_model_label)
                                            .size(10.0)
                                            .color(soft_color),
                                    )
                                    .sense(Sense::click())
                                    .fill(ui.visuals().widgets.inactive.bg_fill)
                                    .corner_radius(CornerRadius::same(8))
                                    .min_size(Vec2::new(0.0, 24.0)),
                                );
                                let model_resp = model_resp.on_hover_text(self.context_indicator_title.unwrap_or("Model"));
                                let _ = model_resp;

                                // Context ring indicator
                                let progress = self.context_usage_progress.clamp(0.0, 1.0);
                                let radius: f32 = 7.0;
                                let ring_color = match self.context_indicator_tone {
                                    "terminal" => Color32::from_rgb(214, 245, 177),
                                    _ => Color32::from_rgb(79, 209, 197),
                                };

                                let (rect, ring_resp) = ui.allocate_exact_size(
                                    Vec2::splat(20.0),
                                    Sense::hover(),
                                );
                                let painter = ui.painter_at(rect);
                                let center = rect.center();
                                let track_stroke = egui::Stroke::new(2.0, Color32::from_rgba_premultiplied(255, 255, 255, 40));
                                let progress_stroke = egui::Stroke::new(2.0, ring_color);

                                painter.circle_stroke(center, radius, track_stroke);
                                if progress > 0.001 {
                                    let points: Vec<egui::Pos2> = (0..=60)
                                        .map(|i| {
                                            let angle = -std::f32::consts::FRAC_PI_2 + (i as f32 / 60.0) * 2.0 * std::f32::consts::PI * progress;
                                            center + radius * egui::vec2(angle.cos(), angle.sin())
                                        })
                                        .collect();
                                    if points.len() >= 2 {
                                        painter.line(points, progress_stroke);
                                    }
                                }

                                let tooltip_text = self.context_usage_title.unwrap_or("Context usage");
                                let _ = ring_resp.on_hover_text(tooltip_text);
                            });
                        });
                    }
                });
            })
            .response
    }
}
