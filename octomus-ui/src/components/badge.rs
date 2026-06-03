use egui::{Response, RichText, Ui};

pub struct BadgeProps {
    pub label: String,
    pub color: Option<egui::Color32>,
}

impl Default for BadgeProps {
    fn default() -> Self {
        Self {
            label: String::new(),
            color: None,
        }
    }
}

pub fn render_badge(ui: &mut Ui, props: &BadgeProps) -> Response {
    let text = RichText::new(&props.label).small();
    let text = if let Some(c) = props.color {
        text.color(c)
    } else {
        text
    };
    ui.label(text)
}
