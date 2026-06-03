use egui::{Color32, Response, Ui, Widget};

pub struct SlashCommandHighlight<'a> {
    pub text: &'a str,
    pub extra_class: Option<&'a str>,
}

impl<'a> SlashCommandHighlight<'a> {
    pub fn new(text: &'a str) -> Self {
        Self { text, extra_class: None }
    }

    pub fn with_extra_class(mut self, class: &'a str) -> Self {
        self.extra_class = Some(class);
        self
    }
}

impl<'a> Widget for SlashCommandHighlight<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let text_color = ui.visuals().text_color();
        let accent = Color32::from_rgb(0, 163, 255);

        let mut job = egui::text::LayoutJob::default();
        for word in self.text.split_whitespace() {
            if word.starts_with('/') {
                job.append(word, 0.0, egui::TextFormat {
                    color: accent,
                    font_id: egui::FontId::monospace(12.0),
                    ..Default::default()
                });
            } else if word.starts_with('@') {
                job.append(word, 0.0, egui::TextFormat {
                    color: Color32::from_rgb(168, 129, 255),
                    font_id: egui::FontId::monospace(12.0),
                    ..Default::default()
                });
            } else {
                job.append(word, 0.0, egui::TextFormat {
                    color: text_color,
                    font_id: egui::FontId::monospace(12.0),
                    ..Default::default()
                });
            }
            job.append(" ", 0.0, egui::TextFormat::default());
        }

        ui.add(egui::Label::new(job).selectable(false))
    }
}
