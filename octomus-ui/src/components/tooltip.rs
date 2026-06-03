use egui::{Response, Ui};

pub struct TooltipProps {
    pub text: String,
}

pub fn render_tooltip(response: &Response, props: &TooltipProps) {
    response.on_hover_text(&props.text);
}
