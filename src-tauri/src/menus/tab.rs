use tauri::{
    menu::{MenuItem, PredefinedMenuItem, Submenu},
    Manager, Runtime,
};

pub fn build<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Submenu<R>> {
    let rename_tab = MenuItem::with_id(
        app,
        "rename-tab",
        "Rename the Current Tab",
        true,
        None::<&str>,
    )?;

    let split_pane_right = MenuItem::with_id(
        app,
        "workspace.split-terminal-right",
        "Split Pane Right",
        true,
        Some("CmdOrCtrl+\\"),
    )?;
    let split_pane_left = MenuItem::with_id(
        app,
        "split-pane-left",
        "Split Pane Left",
        true,
        None::<&str>,
    )?;
    let split_pane_down = MenuItem::with_id(
        app,
        "workspace.split-terminal-down",
        "Split Pane Down",
        true,
        Some("Shift+CmdOrCtrl+\\"),
    )?;
    let split_pane_up =
        MenuItem::with_id(app, "split-pane-up", "Split Pane Up", true, None::<&str>)?;

    let move_tab_left = MenuItem::with_id(
        app,
        "move-tab-left",
        "Move Tab Left",
        false,
        Some("CmdOrCtrl+Shift+Left"),
    )?;
    let move_tab_right = MenuItem::with_id(
        app,
        "move-tab-right",
        "Move Tab Right",
        false,
        Some("CmdOrCtrl+Shift+Right"),
    )?;

    let switch_next_tab = MenuItem::with_id(
        app,
        "switch-next-tab",
        "Switch to Next Tab",
        false,
        Some("CmdOrCtrl+Tab"),
    )?;
    let switch_prev_tab = MenuItem::with_id(
        app,
        "switch-prev-tab",
        "Switch to Previous Tab",
        false,
        Some("Shift+CmdOrCtrl+Tab"),
    )?;

    let activate_next_pane = MenuItem::with_id(
        app,
        "activate-next-pane",
        "Activate Next Pane",
        true,
        Some("CmdOrCtrl+]"),
    )?;
    let activate_prev_pane = MenuItem::with_id(
        app,
        "activate-prev-pane",
        "Activate Previous Pane",
        true,
        Some("CmdOrCtrl+["),
    )?;

    let toggle_max_pane = MenuItem::with_id(
        app,
        "toggle-maximize-pane",
        "Toggle Maximize Active Pane",
        true,
        Some("Shift+CmdOrCtrl+Return"),
    )?;

    let close_tab = MenuItem::with_id(
        app,
        "close-tab",
        "Close the Current Tab",
        true,
        None::<&str>,
    )?;
    let close_other_tabs = MenuItem::with_id(
        app,
        "close-other-tabs",
        "Close Other Tabs",
        true,
        None::<&str>,
    )?;
    let close_tabs_right = MenuItem::with_id(
        app,
        "close-tabs-right",
        "Close Tabs to the Right",
        true,
        None::<&str>,
    )?;

    Submenu::with_items(
        app,
        "Tab",
        true,
        &[
            &rename_tab,
            &PredefinedMenuItem::separator(app)?,
            &split_pane_right,
            &split_pane_left,
            &split_pane_down,
            &split_pane_up,
            &PredefinedMenuItem::separator(app)?,
            &move_tab_left,
            &move_tab_right,
            &PredefinedMenuItem::separator(app)?,
            &switch_next_tab,
            &switch_prev_tab,
            &PredefinedMenuItem::separator(app)?,
            &activate_next_pane,
            &activate_prev_pane,
            &PredefinedMenuItem::separator(app)?,
            &toggle_max_pane,
            &PredefinedMenuItem::separator(app)?,
            &close_tab,
            &close_other_tabs,
            &close_tabs_right,
        ],
    )
}
