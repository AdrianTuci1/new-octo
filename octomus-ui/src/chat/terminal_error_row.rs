use egui::{Color32, Response, RichText, Ui, Widget};

pub struct TerminalErrorRow {
    error: String,
}

impl TerminalErrorRow {
    pub fn new(error: impl Into<String>) -> Self {
        Self {
            error: error.into(),
        }
    }
}

impl Widget for TerminalErrorRow {
    fn ui(self, ui: &mut Ui) -> Response {
        ui.horizontal(|ui| {
            // Avatar spacer
            ui.allocate_exact_size(egui::vec2(24.0, 24.0), egui::Sense::hover());
            ui.add_space(12.0);

            // Error box
            egui::Frame::NONE
                .fill(Color32::from_rgb(255, 95, 87).gamma_multiply(0.045))
                .stroke(egui::Stroke::new(
                    1.0,
                    Color32::from_rgb(255, 95, 87).gamma_multiply(0.12),
                ))
                .corner_radius(egui::CornerRadius::same(10))
                .inner_margin(egui::vec2(16.0, 12.0))
                .show(ui, |ui| {
                    ui.label(
                        RichText::new(&self.error)
                            .monospace()
                            .size(11.0)
                            .color(Color32::from_rgb(255, 184, 184))
                            .line_height(Some(15.0)),
                    );
                });
        })
        .response
    }
}
