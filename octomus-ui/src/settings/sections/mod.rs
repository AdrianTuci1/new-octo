pub mod agent;
pub mod appearance;
pub mod cloud;
pub mod code;
pub mod keyboard;
pub mod mcp;
pub mod profile;

use egui::Ui;
use crate::settings::SettingsSectionContentKind;

/// Render the content for a settings section based on its kind.
pub fn render_section(ui: &mut Ui, kind: &SettingsSectionContentKind) {
    match kind {
        SettingsSectionContentKind::Profile => {
            ui.label("Avatar, name, and local workspace identity.");
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                ui.label("Display name:");
                ui.text_edit_singleline(&mut String::from("User"));
            });
        }
        SettingsSectionContentKind::OctoAgent => {
            ui.label("Configure default agent behavior and task routing.");
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                ui.label("Default model:");
                ui.text_edit_singleline(&mut String::from("auto"));
            });
        }
        SettingsSectionContentKind::Appearance => {
            ui.label("Theme, layout, and typography preferences.");
            ui.add_space(8.0);
            ui.label("Coming soon: theme picker, font size, window transparency.");
        }
        SettingsSectionContentKind::McpServers => {
            ui.label("Connect and organize Model Context Protocol servers.");
            ui.add_space(8.0);
            ui.label("No MCP servers configured. Click '+' to add one.");
        }
        SettingsSectionContentKind::CloudTerminals => {
            ui.label("Configure cloud profiles and connectivity.");
            ui.add_space(8.0);
            ui.label("No cloud terminals configured.");
        }
        SettingsSectionContentKind::KeyboardShortcuts => {
            ui.label("Customize launcher and workspace keyboard shortcuts.");
            ui.add_space(8.0);
            ui.label("Default shortcuts:");
            ui.label("  Ctrl+Shift+P → Command palette");
            ui.label("  Ctrl+` → Toggle terminal");
            ui.label("  Ctrl+Shift+E → Toggle editor");
        }
        SettingsSectionContentKind::CodeIndexing => {
            ui.label("Tune project indexing and repository discovery.");
            ui.add_space(8.0);
            ui.label("Automatic codebase indexing: enabled");
        }
        SettingsSectionContentKind::EditorCodeReview => {
            ui.label("Configure code editing and review behavior.");
            ui.add_space(8.0);
            ui.label("Editor: integrated (egui-native)");
        }
        _ => {
            ui.label("Select a settings section from the sidebar to configure.");
        }
    }
}
