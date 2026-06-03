use super::Window;
use eframe::egui;

#[derive(Default)]
pub struct SettingsWindow {
    selected_tab: SettingsTab,
}

#[derive(Default, PartialEq)]
enum SettingsTab {
    #[default]
    General,
    Appearance,
    Keybindings,
    Cloud,
}

impl Window for SettingsWindow {
    fn show(&mut self, ctx: &egui::Context, open: &mut bool) {
        egui::Window::new("Settings")
            .open(open)
            .default_size([520.0, 400.0])
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.selectable_value(&mut self.selected_tab, SettingsTab::General, "General");
                    ui.selectable_value(&mut self.selected_tab, SettingsTab::Appearance, "Appearance");
                    ui.selectable_value(&mut self.selected_tab, SettingsTab::Keybindings, "Keybindings");
                    ui.selectable_value(&mut self.selected_tab, SettingsTab::Cloud, "Cloud");
                });
                ui.separator();
                match self.selected_tab {
                    SettingsTab::General => {
                        ui.label("General settings");
                    }
                    SettingsTab::Appearance => {
                        ui.label("Appearance settings");
                    }
                    SettingsTab::Keybindings => {
                        ui.label("Keybindings settings");
                    }
                    SettingsTab::Cloud => {
                        ui.label("Cloud settings");
                    }
                }
            });
    }
}
