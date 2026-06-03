use egui::{Color32, Response, RichText, Ui, Widget};

pub struct DiffView {
    path: String,
    diff: String,
}

impl DiffView {
    pub fn new(path: impl Into<String>, diff: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            diff: diff.into(),
        }
    }

    fn render_line(&self, ui: &mut Ui, line: &str) {
        let trimmed = line.trim_end();
        if trimmed.starts_with('+') {
            ui.colored_label(Color32::from_rgb(100, 200, 100), trimmed);
        } else if trimmed.starts_with('-') {
            ui.colored_label(Color32::from_rgb(200, 100, 100), trimmed);
        } else if trimmed.starts_with("@@") {
            ui.label(RichText::new(trimmed).monospace().color(Color32::YELLOW));
        } else {
            ui.label(RichText::new(trimmed).monospace());
        }
    }
}

impl Widget for DiffView {
    fn ui(self, ui: &mut Ui) -> Response {
        egui::Frame::dark_canvas(ui.style())
            .inner_margin(egui::vec2(8.0, 6.0))
            .rounding(egui::Rounding::same(6.0))
            .show(ui, |ui| {
                ui.label(RichText::new(format!("📄 {}", self.path)).strong());
                ui.separator();
                egui::ScrollArea::vertical()
                    .max_height(300.0)
                    .show(ui, |ui| {
                        for line in self.diff.lines() {
                            self.render_line(ui, line);
                        }
                    });
            })
            .response
    }
}
