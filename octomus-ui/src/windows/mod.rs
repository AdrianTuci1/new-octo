pub mod launcher;
pub mod onboarding;
pub mod settings;

pub trait Window {
    fn show(&mut self, ctx: &egui::Context, open: &mut bool);
}
