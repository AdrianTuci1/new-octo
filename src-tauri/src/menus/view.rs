use tauri::{
    menu::{CheckMenuItem, MenuItem, PredefinedMenuItem, Submenu},
    Manager, Runtime,
};

pub fn build<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Submenu<R>> {
    let open_left_panel = MenuItem::with_id(
        app,
        "workspace.toggle-sidebar",
        "Open Left Panel",
        true,
        Some("CmdOrCtrl+B"),
    )?;

    let cmd_palette = MenuItem::with_id(
        app,
        "cmd-palette",
        "Command Palette",
        true,
        Some("CmdOrCtrl+P"),
    )?;
    let nav_palette = MenuItem::with_id(
        app,
        "nav-palette",
        "Navigation Palette",
        true,
        Some("Shift+CmdOrCtrl+P"),
    )?;
    let launch_config_palette = MenuItem::with_id(
        app,
        "launch-config-palette",
        "Launch Configuration Palette",
        true,
        Some("CmdOrCtrl+Alt+L"),
    )?;
    let toggle_files_palette = MenuItem::with_id(
        app,
        "toggle-files-palette",
        "Toggle Files Palette",
        true,
        Some("CmdOrCtrl+O"),
    )?;

    let left_panel_agent = MenuItem::with_id(
        app,
        "workspace.toggle-agents",
        "Left Panel: Agent Conversations",
        true,
        Some("CmdOrCtrl+Shift+A"),
    )?;
    let left_panel_proj = MenuItem::with_id(
        app,
        "left-panel-proj",
        "Left Panel: Project Explorer",
        true,
        Some("CmdOrCtrl+2"),
    )?;
    let left_panel_search = MenuItem::with_id(
        app,
        "left-panel-search",
        "Left Panel: Global Search",
        true,
        Some("CmdOrCtrl+3"),
    )?;

    let show_history = MenuItem::with_id(app, "show-history", "Show History", true, Some("Up"))?;
    let cmd_search = MenuItem::with_id(
        app,
        "cmd-search",
        "Command Search",
        true,
        Some("CmdOrCtrl+R"),
    )?;
    let workflows = MenuItem::with_id(
        app,
        "workflows",
        "Workflows",
        true,
        Some("CmdOrCtrl+Shift+R"),
    )?;

    let toggle_mouse = CheckMenuItem::with_id(
        app,
        "toggle-mouse",
        "Toggle Mouse Reporting",
        true,
        true,
        None::<&str>,
    )?;
    let toggle_scroll = CheckMenuItem::with_id(
        app,
        "toggle-scroll",
        "Toggle Scroll Reporting",
        true,
        true,
        None::<&str>,
    )?;
    let toggle_focus = CheckMenuItem::with_id(
        app,
        "toggle-focus",
        "Toggle Focus Reporting",
        true,
        true,
        None::<&str>,
    )?;

    let compact_mode = MenuItem::with_id(app, "compact-mode", "Compact Mode", true, None::<&str>)?;

    let zoom_in = MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
    let zoom_out = MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let reset_zoom = MenuItem::with_id(app, "reset-zoom", "Reset Zoom", true, Some("CmdOrCtrl+0"))?;

    Submenu::with_items(
        app,
        "View",
        true,
        &[
            &open_left_panel,
            &PredefinedMenuItem::separator(app)?,
            &cmd_palette,
            &nav_palette,
            &launch_config_palette,
            &toggle_files_palette,
            &left_panel_agent,
            &left_panel_proj,
            &left_panel_search,
            &PredefinedMenuItem::separator(app)?,
            &show_history,
            &cmd_search,
            &workflows,
            &PredefinedMenuItem::separator(app)?,
            &toggle_mouse,
            &toggle_scroll,
            &toggle_focus,
            &PredefinedMenuItem::separator(app)?,
            &compact_mode,
            &PredefinedMenuItem::separator(app)?,
            &zoom_in,
            &zoom_out,
            &reset_zoom,
        ],
    )
}
