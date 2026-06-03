use egui::{Color32, Response, RichText, Ui, Widget};

pub struct MultiAgentTimelineRow {
    agent_name: String,
    task_summary: String,
    status: String,
    color_scheme: String,
}

impl MultiAgentTimelineRow {
    pub fn new(
        agent_name: impl Into<String>,
        task_summary: impl Into<String>,
        status: impl Into<String>,
        color_scheme: Option<impl Into<String>>,
    ) -> Self {
        Self {
            agent_name: agent_name.into(),
            task_summary: task_summary.into(),
            status: status.into(),
            color_scheme: color_scheme.map(|c| c.into()).unwrap_or_else(|| "green".to_string()),
        }
    }
}

impl Widget for MultiAgentTimelineRow {
    fn ui(self, ui: &mut Ui) -> Response {
        let (accent, icon_bg, icon_border, border, border_hover, tag_bg) = match self.color_scheme.as_str() {
            "indigo" => (
                Color32::from_rgb(129, 140, 248),
                Color32::from_rgb(129, 140, 248).gamma_multiply(0.16),
                Color32::from_rgb(129, 140, 248).gamma_multiply(0.3),
                Color32::from_rgb(129, 140, 248).gamma_multiply(0.25),
                Color32::from_rgb(129, 140, 248).gamma_multiply(0.48),
                Color32::from_rgb(129, 140, 248).gamma_multiply(0.1),
            ),
            "pink" => (
                Color32::from_rgb(244, 114, 182),
                Color32::from_rgb(244, 114, 182).gamma_multiply(0.16),
                Color32::from_rgb(244, 114, 182).gamma_multiply(0.3),
                Color32::from_rgb(244, 114, 182).gamma_multiply(0.25),
                Color32::from_rgb(244, 114, 182).gamma_multiply(0.48),
                Color32::from_rgb(244, 114, 182).gamma_multiply(0.1),
            ),
            "teal" => (
                Color32::from_rgb(45, 212, 191),
                Color32::from_rgb(45, 212, 191).gamma_multiply(0.16),
                Color32::from_rgb(45, 212, 191).gamma_multiply(0.3),
                Color32::from_rgb(45, 212, 191).gamma_multiply(0.25),
                Color32::from_rgb(45, 212, 191).gamma_multiply(0.48),
                Color32::from_rgb(45, 212, 191).gamma_multiply(0.1),
            ),
            "amber" => (
                Color32::from_rgb(251, 191, 36),
                Color32::from_rgb(251, 191, 36).gamma_multiply(0.16),
                Color32::from_rgb(251, 191, 36).gamma_multiply(0.3),
                Color32::from_rgb(251, 191, 36).gamma_multiply(0.25),
                Color32::from_rgb(251, 191, 36).gamma_multiply(0.48),
                Color32::from_rgb(251, 191, 36).gamma_multiply(0.1),
            ),
            "sky" => (
                Color32::from_rgb(56, 189, 248),
                Color32::from_rgb(56, 189, 248).gamma_multiply(0.16),
                Color32::from_rgb(56, 189, 248).gamma_multiply(0.3),
                Color32::from_rgb(56, 189, 248).gamma_multiply(0.25),
                Color32::from_rgb(56, 189, 248).gamma_multiply(0.48),
                Color32::from_rgb(56, 189, 248).gamma_multiply(0.1),
            ),
            _ => (
                Color32::from_rgb(48, 184, 111),
                Color32::from_rgb(48, 184, 111).gamma_multiply(0.16),
                Color32::from_rgb(48, 184, 111).gamma_multiply(0.3),
                Color32::from_rgb(48, 184, 111).gamma_multiply(0.25),
                Color32::from_rgb(48, 184, 111).gamma_multiply(0.48),
                Color32::from_rgb(48, 184, 111).gamma_multiply(0.1),
            ),
        };

        let is_running = self.status == "running";

        egui::Frame::NONE
            .stroke(egui::Stroke::new(1.0, border))
            .corner_radius(egui::CornerRadius::same(8))
            .inner_margin(egui::vec2(12.0, 7.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    // Icon wrapper
                    egui::Frame::NONE
                        .fill(icon_bg)
                        .stroke(egui::Stroke::new(1.0, icon_border))
                        .corner_radius(egui::CornerRadius::same(6))
                        .show(ui, |ui| {
                            ui.set_min_size(egui::vec2(26.0, 26.0));
                            ui.centered_and_justified(|ui| {
                                if is_running {
                                    ui.label(
                                        RichText::new("◆")
                                            .size(15.0)
                                            .color(accent),
                                    );
                                } else if self.status == "completed" {
                                    ui.label(
                                        RichText::new("✓")
                                            .size(14.0)
                                            .color(accent),
                                    );
                                } else {
                                    ui.label(
                                        RichText::new("✕")
                                            .size(14.0)
                                            .color(Color32::from_rgb(248, 113, 113)),
                                    );
                                }
                            });
                        });

                    ui.add_space(12.0);

                    // Info
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new(&self.agent_name)
                                .size(12.0)
                                .strong()
                                .color(Color32::from_rgb(255, 255, 255).gamma_multiply(0.92)),
                        );
                        ui.label(
                            RichText::new(&self.task_summary)
                                .size(11.5)
                                .color(Color32::from_rgb(255, 255, 255).gamma_multiply(0.52)),
                        );
                    });

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if is_running {
                            if ui
                                .button(RichText::new("■").size(11.0).color(Color32::from_rgb(255, 255, 255).gamma_multiply(0.35)))
                                .clicked()
                            {
                                // Stop agent action
                            }
                        }
                    });
                })
                .response
            })
            .response
    }
}
