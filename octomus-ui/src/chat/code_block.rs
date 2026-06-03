use egui::{Response, RichText, Ui, Widget};
use syntect::{
    easy::HighlightLines,
    highlighting::ThemeSet,
    parsing::SyntaxSet,
    util::LinesWithEndings,
};

pub struct CodeBlock {
    language: Option<String>,
    code: String,
}

impl CodeBlock {
    pub fn new(language: Option<String>, code: String) -> Self {
        Self { language, code }
    }

    fn highlight(&self, ui: &mut Ui) {
        let syntax_set = SyntaxSet::load_defaults_newlines();
        let theme_set = ThemeSet::load_defaults();
        let theme = &theme_set.themes["base16-ocean.dark"];

        let syntax = self
            .language
            .as_ref()
            .and_then(|lang| syntax_set.find_syntax_by_token(lang))
            .unwrap_or_else(|| syntax_set.find_syntax_plain_text());

        let mut highlighter = HighlightLines::new(syntax, theme);

        for line in LinesWithEndings::from(&self.code) {
            let highlighted = highlighter.highlight_line(line, &syntax_set).unwrap_or_default();
            let mut job = egui::text::LayoutJob::default();
            for (style, text) in highlighted {
                let color = egui::Color32::from_rgb(
                    style.foreground.r,
                    style.foreground.g,
                    style.foreground.b,
                );
                job.append(
                    text,
                    0.0,
                    egui::TextFormat::simple(
                        egui::FontId::new(12.0, egui::FontFamily::Monospace),
                        color,
                    ),
                );
            }
            ui.label(job);
        }
    }
}

impl Widget for CodeBlock {
    fn ui(self, ui: &mut Ui) -> Response {
        egui::Frame::dark_canvas(ui.style())
            .inner_margin(egui::vec2(8.0, 6.0))
            .corner_radius(egui::CornerRadius::same(6))
            .show(ui, |ui| {
                if let Some(ref lang) = self.language {
                    ui.label(RichText::new(format!("{}", lang)).small().monospace());
                    ui.separator();
                }
                self.highlight(ui);
            })
            .response
    }
}
