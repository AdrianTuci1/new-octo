pub mod ai;
pub mod app;
pub mod blocks;
pub mod edit;
pub mod file;
pub mod tab;
pub mod view;

use crate::memory::{
    read_json_or_default, MemoryConversationIndex, MemoryConversationSummary, OctomusMemoryManager,
};
use serde::Serialize;
use tauri::{
    menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Manager, Runtime,
};

pub const TRAY_ICON_ID: &str = "launcher-tray";
pub const SHOW_MENU_ID: &str = "show";
pub const HIDE_MENU_ID: &str = "hide";
pub const NEW_CHAT_MENU_ID: &str = "new-chat";
pub const SETTINGS_MENU_ID: &str = "preferences";
pub const CLOSE_MENU_ID: &str = "quit";
pub const SELECT_CONVERSATION_EVENT: &str = "octomus:select-conversation";

const NO_RECENT_MENU_ID: &str = "no-recent";
const MAX_RECENT_CONVERSATIONS: usize = 10;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuActionPayload {
    pub id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectConversationPayload {
    pub conversation_id: String,
}

pub fn build_app_menu<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Menu<R>> {
    Menu::with_items(
        app,
        &[
            &app::build(app)?,
            &file::build(app)?,
            &edit::build(app)?,
            &view::build(app)?,
            &tab::build(app)?,
            &blocks::build(app)?,
            &ai::build(app)?,
        ],
    )
}

pub fn build_tray_menu<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Menu<R>> {
    let manager = app.state::<OctomusMemoryManager>();
    let conversations =
        read_json_or_default::<MemoryConversationIndex>(&manager.conversation_index_path())
            .unwrap_or_default()
            .conversations;

    let recent_menu = build_recent_conversations_menu(app, &conversations)?;

    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, SHOW_MENU_ID, "Show Launcher", true, None::<&str>)?,
            &MenuItem::with_id(app, HIDE_MENU_ID, "Hide Launcher", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, NEW_CHAT_MENU_ID, "New Chat", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                SETTINGS_MENU_ID,
                "Settings...",
                true,
                Some("CmdOrCtrl+,"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &recent_menu,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, CLOSE_MENU_ID, "Quit", true, Some("CmdOrCtrl+Q"))?,
        ],
    )
}

pub fn refresh_tray_menu<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ICON_ID) else {
        return;
    };

    if let Ok(menu) = build_tray_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn build_recent_conversations_menu<R: Runtime, M: Manager<R>>(
    app: &M,
    conversations: &[MemoryConversationSummary],
) -> tauri::Result<Submenu<R>> {
    let mut recent_items = Vec::new();
    let mut item_refs: Vec<&dyn IsMenuItem<R>> = Vec::new();

    for conversation in conversations.iter().take(MAX_RECENT_CONVERSATIONS) {
        let label = conversation_label(conversation);
        recent_items.push(MenuItem::with_id(
            app,
            conversation.id.clone(),
            label,
            true,
            None::<&str>,
        )?);
    }

    if recent_items.is_empty() {
        recent_items.push(MenuItem::with_id(
            app,
            NO_RECENT_MENU_ID,
            "No Recent Conversations",
            false,
            None::<&str>,
        )?);
    }

    for item in &recent_items {
        item_refs.push(item);
    }

    Submenu::with_items(app, "Recent Conversations", true, &item_refs)
}

fn conversation_label(summary: &MemoryConversationSummary) -> String {
    let title = summary
        .title
        .chars()
        .filter(|ch| {
            !matches!(
                ch,
                '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{2060}' | '\u{FEFF}'
            )
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    let base = if title.is_empty() {
        "Untitled Conversation".to_string()
    } else {
        title
    };

    if summary.time_label.trim().is_empty() {
        base
    } else {
        format!("{} - {}", base, summary.time_label.trim())
    }
}
