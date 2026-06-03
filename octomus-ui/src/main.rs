#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::NativeOptions;
use octomus_ui::app::OctomusApp;

fn main() {
    let options = NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1280.0, 800.0])
            .with_min_inner_size([800.0, 600.0])
            .with_title("Octomus"),
        ..Default::default()
    };

    eframe::run_native(
        "Octomus",
        options,
        Box::new(|cc| Ok(Box::new(OctomusApp::new(cc)))),
    )
    .expect("failed to run Octomus UI");
}
