use crate::chrome::workspace_types::*;
use crate::editor::{EditorWidget, EditorTab};
use crate::state::editor::{EditorState, EditorStore};
use egui::*;

#[derive(Debug, Clone, Default)]
pub struct DrawersState {
    pub is_keyboard_shortcuts_open: bool,
    pub keyboard_shortcuts_query: String,
    pub editor_width: f32,
    pub model_drawer_width: f32,
    pub profile_drawer_width: f32,
    pub cloud_profile_drawer_width: f32,
    pub rules_drawer_width: f32,
    pub code_review_drawer_width: f32,
    pub keyboard_shortcuts_width: f32,
    pub is_resizing_editor: bool,
    pub is_resizing_keyboard_shortcuts: bool,
}

impl DrawersState {
    pub fn new() -> Self {
        Self {
            editor_width: 600.0,
            model_drawer_width: 450.0,
            profile_drawer_width: 450.0,
            cloud_profile_drawer_width: 450.0,
            rules_drawer_width: 450.0,
            code_review_drawer_width: 620.0,
            keyboard_shortcuts_width: 410.0,
            ..Default::default()
        }
    }
}

pub struct AppWindowDrawersProps {
    pub is_editor_open: bool,
    pub is_keyboard_shortcuts_drawer_open: bool,
    pub active_working_directory: Option<String>,
    pub on_close_keyboard_shortcuts: Option<Box<dyn FnMut()>>,
}

impl Default for AppWindowDrawersProps {
    fn default() -> Self {
        Self {
            is_editor_open: false,
            is_keyboard_shortcuts_drawer_open: false,
            active_working_directory: None,
            on_close_keyboard_shortcuts: None,
        }
    }
}

pub fn render_app_window_drawers(
    ui: &mut Ui,
    props: &mut AppWindowDrawersProps,
    state: &mut DrawersState,
    editor_widget: &mut EditorWidget,
    editor_store: &EditorStore,
    ui_state: &crate::state::ui::UiState,
) {
    let has_any_drawer = props.is_editor_open
        || ui_state.is_model_drawer_open
        || ui_state.is_cloud_profile_drawer_open
        || ui_state.is_profile_drawer_open
        || ui_state.is_rules_drawer_open
        || ui_state.is_code_review_drawer_open
        || props.is_keyboard_shortcuts_drawer_open;
    
    if !has_any_drawer {
        return;
    }
    
    // Editor drawer
    if props.is_editor_open {
        render_editor_drawer(ui, state, editor_widget, editor_store);
    }
    
    // Keyboard shortcuts drawer
    if props.is_keyboard_shortcuts_drawer_open {
        render_keyboard_shortcuts_drawer(ui, state, props);
    }
    
    // Other drawers (model, profile, etc.) - placeholder implementations
    if ui_state.is_model_drawer_open {
        render_generic_drawer(ui, "Model Management", state.model_drawer_width, 20);
    }
    if ui_state.is_cloud_profile_drawer_open {
        render_generic_drawer(ui, "Cloud Profile", state.cloud_profile_drawer_width, 21);
    }
    if ui_state.is_profile_drawer_open {
        render_generic_drawer(ui, "Profile Editor", state.profile_drawer_width, 22);
    }
    if ui_state.is_rules_drawer_open {
        render_generic_drawer(ui, "Rules", state.rules_drawer_width, 24);
    }
    if ui_state.is_code_review_drawer_open {
        render_generic_drawer(ui, "Code Review", state.code_review_drawer_width, 24);
    }
}

fn render_editor_drawer(
    ui: &mut Ui,
    state: &mut DrawersState,
    editor_widget: &mut EditorWidget,
    _editor_store: &EditorStore,
) {
    let available = ui.available_size();
    let drawer_width = state.editor_width.min(available.x * 0.8).max(300.0);
    
    SidePanel::right("editor_drawer")
        .resizable(true)
        .default_width(drawer_width)
        .min_width(300.0)
        .max_width(available.x * 0.8)
        .show_inside(ui, |ui| {
            render_editor_workspace(ui, editor_widget);
        });
}

