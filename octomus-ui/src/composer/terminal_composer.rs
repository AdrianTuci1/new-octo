use egui::{Color32, Frame, Margin, Response, RichText, CornerRadius, Sense, Ui, Vec2, Widget};

use super::branch_picker::GitBranchPicker;
use super::directory_picker::{DirectoryListing, WorkingDirectoryPicker};
use super::slash::SlashCommandHighlight;
use super::terminal_controller::TerminalComposerControllerState;

pub struct TerminalComposer<'a> {
    pub query: &'a mut String,
    pub controller: &'a TerminalComposerControllerState,
    pub working_directory: Option<&'a str>,
    pub working_directory_label: &'a str,
    pub working_directory_picker_open: bool,
    pub working_directory_listing: Option<&'a DirectoryListing>,
    pub working_directory_search: &'a str,
    pub git_branches: &'a [String],
    pub git_current_branch: &'a str,
    pub git_branch_menu_open: bool,
    pub runtime_node_version: Option<&'a str>,
    pub remote_session_label: Option<&'a str>,
    pub remote_session_title: Option<&'a str>,
    pub show_open_in_app: bool,
}

impl<'a> TerminalComposer<'a> {
    pub fn new(query: &'a mut String, controller: &'a TerminalComposerControllerState) -> Self {
        Self {
            query,
            controller,
            working_directory: None,
            working_directory_label: "~",
            working_directory_picker_open: false,
            working_directory_listing: None,
            working_directory_search: "",
            git_branches: &[],
            git_current_branch: "",
            git_branch_menu_open: false,
            runtime_node_version: None,
            remote_session_label: None,
            remote_session_title: None,
            show_open_in_app: false,
        }
    }
}

impl<'a> Widget for TerminalComposer<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let shell_bg = ui.visuals().widgets.inactive.bg_fill;

        Frame::none()
            .fill(shell_bg)
            .inner_margin(Margin::same(0))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    // Context row
                    ui.horizontal(|ui| {
                        if let Some(version) = self.runtime_node_version {
                            ui.add(
                                egui::Button::new(
                                    RichText::new(format!("🖥 {}", version))
                                        .size(10.0)
                                        .color(Color32::from_rgb(141, 215, 255)),
                                )
                                .sense(Sense::hover())
                                .fill(Color32::TRANSPARENT)
                                .corner_radius(CornerRadius::same(8))
                                .min_size(Vec2::new(0.0, 24.0)),
                            );
                        }

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

                        if !self.git_branches.is_empty() {
                            ui.add(GitBranchPicker::new(self.git_current_branch, self.git_branches));
                        }
                    });

                    ui.add_space(4.0);

                    // Body
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            if self.controller.show_recommendation() {
                                if let Some(ref action) = self.controller.recommended_action {
                                    ui.add(
                                        egui::Button::new(
                                            RichText::new(format!("✨  {}  ↑↵", action))
                                                .size(11.0)
                                                .color(ui.visuals().text_color()),
                                        )
                                        .sense(Sense::click())
                                        .fill(Color32::from_rgba_premultiplied(255, 255, 255, 20))
                                        .corner_radius(CornerRadius::same(4)),
                                    );
                                }
                            }

                            if let Some(suffix) = self.controller.prediction_suffix() {
                                ui.add(
                                    egui::Label::new(
                                        RichText::new(format!("{}{}", self.query, suffix))
                                            .size(12.0)
                                            .color(Color32::from_rgba_premultiplied(255, 255, 255, 87)),
                                    )
                                    .selectable(false),
                                );
                            }

                            ui.add(SlashCommandHighlight::new(self.query).with_extra_class("terminal-composer-input-highlight"));

                            let mut text = self.query.clone();
                            let text_edit = egui::TextEdit::multiline(&mut text)
                                .desired_rows(2)
                                .desired_width(f32::INFINITY)
                                .font(egui::TextStyle::Monospace)
                                .hint_text("Run commands");
                            let _te_resp = ui.add(text_edit);
                            if text != *self.query {
                                *self.query = text;
                            }

                            if self.controller.show_completion_panel() {
                                Frame::none()
                                    .fill(Color32::from_rgba_premultiplied(0, 0, 0, 40))
                                    .inner_margin(Margin::same(8))
                                    .corner_radius(CornerRadius::same(8))
                                    .show(ui, |ui| {
                                        ui.horizontal(|ui| {
                                            ui.label(
                                                RichText::new("shell completions")
                                                    .size(9.0)
                                                    .strong()
                                                    .color(Color32::from_rgba_premultiplied(255, 255, 255, 180)),
                                            );
                                            if let Some(ref state) = self.controller.completion_state {
                                                if let Some(ref fmt) = state.format {
                                                    ui.label(
                                                        RichText::new(fmt).size(9.0).color(Color32::from_rgba_premultiplied(255, 255, 255, 140)),
                                                    );
                                                }
                                                if state.prompt_visible {
                                                    ui.label(
                                                        RichText::new("prompt")
                                                            .size(9.0)
                                                            .color(Color32::from_rgba_premultiplied(255, 255, 255, 140)),
                                                    );
                                                }
                                                if state.status == "finished" {
                                                    ui.label(
                                                        RichText::new("done")
                                                            .size(9.0)
                                                            .color(Color32::from_rgba_premultiplied(255, 255, 255, 140)),
                                                    );
                                                }
                                            }
                                        });

                                        let items = self.controller.completion_items();
                                        if items.is_empty() {
                                            ui.label(
                                                RichText::new("Waiting for shell completion output.")
                                                    .size(11.0)
                                                    .color(Color32::from_rgba_premultiplied(255, 255, 255, 180)),
                                            );
                                        } else {
                                            for item in items.iter().take(6) {
                                                ui.horizontal(|ui| {
                                                    ui.label(
                                                        RichText::new(&item.name)
                                                            .size(12.0)
                                                            .color(ui.visuals().text_color())
                                                            .strong(),
                                                    );
                                                    if let Some(ref desc) = item.description {
                                                        ui.label(
                                                            RichText::new(desc)
                                                                .size(11.0)
                                                                .color(Color32::from_rgba_premultiplied(255, 255, 255, 140)),
                                                        );
                                                    }
                                                });
                                            }
                                        }

                                        if let Some(ref state) = self.controller.completion_state {
                                            if let Some(ref last) = state.last_value {
                                                ui.label(
                                                    RichText::new(last)
                                                        .size(10.0)
                                                        .color(Color32::from_rgba_premultiplied(255, 255, 255, 120)),
                                                );
                                            }
                                        }
                                    });
                            }
                        });
                    });

                    ui.add_space(4.0);

                    // Footer row
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new("⌘ ↵ new /agent conversation")
                                .size(10.0)
                                .color(Color32::from_rgba_premultiplied(255, 255, 255, 140)),
                        );

                        if self.show_open_in_app {
                            ui.add(
                                egui::Button::new(RichText::new("⌘ x open in app").size(10.0))
                                    .sense(Sense::click())
                                    .fill(Color32::TRANSPARENT)
                                    .corner_radius(CornerRadius::same(6)),
                            );
                        }
                    });
                });
            })
            .response
    }
}
