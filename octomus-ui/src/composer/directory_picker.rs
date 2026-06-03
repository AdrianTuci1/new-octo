use egui::{Response, Ui, Widget};

pub struct DirectoryPicker<'a> {
    path: &'a mut String,
}

impl<'a> DirectoryPicker<'a> {
    pub fn new(path: &'a mut String) -> Self {
        Self { path }
    }
}

impl<'a> Widget for DirectoryPicker<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        ui.horizontal(|ui| {
            ui.label("📁");
            ui.add(egui::TextEdit::singleline(self.path).desired_width(180.0))
        })
        .inner
    }
}
