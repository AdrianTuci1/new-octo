use super::Window;
use eframe::egui;

#[derive(Default)]
pub struct AgentPanelWindow {
    pub input: String,
    pub show_open_in_app: bool,
}

impl AgentPanelWindow {
    pub fn new() -> Self {
        Self::default()
    }
}

impl Window for AgentPanelWindow {
    fn show(&mut self, ctx: &egui::Context, _open: &mut bool) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.vertical_centered(|ui| {
                ui.heading("Agent Panel");
                ui.add_space(12.0);
                
                let response = ui.text_edit_singleline(&mut self.input);
                if response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                    // TODO: dispatch agent command
                }
                
                ui.add_space(8.0);
                if ui.button("Send").clicked() {
                    // TODO: dispatch agent command
                }
                
                if self.show_open_in_app {
                    ui.add_space(8.0);
                    if ui.button("Open in App").clicked() {
                        // TODO: open app window
                    }
                }
            });
        });
    }
}
