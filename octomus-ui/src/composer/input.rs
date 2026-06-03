use egui::{Response, TextEdit, Ui, Widget};

pub struct ComposerInput<'a> {
    text: &'a mut String,
}

impl<'a> ComposerInput<'a> {
    pub fn new(text: &'a mut String) -> Self {
        Self { text }
    }
}

impl<'a> Widget for ComposerInput<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        ui.add(
            TextEdit::multiline(self.text)
                .desired_rows(3)
                .desired_width(f32::INFINITY)
                .hint_text("Type a message..."),
        )
    }
}
