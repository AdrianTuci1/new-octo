use crate::chrome::workspace_types::*;
use egui::*;

#[derive(Debug, Clone, Default)]
pub struct WorkspaceTopbarState {
    pub tabs: Vec<WorkspaceChromeTab>,
    pub active_tab_id: Option<String>,
    pub launcher_tab_id: Option<String>,
    pub hovered_tab_id: Option<String>,
    pub is_moving: bool,
    pub is_sidebar_open: bool,
    pub is_agents_active: bool,
    pub active_pane_context: Option<WorkspaceActivePaneContext>,
}

pub struct WorkspaceTopbarProps {
    pub on_add_tab: Option<Box<dyn FnMut()>>,
    pub on_close_tab: Option<Box<dyn FnMut(String)>>,
    pub on_select_tab: Option<Box<dyn FnMut(String)>>,
    pub on_move_tab_left: Option<Box<dyn FnMut(String)>>,
    pub on_move_tab_right: Option<Box<dyn FnMut(String)>>,
    pub on_rename_tab: Option<Box<dyn FnMut(String, String)>>,
    pub on_toggle_sidebar: Option<Box<dyn FnMut()>>,
    pub on_toggle_agents: Option<Box<dyn FnMut()>>,
    pub on_new_terminal_tab: Option<Box<dyn FnMut()>>,
    pub on_open_settings_section: Option<Box<dyn FnMut(Option<String>)>>,
    pub on_open_keyboard_shortcuts_drawer: Option<Box<dyn FnMut()>>,
}

impl Default for WorkspaceTopbarProps {
    fn default() -> Self {
        Self {
            on_add_tab: None,
            on_close_tab: None,
            on_select_tab: None,
            on_move_tab_left: None,
            on_move_tab_right: None,
            on_rename_tab: None,
            on_toggle_sidebar: None,
            on_toggle_agents: None,
            on_new_terminal_tab: None,
            on_open_settings_section: None,
            on_open_keyboard_shortcuts_drawer: None,
        }
    }
}

pub fn render_workspace_topbar(ui: &mut Ui, props: &mut WorkspaceTopbarProps, state: &mut WorkspaceTopbarState) {
    ui.horizontal(|ui| {
        // Left actions
        ui.horizontal(|ui| {
            if ui.selectable_label(state.is_sidebar_open, "☰").clicked() {
                if let Some(ref mut cb) = props.on_toggle_sidebar {
                    cb();
                }
            }
            if ui.selectable_label(state.is_agents_active, "🤖").clicked() {
                if let Some(ref mut cb) = props.on_toggle_agents {
                    cb();
                }
            }
        });
        
        ui.separator();
        
        // Tab list
        ScrollArea::horizontal().show(ui, |ui| {
            ui.horizontal(|ui| {
                for tab in &state.tabs {
                    let is_active = state.active_tab_id.as_ref() == Some(&tab.id);
                    let is_hovered = state.hovered_tab_id.as_ref() == Some(&tab.id);
                    let tab_label = tab.custom_label.as_ref().unwrap_or(&tab.label);
                    
                    let bg = if is_active {
                        ui.visuals().selection.bg_fill
                    } else if is_hovered {
                        ui.visuals().widgets.hovered.bg_fill
                    } else {
                        ui.visuals().panel_fill
                    };
                    
                    let frame = Frame::group(ui.style()).fill(bg);
                    let inner_response = frame.show(ui, |ui| {
                        ui.horizontal(|ui| {
                            if let Some(ref tint) = tab.tint_color {
                                ui.label(RichText::new("●").color(parse_color(tint)));
                            }
                            ui.label(RichText::new(tab_label).size(12.0));
                            if let Some(ref status) = tab.last_execution_status {
                                ui.label(RichText::new(status).size(10.0));
                            }
                            if ui.button("✕").clicked() {
                                if let Some(ref mut cb) = props.on_close_tab {
                                    cb(tab.id.clone());
                                }
                            }
                        });
                    });
                    
                    let response = inner_response.response;
                    if response.clicked() {
                        if let Some(ref mut cb) = props.on_select_tab {
                            cb(tab.id.clone());
                        }
                    }
                    if response.hovered() {
                        state.hovered_tab_id = Some(tab.id.clone());
                    }
                    
                    response.context_menu(|ui| {
                        if ui.button("Move left").clicked() {
                            if let Some(ref mut cb) = props.on_move_tab_left {
                                cb(tab.id.clone());
                            }
                            ui.close_menu();
                        }
                        if ui.button("Move right").clicked() {
                            if let Some(ref mut cb) = props.on_move_tab_right {
                                cb(tab.id.clone());
                            }
                            ui.close_menu();
                        }
                        if ui.button("Rename").clicked() {
                            if let Some(ref mut cb) = props.on_rename_tab {
                                cb(tab.id.clone(), format!("{}", tab_label));
                            }
                            ui.close_menu();
                        }
                    });
                }
            });
        });
        
        // Right actions
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if ui.button("⌨").clicked() {
                if let Some(ref mut cb) = props.on_open_keyboard_shortcuts_drawer {
                    cb();
                }
            }
            if ui.button("⚙").clicked() {
                if let Some(ref mut cb) = props.on_open_settings_section {
                    cb(None);
                }
            }
            if ui.button("+").clicked() {
                if let Some(ref mut cb) = props.on_new_terminal_tab {
                    cb();
                }
            }
        });
    });
}

fn parse_color(hex: &str) -> Color32 {
    if hex.starts_with('#') && hex.len() == 7 {
        let r = u8::from_str_radix(&hex[1..3], 16).unwrap_or(255);
        let g = u8::from_str_radix(&hex[3..5], 16).unwrap_or(255);
        let b = u8::from_str_radix(&hex[5..7], 16).unwrap_or(255);
        Color32::from_rgb(r, g, b)
    } else {
        Color32::WHITE
    }
}
