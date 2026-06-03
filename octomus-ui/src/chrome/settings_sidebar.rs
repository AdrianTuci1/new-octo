use crate::chrome::workspace_types::*;
use egui::*;

#[derive(Debug, Clone, Default)]
pub struct SettingsSidebarState {
    pub selected_item_id: Option<String>,
    pub expanded_groups: Vec<String>,
    pub search_query: String,
    pub is_open: bool,
}

pub struct SettingsSidebarProps {
    pub items: Vec<SettingsSidebarItem>,
    pub on_select_item: Option<Box<dyn FnMut(String)>>,
    pub on_toggle_group: Option<Box<dyn FnMut(String)>>,
    pub on_close: Option<Box<dyn FnMut()>>,
}

impl Default for SettingsSidebarProps {
    fn default() -> Self {
        Self {
            items: Vec::new(),
            on_select_item: None,
            on_toggle_group: None,
            on_close: None,
        }
    }
}

pub fn render_settings_sidebar(ui: &mut Ui, props: &mut SettingsSidebarProps, state: &mut SettingsSidebarState) {
    let mut on_select = props.on_select_item.take();
    let mut on_toggle = props.on_toggle_group.take();
    let mut on_close = props.on_close.take();
    
    ui.vertical(|ui| {
        ui.horizontal(|ui| {
            ui.label(RichText::new("Settings").size(16.0).strong());
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if ui.button("✕").clicked() {
                    if let Some(ref mut cb) = on_close {
                        cb();
                    }
                }
            });
        });
        ui.add_space(8.0);
        
        ui.horizontal(|ui| {
            ui.add(TextEdit::singleline(&mut state.search_query).hint_text("Search settings"));
        });
        ui.add_space(8.0);
        
        ScrollArea::vertical().show(ui, |ui| {
            for item in &props.items {
                render_settings_sidebar_item(ui, item, state, &mut on_select, &mut on_toggle);
            }
        });
    });
    
    props.on_select_item = on_select;
    props.on_toggle_group = on_toggle;
    props.on_close = on_close;
}

fn render_settings_sidebar_item(
    ui: &mut Ui,
    item: &SettingsSidebarItem,
    state: &mut SettingsSidebarState,
    on_select: &mut Option<Box<dyn FnMut(String)>>,
    on_toggle: &mut Option<Box<dyn FnMut(String)>>,
) {
    match item {
        SettingsSidebarItem::Heading(heading) => {
            ui.add_space(8.0);
            ui.label(RichText::new(&heading.label).size(10.0).color(ui.visuals().weak_text_color()));
            ui.add_space(4.0);
        }
        SettingsSidebarItem::Group(group) => {
            let is_expanded = state.expanded_groups.contains(&group.id);
            let header_response = ui.horizontal(|ui| {
                let icon = if is_expanded { "▼" } else { "▶" };
                ui.label(icon);
                ui.label(RichText::new(&group.label).size(12.0));
            });
            
            if header_response.response.clicked() {
                if let Some(ref mut cb) = on_toggle {
                    cb(group.id.clone());
                }
            }
            
            if is_expanded {
                ui.indent(group.id.clone(), |ui| {
                    for child in &group.children {
                        let is_selected = state.selected_item_id.as_ref() == Some(&child.id);
                        let child_response = ui.selectable_label(is_selected, &child.label);
                        if child_response.clicked() {
                            if let Some(ref mut cb) = on_select {
                                cb(child.id.clone());
                            }
                        }
                    }
                });
            }
        }
        SettingsSidebarItem::Leaf(leaf) => {
            let is_selected = state.selected_item_id.as_ref() == Some(&leaf.id);
            let response = ui.selectable_label(is_selected, &leaf.label);
            if response.clicked() {
                if let Some(ref mut cb) = on_select {
                    cb(leaf.id.clone());
                }
            }
        }
    }
}
