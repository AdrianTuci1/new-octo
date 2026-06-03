use egui::{Color32, Frame, Margin, Response, RichText, CornerRadius, Sense, Stroke, Ui, Vec2, Widget};

/// ModelSetupOverlay — 1:1 port of React `ModelSetupOverlay.tsx`.
pub struct ModelSetupOverlay;

impl ModelSetupOverlay {
    pub fn new() -> Self {
        Self
    }
}

impl Widget for ModelSetupOverlay {
    fn ui(self, ui: &mut Ui) -> Response {
        let bg = ui.visuals().widgets.inactive.bg_fill;
        let text_color = ui.visuals().text_color();
        let dim = Color32::from_rgba_premultiplied(255, 255, 255, 140);

        Frame::none()
            .fill(bg)
            .stroke(Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 20)))
            .corner_radius(CornerRadius::same(12))
            .inner_margin(Margin::same(16))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("Set up a model to start chatting")
                            .size(13.0)
                            .color(text_color)
                            .strong(),
                    );
                    ui.add_space(4.0);
                    ui.label(
                        RichText::new("Choose a model provider to enable chat features.")
                            .size(11.0)
                            .color(dim),
                    );
                    ui.add_space(12.0);

                    ui.horizontal(|ui| {
                        let setup = ui.add(
                            egui::Button::new(
                                RichText::new("Set up model")
                                    .size(11.0)
                                    .color(Color32::WHITE)
                                    .strong(),
                            )
                            .sense(Sense::click())
                            .fill(Color32::from_rgb(0, 163, 255))
                            .corner_radius(CornerRadius::same(8))
                            .min_size(Vec2::new(120.0, 32.0)),
                        );
                        let _ = setup;

                        let back = ui.add(
                            egui::Button::new(
                                RichText::new("Back")
                                    .size(11.0)
                                    .color(dim),
                            )
                            .sense(Sense::click())
                            .fill(Color32::TRANSPARENT)
                            .corner_radius(CornerRadius::same(8))
                            .min_size(Vec2::new(80.0, 32.0)),
                        );
                        let _ = back;
                    });
                });
            })
            .response
    }
}
