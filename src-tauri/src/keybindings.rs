use serde::Serialize;
use tauri::{menu::MenuEvent, AppHandle, Emitter, Manager, Runtime};

include!(concat!(env!("OUT_DIR"), "/menu_shortcuts.rs"));

pub const EVENT_SHORTCUT_COMMAND: &str = "keybinding:command";

const COMMAND_OPEN_WORKSPACE_WINDOW: &str = "app.open-workspace-window";
const COMMAND_NEW_TERMINAL_TAB: &str = "workspace.new-terminal-tab";
const COMMAND_NEW_CONVERSATION_TAB: &str = "workspace.new-conversation-tab";
const COMMAND_SPLIT_TERMINAL_RIGHT: &str = "workspace.split-terminal-right";
const COMMAND_SPLIT_TERMINAL_UP: &str = "workspace.split-terminal-up";
const COMMAND_CLOSE_ACTIVE_TAB: &str = "workspace.close-active-tab";
const COMMAND_TOGGLE_SIDEBAR: &str = "workspace.toggle-sidebar";
const COMMAND_TOGGLE_AGENTS: &str = "workspace.toggle-agents";
const COMMAND_SHOW_KEYBOARD_SHORTCUTS: &str = "workspace.show-keyboard-shortcuts";

struct KeybindingSpec {
    command_id: &'static str,
    title: &'static str,
    category: &'static str,
    scope: &'static str,
    shortcut: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KeybindingDefinition {
    #[serde(rename = "commandId")]
    pub command_id: String,
    pub title: String,
    pub category: String,
    pub scope: String,
    pub shortcut: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShortcutCommandEvent {
    #[serde(rename = "commandId")]
    pub command_id: String,
}

const KEYBINDING_SPECS: &[KeybindingSpec] = &[
    KeybindingSpec {
        command_id: COMMAND_OPEN_WORKSPACE_WINDOW,
        title: "Open Workspace Window",
        category: "App",
        scope: "global",
        shortcut: Some("CmdOrCtrl+,"),
    },
    KeybindingSpec {
        command_id: COMMAND_NEW_TERMINAL_TAB,
        title: "New Terminal Tab",
        category: "Workspace",
        scope: "workspace",
        shortcut: Some("CmdOrCtrl+T"),
    },
    KeybindingSpec {
        command_id: COMMAND_NEW_CONVERSATION_TAB,
        title: "New Conversation Tab",
        category: "Workspace",
        scope: "workspace",
        shortcut: Some("CmdOrCtrl+Shift+N"),
    },
    KeybindingSpec {
        command_id: COMMAND_SPLIT_TERMINAL_RIGHT,
        title: "Split Terminal Right",
        category: "Workspace",
        scope: "workspace",
        shortcut: Some("CmdOrCtrl+\\"),
    },
    KeybindingSpec {
        command_id: COMMAND_SPLIT_TERMINAL_UP,
        title: "Split Terminal Up",
        category: "Workspace",
        scope: "workspace",
        shortcut: Some("CmdOrCtrl+Shift+\\"),
    },
    KeybindingSpec {
        command_id: COMMAND_CLOSE_ACTIVE_TAB,
        title: "Close Active Tab",
        category: "Workspace",
        scope: "workspace",
        shortcut: Some("CmdOrCtrl+W"),
    },
    KeybindingSpec {
        command_id: COMMAND_TOGGLE_SIDEBAR,
        title: "Toggle Sidebar",
        category: "View",
        scope: "workspace",
        shortcut: Some("CmdOrCtrl+B"),
    },
    KeybindingSpec {
        command_id: COMMAND_TOGGLE_AGENTS,
        title: "Toggle Agents Overlay",
        category: "View",
        scope: "workspace",
        shortcut: Some("CmdOrCtrl+Shift+A"),
    },
    KeybindingSpec {
        command_id: COMMAND_SHOW_KEYBOARD_SHORTCUTS,
        title: "Show Keyboard Shortcuts",
        category: "Help",
        scope: "workspace",
        shortcut: Some("CmdOrCtrl+/"),
    },
];

fn to_definition(spec: &KeybindingSpec) -> KeybindingDefinition {
    KeybindingDefinition {
        command_id: spec.command_id.to_string(),
        title: spec.title.to_string(),
        category: spec.category.to_string(),
        scope: spec.scope.to_string(),
        shortcut: spec.shortcut.map(str::to_string),
    }
}

fn emit_shortcut_command<R: Runtime>(app: &AppHandle<R>, command_id: &str) {
    let payload = ShortcutCommandEvent {
        command_id: command_id.to_string(),
    };

    let windows = app.webview_windows();
    let mut emitted = false;

    for window in windows.values() {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_focused = window.is_focused().unwrap_or(false);
        if !is_visible || !is_focused {
            continue;
        }

        let _ = window.emit(EVENT_SHORTCUT_COMMAND, &payload);
        emitted = true;
    }

    if emitted {
        return;
    }

    for window in windows.values() {
        if !window.is_visible().unwrap_or(false) {
            continue;
        }

        let _ = window.emit(EVENT_SHORTCUT_COMMAND, &payload);
        emitted = true;
    }

    if !emitted {
        let _ = app.emit(EVENT_SHORTCUT_COMMAND, &payload);
    }
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id.as_ref() {
        COMMAND_OPEN_WORKSPACE_WINDOW => emit_shortcut_command(app, COMMAND_OPEN_WORKSPACE_WINDOW),
        COMMAND_NEW_TERMINAL_TAB => emit_shortcut_command(app, COMMAND_NEW_TERMINAL_TAB),
        COMMAND_NEW_CONVERSATION_TAB => emit_shortcut_command(app, COMMAND_NEW_CONVERSATION_TAB),
        COMMAND_SPLIT_TERMINAL_RIGHT => emit_shortcut_command(app, COMMAND_SPLIT_TERMINAL_RIGHT),
        COMMAND_SPLIT_TERMINAL_UP => emit_shortcut_command(app, COMMAND_SPLIT_TERMINAL_UP),
        COMMAND_CLOSE_ACTIVE_TAB => emit_shortcut_command(app, COMMAND_CLOSE_ACTIVE_TAB),
        COMMAND_TOGGLE_SIDEBAR => emit_shortcut_command(app, COMMAND_TOGGLE_SIDEBAR),
        COMMAND_TOGGLE_AGENTS => emit_shortcut_command(app, COMMAND_TOGGLE_AGENTS),
        COMMAND_SHOW_KEYBOARD_SHORTCUTS => {
            emit_shortcut_command(app, COMMAND_SHOW_KEYBOARD_SHORTCUTS)
        }
        _ => {}
    }
}

pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    app.on_menu_event(|app, event| handle_menu_event(app, event));
    Ok(())
}

#[tauri::command]
pub fn keybindings_list_definitions() -> Vec<KeybindingDefinition> {
    let mut catalog = std::collections::BTreeMap::<String, KeybindingDefinition>::new();

    for definition in KEYBINDING_SPECS.iter().map(to_definition) {
        catalog.insert(definition.command_id.clone(), definition);
    }

    for &(command_id, title, category, scope, shortcut) in MENU_SHORTCUT_SPECS {
        catalog.insert(
            command_id.to_string(),
            KeybindingDefinition {
                command_id: command_id.to_string(),
                title: title.to_string(),
                category: category.to_string(),
                scope: scope.to_string(),
                shortcut: shortcut.map(|value| value.to_string()),
            },
        );
    }

    catalog.into_values().collect()
}
