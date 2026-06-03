use egui::{Response, Ui, Widget};

pub struct MentionPicker<'a> {
    query: &'a str,
}

impl<'a> MentionPicker<'a> {
    pub fn new(query: &'a str) -> Self {
        Self { query }
    }

    fn extract_trigger(query: &str) -> Option<&str> {
        query.rsplit('@').next()
    }
}

impl<'a> Widget for MentionPicker<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let trigger = match Self::extract_trigger(self.query) {
            Some(t) if !t.is_empty() => t,
            _ => return ui.label(""),
        };

        let suggestions: Vec<&str> = vec!["file", "symbol", "terminal", "git"]
            .into_iter()
            .filter(|s| s.starts_with(trigger))
            .collect();

        if suggestions.is_empty() {
            return ui.label("");
        }

        egui::Frame::popup(ui.style())
            .show(ui, |ui| {
                ui.set_max_width(200.0);
                for suggestion in suggestions {
                    if ui.selectable_label(false, format!("@{}", suggestion)).clicked() {
                        // mention selected
                    }
                }
            })
            .response
    }
}