fn render_editor_workspace(
    ui: &mut Ui,
    editor_widget: &mut EditorWidget,
) {
    ui.vertical(|ui| {
        // Editor tabs
        ui.horizontal(|ui| {
            let tab_count = editor_widget.tabs.len();
            for i in 0..tab_count {
                let tab_id = editor_widget.tabs[i].id.clone();
                let tab_label = if editor_widget.tabs[i].is_modified {
                    format!("{} ●", editor_widget.tabs[i].label)
                } else {
                    editor_widget.tabs[i].label.clone()
                };
                let is_active = editor_widget.active_tab_id.as_ref() == Some(&tab_id);
                let response = ui.selectable_label(is_active, &tab_label);
                if response.clicked() {
                    editor_widget.select_tab(&tab_id);
                }
                if is_active && ui.small_button("×").clicked() {
                    editor_widget.close_tab(&tab_id);
                }
            }
            if !editor_widget.tabs.is_empty() {
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui.small_button("×").clicked() {
                        editor_widget.close_all_tabs();
                    }
                });
            }
        });
        ui.separator();
        
        // Editor content
        let active_content = editor_widget.active_tab().map(|t| t.content.clone());
        if let Some(content) = active_content {
            ScrollArea::both().show(ui, |ui| {
                let mut text = content;
                ui.add(TextEdit::multiline(&mut text)
                    .code_editor()
                    .desired_rows(20));
            });
        } else {
            ui.vertical_centered(|ui| {
                ui.add_space(64.0);
                ui.label(RichText::new("📝").size(48.0));
                ui.label("Select a file to edit");
            });
        }
    });
}

fn render_keyboard_shortcuts_drawer(
    ui: &mut Ui,
    state: &mut DrawersState,
    props: &mut AppWindowDrawersProps,
) {
    let available = ui.available_size();
    let drawer_width = state.keyboard_shortcuts_width.min(available.x * 0.8).max(320.0);
    
    SidePanel::right("keyboard_shortcuts_drawer")
        .resizable(true)
        .default_width(drawer_width)
        .min_width(320.0)
        .max_width(available.x * 0.8)
        .show_inside(ui, |ui| {
            ui.vertical(|ui| {
                // Header
                ui.horizontal(|ui| {
                    ui.add_space(ui.available_width() - 40.0);
                    if ui.button("✕").clicked() {
                        if let Some(ref mut cb) = props.on_close_keyboard_shortcuts {
                            cb();
                        }
                    }
                });
                ui.heading("Keyboard shortcuts");
                ui.add_space(4.0);
                ui.label(RichText::new("Quick reference").weak().size(12.0));
                ui.label(RichText::new("Browse the shortcuts registered in the backend shortcut catalog.").weak().size(12.0));
                ui.add_space(8.0);
                
                // Search
                ui.horizontal(|ui| {
                    ui.label("🔍");
                    ui.add(TextEdit::singleline(&mut state.keyboard_shortcuts_query)
                        .hint_text("Search by name or keys"));
                });
                ui.separator();
                
                // Shortcuts list
                ScrollArea::vertical().show(ui, |ui| {
                    let shortcuts = keyboard_shortcut_rows();
                    let query = state.keyboard_shortcuts_query.trim().to_lowercase();
                    let filtered: Vec<&KeyboardShortcutRow> = shortcuts.iter()
                        .filter(|row| {
                            if query.is_empty() { return true; }
                            let command_match = row.command.to_lowercase().contains(&query);
                            let binding_match = row.bindings.iter().any(|b| {
                                b.keys.iter().any(|k| k.label.to_lowercase().contains(&query))
                            });
                            command_match || binding_match
                        })
                        .collect();
                    
                    if filtered.is_empty() {
                        ui.label("No shortcuts match your search.");
                    } else {
                        for (idx, row) in filtered.iter().enumerate() {
                            let bg = if idx % 2 == 0 {
                                ui.visuals().faint_bg_color
                            } else {
                                ui.visuals().panel_fill
                            };
                            Frame::group(ui.style()).fill(bg).show(ui, |ui| {
                                ui.horizontal(|ui| {
                                    ui.label(RichText::new(&row.command).size(13.0));
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        if row.bindings.is_empty() {
                                            ui.label(RichText::new("Not assigned").weak().size(11.0));
                                        } else {
                                            for binding in &row.bindings {
                                                let keys: Vec<String> = binding.keys.iter()
                                                    .map(|k| k.label.clone())
                                                    .collect();
                                                ui.label(RichText::new(keys.join(" + ")).monospace().size(11.0));
                                            }
                                        }
                                    });
                                });
                            });
                        }
                    }
                });
            });
        });
}

