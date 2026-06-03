use crate::chrome::workspace_types::*;
use egui::*;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum SidebarMenu {
    #[default]
    Chat,
    Files,
    Search,
    History,
}

#[derive(Debug, Clone, Default)]
pub struct WorkspaceSidebarState {
    pub active_menu: SidebarMenu,
    pub menu_conversation_id: Option<String>,
    pub search_query: String,
}

pub struct WorkspaceSidebarProps {
    pub is_open: bool,
    pub on_close: Option<Box<dyn FnMut()>>,
    pub conversations: Vec<WorkspaceConversation>,
    pub open_conversation_ids: Vec<String>,
    pub selected_conversation_id: Option<String>,
    pub on_select_conversation: Option<Box<dyn FnMut(String)>>,
    pub on_new_conversation: Option<Box<dyn FnMut()>>,
    pub on_delete_conversation: Option<Box<dyn FnMut(String)>>,
    pub on_fork_conversation_in_new_tab: Option<Box<dyn FnMut(String)>>,
    pub on_fork_conversation_in_new_pane: Option<Box<dyn FnMut(String)>>,
    pub active_working_directory: Option<String>,
}

impl Default for WorkspaceSidebarProps {
    fn default() -> Self {
        Self {
            is_open: false,
            on_close: None,
            conversations: Vec::new(),
            open_conversation_ids: Vec::new(),
            selected_conversation_id: None,
            on_select_conversation: None,
            on_new_conversation: None,
            on_delete_conversation: None,
            on_fork_conversation_in_new_tab: None,
            on_fork_conversation_in_new_pane: None,
            active_working_directory: None,
        }
    }
}

pub fn render_workspace_sidebar(ui: &mut Ui, props: &mut WorkspaceSidebarProps, state: &mut WorkspaceSidebarState) {
    if !props.is_open {
        return;
    }
    
    let open_set: std::collections::HashSet<String> = props.open_conversation_ids.iter().cloned().collect();
    let active_conversations: Vec<WorkspaceConversation> = props.conversations.iter()
        .filter(|c| open_set.contains(&c.id))
        .cloned()
        .collect();
    let past_conversations: Vec<WorkspaceConversation> = props.conversations.iter()
        .filter(|c| !open_set.contains(&c.id))
        .cloned()
        .collect();
    
    let selected_id = props.selected_conversation_id.clone();
    let mut on_select = props.on_select_conversation.take();
    let mut on_delete = props.on_delete_conversation.take();
    let mut on_fork_tab = props.on_fork_conversation_in_new_tab.take();
    let mut on_fork_pane = props.on_fork_conversation_in_new_pane.take();
    let mut on_new = props.on_new_conversation.take();
    let mut on_close = props.on_close.take();
    let cwd = props.active_working_directory.clone();
    
    ui.vertical(|ui| {
        // Header with nav buttons
        ui.horizontal(|ui| {
            let chat_btn = ui.selectable_label(matches!(state.active_menu, SidebarMenu::Chat), "💬");
            if chat_btn.clicked() { state.active_menu = SidebarMenu::Chat; }
            
            let files_btn = ui.selectable_label(matches!(state.active_menu, SidebarMenu::Files), "📁");
            if files_btn.clicked() { state.active_menu = SidebarMenu::Files; }
            
            let search_btn = ui.selectable_label(matches!(state.active_menu, SidebarMenu::Search), "🔍");
            if search_btn.clicked() { state.active_menu = SidebarMenu::Search; }
            
            let history_btn = ui.selectable_label(matches!(state.active_menu, SidebarMenu::History), "🕐");
            if history_btn.clicked() { state.active_menu = SidebarMenu::History; }
            
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if ui.button("✕").clicked() {
                    if let Some(ref mut cb) = on_close {
                        cb();
                    }
                }
            });
        });
        ui.separator();
        
        match state.active_menu {
            SidebarMenu::Chat => {
                // Search
                ui.horizontal(|ui| {
                    ui.add(TextEdit::singleline(&mut state.search_query).hint_text("Search"));
                });
                ui.add_space(4.0);
                
                ScrollArea::vertical().show(ui, |ui| {
                    // Active conversations
                    if !active_conversations.is_empty() {
                        ui.label(RichText::new("ACTIVE").strong().size(10.0));
                        ui.add_space(4.0);
                        for conversation in &active_conversations {
                            render_conversation_item(ui, conversation, true, &selected_id, &mut on_select, &mut on_delete, &mut on_fork_tab, &mut on_fork_pane);
                        }
                        ui.add_space(8.0);
                    }
                    
                    // New conversation button
                    if ui.button("+ New conversation").clicked() {
                        if let Some(ref mut cb) = on_new {
                            cb();
                        }
                    }
                    ui.add_space(8.0);
                    
                    // Past conversations
                    if !past_conversations.is_empty() {
                        ui.label(RichText::new("PAST").strong().size(10.0));
                        ui.add_space(4.0);
                        for conversation in &past_conversations {
                            render_conversation_item(ui, conversation, false, &selected_id, &mut on_select, &mut on_delete, &mut on_fork_tab, &mut on_fork_pane);
                        }
                    }
                });
            }
            SidebarMenu::Files => {
                ui.label("Files coming soon.");
                if let Some(ref cwd) = cwd {
                    ui.label(format!("Current directory: {}", cwd));
                }
            }
            SidebarMenu::Search => {
                ui.label("Search coming soon.");
            }
            SidebarMenu::History => {
                ui.label("History coming soon.");
            }
        }
    });
    
    props.on_select_conversation = on_select;
    props.on_delete_conversation = on_delete;
    props.on_fork_conversation_in_new_tab = on_fork_tab;
    props.on_fork_conversation_in_new_pane = on_fork_pane;
    props.on_new_conversation = on_new;
    props.on_close = on_close;
}

