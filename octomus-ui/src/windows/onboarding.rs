use super::Window;
use eframe::egui;

#[derive(Default)]
pub struct OnboardingWindow {
    step: usize,
    completed: bool,
}

impl OnboardingWindow {
    pub fn is_completed(&self) -> bool {
        self.completed
    }
}

impl Window for OnboardingWindow {
    fn show(&mut self, ctx: &egui::Context, open: &mut bool) {
        egui::Window::new("Welcome to Octomus")
            .open(open)
            .collapsible(false)
            .resizable(false)
            .default_size([480.0, 320.0])
            .show(ctx, |ui| {
                ui.label(format!("Step {}/3", self.step + 1));
                ui.separator();
                match self.step {
                    0 => {
                        ui.heading("Welcome");
                        ui.label("Octomus is your AI-powered workspace.");
                    }
                    1 => {
                        ui.heading("Setup");
                        ui.label("Configure your preferences.");
                    }
                    2 => {
                        ui.heading("Ready");
                        ui.label("You are all set!");
                    }
                    _ => {}
                }
                ui.separator();
                ui.horizontal(|ui| {
                    if self.step > 0 && ui.button("Back").clicked() {
                        self.step -= 1;
                    }
                    if self.step < 2 && ui.button("Next").clicked() {
                        self.step += 1;
                    }
                    if self.step == 2 && ui.button("Finish").clicked() {
                        self.completed = true;
                    }
                });
            });
    }
}
