use egui::{Response, Ui};

pub struct ButtonProps {
    pub label: String,
    pub primary: bool,
    pub disabled: bool,
    pub icon: Option<char>,
}

impl Default for ButtonProps {
    fn default() -> Self {
        Self {
            label: String::new(),
            primary: false,
            disabled: false,
            icon: None,
        }
    }
}

pub fn render_button(ui: &mut Ui, props: &ButtonProps) -> Response {
    let mut button = egui::Button::new(&props.label);
    if props.disabled {
        button = button.sense(egui::Sense::hover());
    }
    let response = ui.add(button);
    if props.primary && response.hovered() && !props.disabled {
        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
    }
    response
}
