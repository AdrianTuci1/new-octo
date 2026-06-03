/// Workspace sidebar state.
///
/// Mirrors the React `WorkspaceSidebar` component.
use super::types::WorkspaceConversation;

/// The active sidebar menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SidebarMenu {
    Chat,
    Files,
    Search,
    History,
}

/// The workspace sidebar state.
pub struct WorkspaceSidebar {
    pub is_open: bool,
    pub active_menu: SidebarMenu,
    pub conversations: Vec<WorkspaceConversation>,
    pub open_conversation_ids: Vec<String>,
    pub selected_conversation_id: Option<String>,
    pub menu_conversation_id: Option<String>,
    pub active_working_directory: Option<String>,
}

impl Default for WorkspaceSidebar {
    fn default() -> Self {
        Self {
            is_open: false,
            active_menu: SidebarMenu::Chat,
            conversations: Vec::new(),
            open_conversation_ids: Vec::new(),
            selected_conversation_id: None,
            menu_conversation_id: None,
            active_working_directory: None,
        }
    }
}

impl WorkspaceSidebar {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn active_conversations(&self) -> Vec<&WorkspaceConversation> {
        let open_set: std::collections::HashSet<_> = self.open_conversation_ids.iter().collect();
        self.conversations.iter()
            .filter(|c| open_set.contains(&c.id))
            .collect()
    }

    pub fn past_conversations(&self) -> Vec<&WorkspaceConversation> {
        let open_set: std::collections::HashSet<_> = self.open_conversation_ids.iter().collect();
        self.conversations.iter()
            .filter(|c| !open_set.contains(&c.id))
            .collect()
    }

    pub fn is_conversation_selected(&self, id: &str) -> bool {
        self.selected_conversation_id.as_deref() == Some(id)
    }

    pub fn is_conversation_open(&self, id: &str) -> bool {
        self.open_conversation_ids.iter().any(|cid| cid == id)
    }

    pub fn toggle(&mut self) {
        self.is_open = !self.is_open;
    }

    pub fn open(&mut self) {
        self.is_open = true;
    }

    pub fn close(&mut self) {
        self.is_open = false;
    }

    pub fn set_active_menu(&mut self, menu: SidebarMenu) {
        self.active_menu = menu;
    }

    pub fn select_conversation(&mut self, id: String) {
        self.selected_conversation_id = Some(id);
    }

    pub fn open_conversation_menu(&mut self, id: String) {
        self.menu_conversation_id = Some(id);
    }

    pub fn close_conversation_menu(&mut self) {
        self.menu_conversation_id = None;
    }

    pub fn add_conversation(&mut self, conversation: WorkspaceConversation) {
        self.conversations.push(conversation);
    }

    pub fn remove_conversation(&mut self, id: &str) {
        self.conversations.retain(|c| c.id != id);
        self.open_conversation_ids.retain(|cid| cid != id);
        if self.selected_conversation_id.as_deref() == Some(id) {
            self.selected_conversation_id = None;
        }
    }

    pub fn set_conversations(&mut self, conversations: Vec<WorkspaceConversation>) {
        self.conversations = conversations;
    }

    pub fn set_open_conversation_ids(&mut self, ids: Vec<String>) {
        self.open_conversation_ids = ids;
    }

    pub fn set_active_working_directory(&mut self, path: Option<String>) {
        self.active_working_directory = path;
    }
}
