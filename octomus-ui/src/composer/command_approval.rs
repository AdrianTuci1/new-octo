use egui::{Color32, Frame, Margin, Response, RichText, CornerRadius, Sense, Stroke, Ui, Vec2, Widget};

/// CommandApprovalComposer — 1:1 port of React `CommandApprovalComposer.tsx`.
pub struct CommandApprovalComposer<'a> {
    pub command: &'a str,
    pub explanation: Option<&'a str>,
    pub on_approve: &'a mut dyn FnMut(),
    pub on_reject: &'a mut dyn FnMut(),
    pub on_edit: &'a mut dyn FnMut(),
}

impl<'a> CommandApprovalComposer<'a> {
    pub fn new(command: &'a str, on_approve: &'a mut dyn FnMut(), on_reject: &'a mut dyn FnMut(), on_edit: &'a mut dyn FnMut()) -> Self {
        Self {
            command,
            explanation: None,
            on_approve,
            on_reject,
            on_edit,
        }
    }

    pub fn with_explanation(mut self, explanation: &'a str) -> Self {
        self.explanation = Some(explanation);
        self
    }
}

impl<'a> Widget for CommandApprovalComposer<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let bg = ui.visuals().widgets.inactive.bg_fill;
        let text_color = ui.visuals().text_color();
        let dim = Color32::from_rgba_premultiplied(255, 255, 255, 140);
        let soft = Color32::from_rgba_premultiplied(255, 255, 255, 180);

        Frame::none()
            .fill(bg)
            .stroke(Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 20)))
            .corner_radius(CornerRadius::same(12))
            .inner_margin(Margin::same(16))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("Approve this command?")
                            .size(13.0)
                            .color(text_color)
                            .strong(),
                    );
                    ui.add_space(8.0);

                    Frame::none()
                        .fill(Color32::from_rgba_premultiplied(0, 0, 0, 40))
                        .corner_radius(CornerRadius::same(8))
                        .inner_margin(Margin::same(12))
                        .show(ui, |ui| {
                            ui.label(
                                RichText::new(self.command)
                                    .size(12.0)
                                    .color(Color32::from_rgb(68, 201, 127))
                                    .monospace(),
                            );
                        });

                    if let Some(explanation) = self.explanation {
                        ui.add_space(8.0);
                        ui.label(
                            RichText::new(explanation)
                                .size(11.0)
                                .color(dim),
                        );
                    }

                    ui.add_space(12.0);

                    ui.horizontal(|ui| {
                        let approve = ui.add(
                            egui::Button::new(
                                RichText::new("Approve")
                                    .size(11.0)
                                    .color(Color32::WHITE)
                                    .strong(),
                            )
                            .sense(Sense::click())
                            .fill(Color32::from_rgb(68, 201, 127))
                            .corner_radius(CornerRadius::same(8))
                            .min_size(Vec2::new(100.0, 32.0)),
                        );
                        if approve.clicked() {
                            (self.on_approve)();
                        }

                        let reject = ui.add(
                            egui::Button::new(
                                RichText::new("Reject")
                                    .size(11.0)
                                    .color(soft),
                            )
                            .sense(Sense::click())
                            .fill(Color32::TRANSPARENT)
                            .corner_radius(CornerRadius::same(8))
                            .min_size(Vec2::new(80.0, 32.0)),
                        );
                        if reject.clicked() {
                            (self.on_reject)();
                        }

                        let edit = ui.add(
                            egui::Button::new(
                                RichText::new("Edit")
                                    .size(11.0)
                                    .color(soft),
                            )
                            .sense(Sense::click())
                            .fill(Color32::TRANSPARENT)
                            .corner_radius(CornerRadius::same(8))
                            .min_size(Vec2::new(80.0, 32.0)),
                        );
                        if edit.clicked() {
                            (self.on_edit)();
                        }
                    });
                });
            })
            .response
    }
}
