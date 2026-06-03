use egui::{Response, Ui, Widget};

pub struct ModelPicker<'a> {
    selected: &'a mut String,
}

impl<'a> ModelPicker<'a> {
    pub fn new(selected: &'a mut String) -> Self {
        Self { selected }
    }

    fn models() -> &'static [&'static str] {
        &["gpt-4o", "gpt-4o-mini", "claude-sonnet-4", "claude-opus-4", "o3-mini"]
    }
}

impl<'a> Widget for ModelPicker<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        egui::ComboBox::from_label("")
            .selected_text(self.selected.as_str())
            .show_ui(ui, |ui| {
                for model in Self::models() {
                    ui.selectable_value(self.selected, model.to_string(), *model);
                }
            })
            .response
    }
}
