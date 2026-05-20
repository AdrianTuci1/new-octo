/*
** 2026 May 04
**
** The author disclaims copyright to this source code. In place of
** a legal notice, here is a blessing:
**
**    "Everything around you that you call life was made up by people
**    that were no smarter than you. And you can change it, you can
**    influence it... Once you learn that, you'll never be the same again."
**
*************************************************************************
** This file is part of Octomus.
*/

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use octomus_launcher_prototype::{
    ai, app_updates, code_index, keybindings, memory, octomus_paths, secure_store,
    shell_signatures, terminal,
};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    tray::TrayIconBuilder, AppHandle, Emitter, Listener, Manager, PhysicalPosition, Position,
    Runtime, State, WebviewWindowBuilder,
};

#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

mod menus;

const MAIN_WINDOW_LABEL: &str = "main";
const SETTINGS_WINDOW_LABEL: &str = "settings";
const ONBOARDING_WINDOW_LABEL: &str = "onboarding";
const TOGGLE_SHORTCUT: &str = "alt+space";
const WINDOW_BOTTOM_MARGIN: i32 = 68;
const OPEN_CLOUD_PROFILE_DRAWER_EVENT: &str = "octomus:open-cloud-profile-drawer";
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCloudProfileDrawerPayload {
    profile_id: String,
    section_id: String,
}

#[derive(Default)]
struct PendingCloudProfileDrawerRequest(Mutex<Option<OpenCloudProfileDrawerPayload>>);

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
        #[cfg(target_os = "macos")]
        update_activation_policy(app);
    }
}