fn render_conversation_item(
    ui: &mut Ui,
    conversation: &WorkspaceConversation,
    is_active_group: bool,
    selected_id: &Option<String>,
    on_select: &mut Option<Box<dyn FnMut(String)>>,
    on_delete: &mut Option<Box<dyn FnMut(String)>>,
    on_fork_tab: &mut Option<Box<dyn FnMut(String)>>,
    on_fork_pane: &mut Option<Box<dyn FnMut(String)>>,
) {
    let is_selected = selected_id.as_ref() == Some(&conversation.id);
    let bg = if is_selected {
        ui.visuals().selection.bg_fill
    } else {
        ui.visuals().panel_fill
    };
    
    Frame::group(ui.style()).fill(bg).show(ui, |ui| {
        ui.horizontal(|ui| {
            // Status icon
            let icon = if is_active_group {
                "●"
            } else {
                match conversation.status.as_deref() {
                    Some("failed") => "⚠",
                    Some("cancelled") => "⊘",
                    _ => "✓",
                }
            };
            ui.label(RichText::new(icon).size(10.0));
            
            ui.vertical(|ui| {
                ui.label(RichText::new(&conversation.title).size(12.0));
                let meta = format!("{} • {}",
                    conversation.branch_label.as_deref().unwrap_or("~"),
                    conversation.time_label
                );
                ui.label(RichText::new(meta).color(ui.visuals().weak_text_color()).size(10.0));
            });
        });
        
        let response = ui.interact(ui.min_rect(), ui.id().with(&conversation.id), Sense::click());
        if response.clicked() {
            if let Some(ref mut cb) = on_select {
                cb(conversation.id.clone());
            }
        }
        
        response.context_menu(|ui| {
            if ui.button("Delete").clicked() {
                if let Some(ref mut cb) = on_delete {
                    cb(conversation.id.clone());
                }
                ui.close_menu();
            }
            if ui.button("Fork in new pane").clicked() {
                if let Some(ref mut cb) = on_fork_pane {
                    cb(conversation.id.clone());
                }
                ui.close_menu();
            }
            if ui.button("Fork in new tab").clicked() {
                if let Some(ref mut cb) = on_fork_tab {
                    cb(conversation.id.clone());
                }
                ui.close_menu();
            }
        });
    });
}
