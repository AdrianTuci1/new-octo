use egui::{Button, Color32, Response, RichText, Ui, Widget};

pub struct ApprovalRow {
    command: String,
    on_approve: Option<Box<dyn FnOnce()>>,
    on_reject: Option<Box<dyn FnOnce()>>,
}

impl ApprovalRow {
    pub fn new(command: impl Into<String>) -> Self {
        Self {
            command: command.into(),
            on_approve: None,
            on_reject: None,
        }
    }

    pub fn on_approve(mut self, callback: impl FnOnce() + 'static) -> Self {
        self.on_approve = Some(Box::new(callback));
        self
    }

    pub fn on_reject(mut self, callback: impl FnOnce() + 'static) -> Self {
        self.on_reject = Some(Box::new(callback));
        self
    }
}

impl Widget for ApprovalRow {
    fn ui(self, ui: &mut Ui) -> Response {
        egui::Frame::NONE
            .fill(Color32::from_rgb(45, 45, 50))
            .corner_radius(egui::CornerRadius::same(8))
            .inner_margin(egui::vec2(12.0, 8.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new("⚠ Command approval").strong());
                    ui.label(RichText::new(self.command.as_str()).monospace());
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.add(Button::new("Reject").fill(Color32::from_rgb(160, 60, 60))).clicked() {
                            if let Some(cb) = self.on_reject {
                                cb();
                            }
                        }
                        if ui.add(Button::new("Approve").fill(Color32::from_rgb(60, 140, 60))).clicked() {
                            if let Some(cb) = self.on_approve {
                                cb();
                            }
                        }
                    });
                })
                .response
            })
            .response
    }
}
