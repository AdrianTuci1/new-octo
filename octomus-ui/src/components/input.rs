use egui::{Response, TextEdit, Ui};

pub struct InputProps {
    pub value: String,
    pub placeholder: String,
    pub multiline: bool,
    pub password: bool,
}

impl Default for InputProps {
    fn default() -> Self {
        Self {
            value: String::new(),
            placeholder: String::new(),
            multiline: false,
            password: false,
        }
    }
}

pub fn render_input(ui: &mut Ui, props: &mut InputProps) -> Response {
    if props.multiline {
        ui.add(
            TextEdit::multiline(&mut props.value)
                .hint_text(&props.placeholder)
                .desired_rows(3),
        )
    } else {
        ui.add(
            TextEdit::singleline(&mut props.value)
                .hint_text(&props.placeholder)
                .password(props.password),
        )
    }
}
