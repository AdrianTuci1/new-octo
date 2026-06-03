use egui::{Response, RichText, Ui};

pub struct IconProps {
    pub icon: char,
    pub size: f32,
    pub color: Option<egui::Color32>,
}

impl Default for IconProps {
    fn default() -> Self {
        Self {
            icon: '•',
            size: 16.0,
            color: None,
        }
    }
}

pub fn render_icon(ui: &mut Ui, props: &IconProps) -> Response {
    let mut text = RichText::new(props.icon.to_string()).size(props.size);
    if let Some(c) = props.color {
        text = text.color(c);
    }
    ui.label(text)
}
