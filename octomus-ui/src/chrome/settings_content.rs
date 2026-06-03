use crate::chrome::workspace_types::*;
use crate::chrome::settings_data::*;
use egui::*;

pub struct SettingsContentProps {
    pub section_id: String,
}

impl Default for SettingsContentProps {
    fn default() -> Self {
        Self {
            section_id: SETTINGS_DEFAULT_SECTION_ID.to_string(),
        }
    }
}

pub fn render_settings_content(ui: &mut Ui, props: &SettingsContentProps) {
    let meta = get_settings_section_meta(&props.section_id);
    
    ui.vertical(|ui| {
        ui.add_space(16.0);
        ui.heading(&meta.title);
        ui.add_space(4.0);
        ui.label(RichText::new(&meta.description).color(ui.visuals().weak_text_color()).size(13.0));
        ui.add_space(16.0);
        ui.separator();
        ui.add_space(16.0);
        
        match meta.content_kind {
            SettingsSectionContentKind::Profile => {
                ui.label("Profile settings coming soon.");
            }
            SettingsSectionContentKind::OctoAgent => {
                ui.label("Agent settings coming soon.");
            }
            SettingsSectionContentKind::Appearance => {
                ui.label("Appearance settings coming soon.");
            }
            SettingsSectionContentKind::KeyboardShortcuts => {
                ui.label("Keyboard shortcuts settings coming soon.");
            }
            SettingsSectionContentKind::CodeIndexing => {
                ui.label("Code indexing settings coming soon.");
            }
            SettingsSectionContentKind::EditorCodeReview => {
                ui.label("Code review settings coming soon.");
            }
            SettingsSectionContentKind::CloudTerminals => {
                ui.label("Cloud terminal settings coming soon.");
            }
            _ => {
                ui.label("Choose a section from the sidebar.");
            }
        }
    });
}
