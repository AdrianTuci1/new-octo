use egui::{Response, Ui, Widget};

pub struct ChatFindOverlay<'a> {
    query: &'a mut Option<String>,
}

impl<'a> ChatFindOverlay<'a> {
    pub fn new(query: &'a mut Option<String>) -> Self {
        Self { query }
    }
}

impl<'a> Widget for ChatFindOverlay<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        egui::Frame::popup(ui.style())
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label("Find:");
                    let mut text = self.query.clone().unwrap_or_default();
                    let response = ui.add(egui::TextEdit::singleline(&mut text).desired_width(200.0));
                    *self.query = Some(text);
                    if ui.button("✕").clicked() {
                        *self.query = None;
                    }
                    response
                })
                .inner
            })
            .inner
    }
}
