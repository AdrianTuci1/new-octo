#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Position, Runtime, WebviewWindowBuilder,
};

mod ai;
mod terminal;

#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

const MAIN_WINDOW_LABEL: &str = "main";
const SETTINGS_WINDOW_LABEL: &str = "settings";
const SHOW_MENU_ID: &str = "show";
const HIDE_MENU_ID: &str = "hide";
const NEW_CHAT_MENU_ID: &str = "new-chat";
const SETTINGS_MENU_ID: &str = "settings";
const CLOSE_MENU_ID: &str = "close";
const RECENT_SESSION_1_ID: &str = "recent-session-1";
const RECENT_SESSION_2_ID: &str = "recent-session-2";
const RECENT_SESSION_3_ID: &str = "recent-session-3";
const MORE_SESSION_1_ID: &str = "all-session-1";
const MORE_SESSION_2_ID: &str = "all-session-2";
const MORE_SESSION_3_ID: &str = "all-session-3";
const MORE_SESSION_4_ID: &str = "all-session-4";
const MORE_SESSION_5_ID: &str = "all-session-5";
const TOGGLE_SHORTCUT: &str = "alt+space";
const WINDOW_BOTTOM_MARGIN: i32 = 68;

fn anchor_launcher_to_bottom<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
    else {
        return;
    };

    let Ok(outer_size) = window.outer_size() else {
        return;
    };

    let work_area = monitor.work_area();
    let work_left = work_area.position.x;
    let work_top = work_area.position.y;
    let work_width = work_area.size.width as i32;
    let work_height = work_area.size.height as i32;
    let window_width = outer_size.width as i32;
    let window_height = outer_size.height as i32;

    let x = work_left + ((work_width - window_width) / 2).max(0);
    let y = work_top + (work_height - window_height - WINDOW_BOTTOM_MARGIN).max(0);

    let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
}

fn show_launcher<R: Runtime>(app: &AppHandle<R>) {
    hide_settings(app);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        anchor_launcher_to_bottom(app);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_launcher<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

fn hide_settings<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

fn toggle_launcher<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    let is_visible = window.is_visible().unwrap_or(false);
    if is_visible {
        let _ = window.hide();
        return;
    }

    let _ = window.unminimize();
    anchor_launcher_to_bottom(app);
    let _ = window.show();
    let _ = window.set_focus();
}

fn show_settings_window<R: Runtime>(app: &AppHandle<R>) {
    hide_launcher(app);

    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        let _ = window.destroy();
    }

    let Some(settings_config) = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == SETTINGS_WINDOW_LABEL)
        .cloned()
    else {
        return;
    };

    if let Ok(window) = WebviewWindowBuilder::from_config(app, &settings_config)
        .and_then(|builder| builder.build())
    {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_placeholder_session<R: Runtime>(app: &AppHandle<R>) {
    show_launcher(app);
}

fn build_tray_menu<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Menu<R>> {
    let recent_session_1 = MenuItem::with_id(app, RECENT_SESSION_1_ID, "Session 01", true, None::<&str>)?;
    let recent_session_2 = MenuItem::with_id(app, RECENT_SESSION_2_ID, "Session 02", true, None::<&str>)?;
    let recent_session_3 = MenuItem::with_id(app, RECENT_SESSION_3_ID, "Session 03", true, None::<&str>)?;

    let all_session_1 = MenuItem::with_id(app, MORE_SESSION_1_ID, "Session 04", true, None::<&str>)?;
    let all_session_2 = MenuItem::with_id(app, MORE_SESSION_2_ID, "Session 05", true, None::<&str>)?;
    let all_session_3 = MenuItem::with_id(app, MORE_SESSION_3_ID, "Session 06", true, None::<&str>)?;
    let all_session_4 = MenuItem::with_id(app, MORE_SESSION_4_ID, "Session 07", true, None::<&str>)?;
    let all_session_5 = MenuItem::with_id(app, MORE_SESSION_5_ID, "Session 08", true, None::<&str>)?;

    let recent_sessions = Submenu::with_items(
        app,
        "Recent Sessions",
        true,
        &[&recent_session_1, &recent_session_2, &recent_session_3],
    )?;

    let more_sessions = Submenu::with_items(
        app,
        "More",
        true,
        &[
            &all_session_1,
            &all_session_2,
            &all_session_3,
            &all_session_4,
            &all_session_5,
        ],
    )?;

    let new_chat = MenuItem::with_id(app, NEW_CHAT_MENU_ID, "New Chat", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, SETTINGS_MENU_ID, "Settings", true, None::<&str>)?;
    let close = MenuItem::with_id(app, CLOSE_MENU_ID, "Close", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, HIDE_MENU_ID, "Hide Launcher", true, None::<&str>)?;
    let show = MenuItem::with_id(app, SHOW_MENU_ID, "Show Launcher", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &recent_sessions,
            &more_sessions,
            &PredefinedMenuItem::separator(app)?,
            &new_chat,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &show,
            &hide,
            &PredefinedMenuItem::separator(app)?,
            &close,
        ],
    )
}