fn render_generic_drawer(ui: &mut Ui, title: &str, width: f32, _z_index: i32) {
    let available = ui.available_size();
    let drawer_width = width.min(available.x * 0.8).max(300.0);
    
    SidePanel::right(format!("drawer_{}", title))
        .resizable(true)
        .default_width(drawer_width)
        .min_width(300.0)
        .max_width(available.x * 0.8)
        .show_inside(ui, |ui| {
            ui.heading(title);
            ui.label("Drawer content coming soon.");
        });
}

fn keyboard_shortcut_rows() -> Vec<KeyboardShortcutRow> {
    vec![
        KeyboardShortcutRow {
            command: "Close".to_string(),
            bindings: vec![KeyboardShortcutBinding {
                keys: vec![
                    KeyboardShortcutKey { label: "⌘".to_string(), accent: true },
                    KeyboardShortcutKey { label: "W".to_string(), accent: true },
                ],
            }],
        },
        KeyboardShortcutRow {
            command: "Create New Tab".to_string(),
            bindings: vec![KeyboardShortcutBinding {
                keys: vec![
                    KeyboardShortcutKey { label: "⌘".to_string(), accent: true },
                    KeyboardShortcutKey { label: "T".to_string(), accent: true },
                ],
            }],
        },
        KeyboardShortcutRow {
            command: "Clear Blocks".to_string(),
            bindings: vec![KeyboardShortcutBinding {
                keys: vec![
                    KeyboardShortcutKey { label: "⌘".to_string(), accent: true },
                    KeyboardShortcutKey { label: "K".to_string(), accent: true },
                ],
            }],
        },
        KeyboardShortcutRow {
            command: "Copy".to_string(),
            bindings: vec![KeyboardShortcutBinding {
                keys: vec![
                    KeyboardShortcutKey { label: "⌘".to_string(), accent: true },
                    KeyboardShortcutKey { label: "C".to_string(), accent: true },
                ],
            }],
        },
        KeyboardShortcutRow {
            command: "Focus Terminal Input".to_string(),
            bindings: vec![KeyboardShortcutBinding {
                keys: vec![
                    KeyboardShortcutKey { label: "⌘".to_string(), accent: true },
                    KeyboardShortcutKey { label: "L".to_string(), accent: true },
                ],
            }],
        },
        KeyboardShortcutRow {
            command: "Find in Terminal".to_string(),
            bindings: vec![KeyboardShortcutBinding {
                keys: vec![
                    KeyboardShortcutKey { label: "⌘".to_string(), accent: true },
                    KeyboardShortcutKey { label: "F".to_string(), accent: true },
                ],
            }],
        },
        KeyboardShortcutRow {
            command: "Cancel Active Process".to_string(),
            bindings: vec![KeyboardShortcutBinding {
                keys: vec![
                    KeyboardShortcutKey { label: "^".to_string(), accent: true },
                    KeyboardShortcutKey { label: "C".to_string(), accent: true },
                ],
            }],
        },
        KeyboardShortcutRow {
            command: "New Agent Pane".to_string(),
            bindings: vec![KeyboardShortcutBinding {
                keys: vec![
                    KeyboardShortcutKey { label: "^".to_string(), accent: false },
                    KeyboardShortcutKey { label: "Space".to_string(), accent: false },
                ],
            }],
        },
    ]
}
