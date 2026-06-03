use egui::{Color32, Response, RichText, Ui, Widget};

pub struct MarkdownRenderer {
    source: String,
}

impl MarkdownRenderer {
    pub fn new(source: impl Into<String>) -> Self {
        Self {
            source: source.into(),
        }
    }
}

impl Widget for MarkdownRenderer {
    fn ui(self, ui: &mut Ui) -> Response {
        ui.vertical(|ui| {
            for line in self.source.lines() {
                if line.starts_with("### ") {
                    ui.heading(RichText::new(&line[4..]).strong());
                } else if line.starts_with("## ") {
                    ui.heading(RichText::new(&line[3..]).strong());
                } else if line.starts_with("# ") {
                    ui.heading(RichText::new(&line[2..]).strong());
                } else if line.starts_with("> ") {
                    ui.colored_label(Color32::GRAY, line);
                } else if line.starts_with("- ") || line.starts_with("* ") {
                    ui.horizontal(|ui| {
                        ui.label("  •");
                        ui.label(&line[2..]);
                    });
                } else if line.starts_with("```") {
                    ui.separator();
                } else if !line.is_empty() {
                    ui.label(line);
                } else {
                    ui.add_space(4.0);
                }
            }
        })
        .response
    }
}