fn hide_onboarding<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(ONBOARDING_WINDOW_LABEL) {
        let _ = window.hide();
        #[cfg(target_os = "macos")]
        update_activation_policy(app);
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
    hide_onboarding(app);

    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(ActivationPolicy::Regular);
        let _ = app.set_dock_visibility(true);
    }

    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        #[cfg(target_os = "macos")]
        if let Ok(menu) = menus::build_app_menu(app) {
            let _ = window.set_menu(menu);
        }
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
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

    if let Ok(window) =
        WebviewWindowBuilder::from_config(app, &settings_config).and_then(|builder| builder.build())
    {
        #[cfg(target_os = "macos")]
        if let Ok(menu) = menus::build_app_menu(app) {
            let _ = window.set_menu(menu);
        }
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_onboarding_window<R: Runtime>(app: &AppHandle<R>) {
    hide_launcher(app);
    hide_settings(app);

    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(ActivationPolicy::Regular);
        let _ = app.set_dock_visibility(true);
    }

    if let Some(window) = app.get_webview_window(ONBOARDING_WINDOW_LABEL) {
        let _ = window.destroy();
    }

    let Some(onboarding_config) = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == ONBOARDING_WINDOW_LABEL)
        .cloned()
    else {
        return;
    };

    if let Ok(window) = WebviewWindowBuilder::from_config(app, &onboarding_config)
        .and_then(|builder| builder.build())
    {
        #[cfg(target_os = "macos")]
        if let Ok(menu) = menus::build_app_menu(app) {
            let _ = window.set_menu(menu);
        }
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn update_activation_policy<R: Runtime>(app: &AppHandle<R>) {
    let mut has_visible_regular_window = false;
    for label in [SETTINGS_WINDOW_LABEL, ONBOARDING_WINDOW_LABEL] {
        if let Some(window) = app.get_webview_window(label) {
            if window.is_visible().unwrap_or(false) {
                has_visible_regular_window = true;
                break;
            }
        }
    }

    if has_visible_regular_window {
        let _ = app.set_activation_policy(ActivationPolicy::Regular);
        let _ = app.set_dock_visibility(true);
    } else {
        let _ = app.set_activation_policy(ActivationPolicy::Accessory);
        let _ = app.set_dock_visibility(false);
    }
}

fn show_placeholder_session<R: Runtime>(app: &AppHandle<R>) {
    show_launcher(app);
}

fn main() {
    load_env_file();
    shell_signatures::warm_up();

    tauri::Builder::default()
        .manage(app_updates::AppUpdateManager::default())
        .manage(code_index::CodeIndexManager::default())
        .manage(terminal::TerminalManager::default())
        .manage(ai::AgentHarnessManager::default())
        .manage(ai::predict::composer::ComposerIntelligenceManager::default())
        .manage(memory::OctomusMemoryManager::default())
        .manage(PendingCloudProfileDrawerRequest::default())
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "preferences" => {
                    show_settings_window(app);
                }
                "new-window" => {
                    show_launcher(app);
                }
                "new-terminal-tab"
                | "new-agent-tab"
                | "new-file"
                | "open-repo"
                | "close-session"
                | "close-window"
                | "clear-editor"
                | "add-next-occurrence"
                | "add-cursor-above"
                | "add-cursor-below"
                | "find-terminal"
                | "focus-terminal-input"
                | "open-left-panel"
                | "cmd-palette"
                | "nav-palette"
                | "launch-config-palette"
                | "toggle-files-palette"
                | "left-panel-agent"
                | "left-panel-proj"
                | "left-panel-search"
                | "show-history"
                | "cmd-search"
                | "workflows"
                | "toggle-mouse"
                | "toggle-scroll"
                | "toggle-focus"
                | "compact-mode"
                | "zoom-in"
                | "zoom-out"
                | "reset-zoom"
                | "rename-tab"
                | "split-pane-right"
                | "split-pane-left"
                | "split-pane-down"
                | "split-pane-up"
                | "close-tab"
                | "close-other-tabs"
                | "close-tabs-right" => {
                    let _ = app.emit(
                        "octomus:menu-action",
                        menus::MenuActionPayload { id: id.to_string() },
                    );
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_updates::app_updates_get_state,
            app_updates::app_updates_check,
            app_updates::app_updates_install,
            app_updates::app_updates_restart,
            code_index::code_index_list_projects,
            code_index::code_index_index_project,
            code_index::code_index_remove_project,
            code_index::code_index_search,
            ai::agent_start,
            ai::agent_continue,
            ai::agent_cancel,
            ai::agent_get_run,
            ai::agent_list_runs,
            ai::agent_get_loop_contract,
            ai::agent_configure_openai_compatible,
            ai::agent_clear_openai_compatible,
            ai::agent_provider_status,
            ai::mcp::mcp_list_servers,
            ai::mcp::mcp_list_runtime_tools,
            ai::mcp::mcp_upsert_server,
            ai::mcp::mcp_remove_server,
            ai::web_search,
            ai::ai_predict_command_smart,
            ai::diff::apply_file_diff,
            terminal::terminal_create_session,
            terminal::terminal_write,
            terminal::terminal_run_command,
            terminal::terminal_resize,
            terminal::terminal_kill_session,
            terminal::terminal_release_session,
            terminal::terminal_get_blocks,
            terminal::terminal_list_commands,
            terminal::terminal_get_path_context,
            terminal::terminal_get_runtime_context,
            terminal::terminal_list_directory_entries,
            terminal::terminal_search_directory_entries,
            terminal::terminal_get_git_context,
            terminal::terminal_get_worktree_diff,
            terminal::terminal_switch_git_branch,
            terminal::terminal_get_recent_history,
            terminal::terminal_get_prediction,
            terminal::terminal_get_composer_intelligence,
            terminal::terminal_read_file,
            terminal::terminal_write_file,
            memory::memory_bootstrap,
            memory::memory_put_settings,
            memory::memory_put_workspace_snapshot,
            memory::memory_put_conversation,
            memory::memory_get_conversation,
            memory::memory_list_conversations,
            memory::memory_delete_conversation,
            keybindings::keybindings_list_definitions,
            secure_store::cloud_store_profile_secret,
            secure_store::cloud_profile_secret_status,
            secure_store::cloud_delete_profile_secret,
            memory::memory_put_cloud_object,
            memory::memory_get_cloud_object,
            memory::memory_list_cloud_object_index,
            memory::memory_enqueue_sync_operation,
            memory::memory_sync_once,
            complete_onboarding,
            show_app_window,
            open_cloud_profile_drawer,
            open_external_url,
            consume_pending_cloud_profile_drawer_request,
        ])
        .on_window_event(|window, event| {
            let label = window.label();
            if label == SETTINGS_WINDOW_LABEL || label == ONBOARDING_WINDOW_LABEL {
                match event {
                    tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                        #[cfg(target_os = "macos")]
                        {
                            let app = window.app_handle();
                            // Check if there are other visible regular windows, excluding this one.
                            let mut has_visible_regular_window = false;
                            for other_label in [SETTINGS_WINDOW_LABEL, ONBOARDING_WINDOW_LABEL] {
                                if other_label != label {
                                    if let Some(other_window) = app.get_webview_window(other_label)
                                    {
                                        if other_window.is_visible().unwrap_or(false) {
                                            has_visible_regular_window = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            if !has_visible_regular_window {
                                let _ =
                                    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                                let _ = app.set_dock_visibility(false);
                            }
                        }
                    }
                    _ => {}
                }
            }
        })
        .setup(|app| {
            app_updates::init(&app.handle())?;
            octomus_paths::OctomusPaths::default()
                .ensure_layout()
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            let _ = ai::agent::loop_contract::get_loop_contract();

            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(ActivationPolicy::Accessory);
                let _ = app.set_dock_visibility(false);
                if let Ok(menu) = menus::build_app_menu(app.handle()) {
                    let _ = app.set_menu(menu.clone());
                    if let Some(main_win) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                        let _ = main_win.set_menu(menu.clone());
                    }
                    if let Some(settings_win) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
                        let _ = settings_win.set_menu(menu);
                    }
                }
            }

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.set_background_color(None);
                let _ = window.set_shadow(false);
            }

            keybindings::install(&app.handle())?;

            #[cfg(desktop)]
            {
                let tray_menu = menus::build_tray_menu(app)?;

                let mut tray = TrayIconBuilder::with_id("launcher-tray")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(true)
                    .tooltip("Octomus")
                    .on_menu_event(|app, event| {
                        let id_str = event.id.as_ref();
                        match id_str {
                            menus::SHOW_MENU_ID => show_launcher(app),
                            menus::HIDE_MENU_ID => hide_launcher(app),
                            menus::NEW_CHAT_MENU_ID => show_placeholder_session(app),
                            menus::SETTINGS_MENU_ID => show_settings_window(app),
                            menus::CLOSE_MENU_ID => app.exit(0),
                            _ => {
                                if id_str != "no-recent" && id_str != "no-more" {
                                    show_settings_window(app);
                                    let _ = app.emit(
                                        menus::SELECT_CONVERSATION_EVENT,
                                        menus::SelectConversationPayload {
                                            conversation_id: id_str.to_string(),
                                        },
                                    );
                                }
                            }
                        }
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone()).icon_as_template(true);
                } else {
                    tray = tray.title("Octomus");
                }

                let _ = tray.build(app)?;

                let app_handle_cu = app.handle().clone();
                let _ = app.listen("memory:conversation-updated", move |_event| {
                    menus::refresh_tray_menu(&app_handle_cu);
                });

                let app_handle_ws = app.handle().clone();
                let _ = app.listen("memory:workspace-updated", move |_event| {
                    menus::refresh_tray_menu(&app_handle_ws);
                });

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
                println!(
                    "[ENV] {} is already set to a non-empty value, skipping",
                    key
                );
            }
        }
    }
}

