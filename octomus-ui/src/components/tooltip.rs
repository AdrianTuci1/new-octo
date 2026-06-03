use egui::Response;

pub struct TooltipProps {
    pub text: String,
}

pub fn render_tooltip(response: &mut Response, props: &TooltipProps) {
    let text = props.text.clone();
    let new_resp = response.clone().on_hover_text(text);
    *response = new_resp;
}
