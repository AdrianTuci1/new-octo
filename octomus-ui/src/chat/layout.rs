use egui::{Color32, Response, RichText, Ui, Widget};

pub struct ChatEmptyState {
    variant: String,
}

impl ChatEmptyState {
    pub fn new(variant: impl Into<String>) -> Self {
        Self {
            variant: variant.into(),
        }
    }
}

impl Widget for ChatEmptyState {
    fn ui(self, ui: &mut Ui) -> Response {
        if self.variant == "workspace" {
            ui.allocate_response(
                ui.available_size(),
                egui::Sense::hover(),
            )
        } else {
            ui.allocate_response(
                ui.available_size(),
                egui::Sense::hover(),
            )
        }
    }
}

pub struct ChatTopbar {
    title: String,
    show: bool,
}

impl ChatTopbar {
    pub fn new(title: impl Into<String>, show: bool) -> Self {
        Self {
            title: title.into(),
            show,
        }
    }
}

impl Widget for ChatTopbar {
    fn ui(self, ui: &mut Ui) -> Response {
        if !self.show {
            return ui.allocate_response(egui::Vec2::ZERO, egui::Sense::hover());
        }

        ui.horizontal(|ui| {
            ui.set_min_height(40.0);
            ui.add_space(18.0);

            ui.horizontal(|ui| {
                ui.label(
                    RichText::new("←")
                        .color(Color32::from_rgb(255, 255, 255).gamma_multiply(0.62))
                        .monospace()
                        .size(12.0),
                );
                ui.add_space(8.0);

                ui.label(
                    RichText::new("esc")
                        .monospace()
                        .size(10.0)
                        .color(Color32::from_rgb(255, 255, 255).gamma_multiply(0.85)),
                );
                ui.add_space(8.0);
                ui.label(
                    RichText::new("for terminal")
                        .size(11.0)
                        .color(Color32::from_rgb(255, 255, 255).gamma_multiply(0.62)),
                );
            });

            ui.with_layout(egui::Layout::top_down(egui::Align::Center), |ui| {
                ui.label(
                    RichText::new(self.title)
                        .size(11.0)
                        .strong()
                        .color(Color32::from_rgb(255, 255, 255).gamma_multiply(0.76)),
                );
            });
        })
        .response
    }
}