#[tauri::command]
fn complete_onboarding<R: Runtime>(app: AppHandle<R>) {
    if let Some(window) = app.get_webview_window(ONBOARDING_WINDOW_LABEL) {
        let _ = window.close();
    }
    show_launcher(&app);
    #[cfg(target_os = "macos")]
    update_activation_policy(&app);
}

#[tauri::command]
fn show_app_window<R: Runtime>(app: AppHandle<R>) {
    show_settings_window(&app);
}

#[tauri::command]
fn open_cloud_profile_drawer<R: Runtime>(
    app: AppHandle<R>,
    pending_request: State<'_, PendingCloudProfileDrawerRequest>,
    profile_id: String,
) -> Result<(), String> {
    let payload = OpenCloudProfileDrawerPayload {
        profile_id,
        section_id: "cloud-platform/cloud".to_string(),
    };

    if let Ok(mut pending) = pending_request.0.lock() {
        *pending = Some(payload.clone());
    }

    show_settings_window(&app);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        for delay_ms in [50_u64, 200_u64, 600_u64] {
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
            let _ = app_handle.emit(OPEN_CLOUD_PROFILE_DRAWER_EVENT, payload.clone());
        }
    });

    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    open_url_with_system_handler(&url)
}

#[tauri::command]
fn consume_pending_cloud_profile_drawer_request(
    pending_request: State<'_, PendingCloudProfileDrawerRequest>,
) -> Option<OpenCloudProfileDrawerPayload> {
    pending_request
        .0
        .lock()
        .ok()
        .and_then(|mut pending| pending.take())
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

#[cfg(target_os = "macos")]
fn open_url_with_system_handler(url: &str) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(url)
        .status()
        .map_err(|error| format!("failed to launch url handler: {error}"))?
        .success()
        .then_some(())
        .ok_or_else(|| "url handler exited unsuccessfully".to_string())
}

#[cfg(target_os = "windows")]
fn open_url_with_system_handler(url: &str) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .status()
        .map_err(|error| format!("failed to launch url handler: {error}"))?
        .success()
        .then_some(())
        .ok_or_else(|| "url handler exited unsuccessfully".to_string())
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn open_url_with_system_handler(url: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(url)
        .status()
        .map_err(|error| format!("failed to launch url handler: {error}"))?
        .success()
        .then_some(())
        .ok_or_else(|| "url handler exited unsuccessfully".to_string())
}
