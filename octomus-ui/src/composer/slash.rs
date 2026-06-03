use egui::{Response, Ui, Widget};

pub struct SlashAutocomplete<'a> {
    query: &'a str,
}

impl<'a> SlashAutocomplete<'a> {
    pub fn new(query: &'a str) -> Self {
        Self { query }
    }

    fn commands() -> &'static [(&'static str, &'static str)] {
        &[
            ("/explain", "Explain the selected code"),
            ("/fix", "Fix issues in the selected code"),
            ("/test", "Generate tests for the selected code"),
            ("/doc", "Generate documentation"),
            ("/commit", "Generate a commit message"),
            ("/review", "Review the current changes"),
        ]
    }
}

impl<'a> Widget for SlashAutocomplete<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let prefix = self.query.split_whitespace().next().unwrap_or(self.query);
        let matches: Vec<_> = Self::commands()
            .iter()
            .filter(|(cmd, _)| cmd.starts_with(prefix))
            .collect();

        if matches.is_empty() {
            return ui.label("");
        }

        egui::Frame::popup(ui.style())
            .show(ui, |ui| {
                ui.set_max_width(280.0);
                for (cmd, desc) in matches {
                    if ui.selectable_label(false, format!("{} — {}", cmd, desc)).clicked() {
                        // command selected
                    }
                }
            })
            .response
    }
}
