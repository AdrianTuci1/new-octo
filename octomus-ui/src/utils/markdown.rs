use egui::{RichText, Ui};

pub struct MarkdownRenderer;

impl Default for MarkdownRenderer {
    fn default() -> Self {
        Self
    }
}

impl MarkdownRenderer {
    pub fn show(&mut self, ui: &mut Ui, markdown: &str) {
        for line in markdown.lines() {
            if line.starts_with("# ") {
                ui.heading(&line[2..]);
            } else if line.starts_with("## ") {
                ui.heading(RichText::new(&line[3..]).size(20.0));
            } else if line.starts_with("- ") {
                ui.label(format!("  • {}", &line[2..]));
            } else if line.starts_with("```") {
                // skip code fences
            } else {
                ui.label(line);
            }
        }
    }
}
