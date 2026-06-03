#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::NativeOptions;
use octomus_ui::app::OctomusApp;

fn main() {
    let options = NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([960.0, 640.0])
            .with_min_inner_size([640.0, 480.0]),
        ..Default::default()
    };

    eframe::run_native(
        "Octomus",
        options,
        Box::new(|cc| Ok(Box::new(OctomusApp::new(cc)))),
    )
    .expect("failed to run Octomus UI");
}
