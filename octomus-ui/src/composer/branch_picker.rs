use egui::{Response, Ui, Widget};

pub struct BranchPicker<'a> {
    branch: &'a mut String,
}

impl<'a> BranchPicker<'a> {
    pub fn new(branch: &'a mut String) -> Self {
        Self { branch }
    }

    fn branches() -> &'static [&'static str] {
        &["main", "master", "develop", "staging"]
    }
}

impl<'a> Widget for BranchPicker<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        egui::ComboBox::from_label("")
            .selected_text(self.branch.as_str())
            .show_ui(ui, |ui| {
                for branch in Self::branches() {
                    ui.selectable_value(self.branch, branch.to_string(), *branch);
                }
            })
            .response
    }
}