fn main() {
    load_env_file();

    tauri::Builder::default()
        .manage(terminal::TerminalManager::default())
        .manage(ai::AgentHarnessManager::default())
        .invoke_handler(tauri::generate_handler![
            ai::agent_start,
            ai::agent_cancel,
            ai::agent_get_run,
            ai::agent_list_runs,
            ai::agent_configure_openai_compatible,
            ai::agent_provider_status,
            ai::ai_predict_command_smart,
            terminal::terminal_create_session,
            terminal::terminal_write,
            terminal::terminal_run_command,
            terminal::terminal_resize,
            terminal::terminal_kill_session,
            terminal::terminal_get_blocks,
            terminal::terminal_list_commands,
            terminal::terminal_get_path_context,
            terminal::terminal_get_runtime_context,
            terminal::terminal_list_directory_entries,
            terminal::terminal_get_git_context,
            terminal::terminal_switch_git_branch,
            terminal::terminal_get_recent_history,
            terminal::terminal_get_prediction,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(ActivationPolicy::Accessory);
                let _ = app.set_dock_visibility(false);
            }

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.set_background_color(None);
                let _ = window.set_shadow(false);
            }

            #[cfg(desktop)]
            {
                let tray_menu = build_tray_menu(app)?;

                let mut tray = TrayIconBuilder::with_id("launcher-tray")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .tooltip("Octomus Launcher")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        SHOW_MENU_ID => show_launcher(app),
                        HIDE_MENU_ID => hide_launcher(app),
                        NEW_CHAT_MENU_ID => show_placeholder_session(app),
                        SETTINGS_MENU_ID => show_settings_window(app),
                        CLOSE_MENU_ID => app.exit(0),
                        RECENT_SESSION_1_ID
                        | RECENT_SESSION_2_ID
                        | RECENT_SESSION_3_ID
                        | MORE_SESSION_1_ID
                        | MORE_SESSION_2_ID
                        | MORE_SESSION_3_ID
                        | MORE_SESSION_4_ID
                        | MORE_SESSION_5_ID => show_placeholder_session(app),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            toggle_launcher(&tray.app_handle());
                        }
                        _ => {}
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone()).icon_as_template(true);
                } else {
                    tray = tray.title("Octomus");
                }

                let _ = tray.build(app)?;

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts([TOGGLE_SHORTCUT])?
                        .with_handler(|app, shortcut, event| {
                            if event.state == ShortcutState::Pressed
                                && shortcut.matches(Modifiers::ALT, Code::Space)
                            {
                                toggle_launcher(app);
                            }
                        })
                        .build(),
                )?;
            }

            show_launcher(&app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Octomus launcher prototype");
}

fn load_env_file() {
    for path in [".env", "../.env"] {
        let Ok(contents) = std::fs::read_to_string(path) else {
            continue;
        };

        for line in contents.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            let Some((raw_key, raw_value)) = trimmed.split_once('=') else {
                continue;
            };

            let key = raw_key.trim();
            if key.is_empty() {
                continue;
            }

            let value = parse_env_value(raw_value.trim());
            
            // Overwrite if it's not set or it's empty
            let current = std::env::var(key).unwrap_or_default();
            if current.is_empty() {
                println!("[ENV] Setting {} from file", key);
                std::env::set_var(key, value);
            } else {
                println!("[ENV] {} is already set to a non-empty value, skipping", key);
            }
        }
    }
}

fn parse_env_value(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        let bytes = trimmed.as_bytes();
        let first = bytes[0];
        let last = bytes[trimmed.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return trimmed[1..trimmed.len() - 1].to_string();
        }
    }

    trimmed.to_string()
}
