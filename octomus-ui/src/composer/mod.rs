use egui::{Response, Ui, Widget};

use crate::composer::{
    branch_picker::BranchPicker, directory_picker::DirectoryPicker, input::ComposerInput,
    mentions::MentionPicker, model_picker::ModelPicker, slash::SlashAutocomplete,
};

pub mod branch_picker;
pub mod directory_picker;
pub mod input;
pub mod mentions;
pub mod model_picker;
pub mod slash;

pub struct ComposerBar {
    input_text: String,
    selected_model: Option<String>,
    working_directory: Option<String>,
    selected_branch: Option<String>,
}

impl ComposerBar {
    pub fn new() -> Self {
        Self {
            input_text: String::new(),
            selected_model: None,
            working_directory: None,
            selected_branch: None,
        }
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.selected_model = Some(model.into());
        self
    }

    pub fn with_directory(mut self, dir: impl Into<String>) -> Self {
        self.working_directory = Some(dir.into());
        self
    }

    pub fn with_branch(mut self, branch: impl Into<String>) -> Self {
        self.selected_branch = Some(branch.into());
        self
    }
}

impl Widget for ComposerBar {
    fn ui(self, ui: &mut Ui) -> Response {
        let mut input_text = self.input_text;
        let mut selected_model = self.selected_model;
        let mut working_directory = self.working_directory;
        let mut selected_branch = self.selected_branch;

        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.add(ComposerInput::new(&mut input_text));
                if ui.button("➤").clicked() {
                    // submit
                }
            });

            ui.horizontal(|ui| {
                if let Some(ref mut model) = selected_model {
                    ui.add(ModelPicker::new(model));
                }
                if let Some(ref mut dir) = working_directory {
                    ui.add(DirectoryPicker::new(dir));
                }
                if let Some(ref mut branch) = selected_branch {
                    ui.add(BranchPicker::new(branch));
                }
            });

            if input_text.starts_with('/') {
                ui.add(SlashAutocomplete::new(&input_text));
            }

            if input_text.contains('@') {
                ui.add(MentionPicker::new(&input_text));
            }
        })
        .response
    }
}
