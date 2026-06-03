use super::Window;
use eframe::egui;

#[derive(Default)]
pub struct LauncherWindow {
    input: String,
}

impl LauncherWindow {
    pub fn new() -> Self {
        Self::default()
    }
}

impl Window for LauncherWindow {
    fn show(&mut self, ctx: &egui::Context, _open: &mut bool) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.vertical_centered(|ui| {
                ui.heading("Octomus Launcher");
                ui.add_space(12.0);

                let response = ui.text_edit_singleline(&mut self.input);
                if response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                    // TODO: dispatch command
                }

                ui.add_space(8.0);
                if ui.button("Run").clicked() {
                    // TODO: dispatch command
                }
            });
        });
    }
}
