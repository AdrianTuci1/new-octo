use tauri::{
    menu::{MenuItem, PredefinedMenuItem, Submenu},
    Manager, Runtime,
};

pub fn build<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Submenu<R>> {
    let new_window = MenuItem::with_id(app, "new-window", "New Window", true, Some("CmdOrCtrl+N"))?;
    let new_terminal_tab = MenuItem::with_id(
        app,
        "workspace.new-terminal-tab",
        "New Terminal Tab",
        true,
        Some("CmdOrCtrl+T"),
    )?;
    let new_agent_tab = MenuItem::with_id(
        app,
        "workspace.new-conversation-tab",
        "New Agent Tab",
        true,
        Some("Shift+CmdOrCtrl+N"),
    )?;
    let new_file = MenuItem::with_id(app, "new-file", "New File", true, None::<&str>)?;

    let reopen_closed = MenuItem::with_id(
        app,
        "reopen-closed",
        "Reopen Closed Session",
        false,
        Some("Shift+CmdOrCtrl+T"),
    )?;

    let launch_configs = Submenu::with_items(app, "Launch Configurations", true, &[])?;
    let open_repo = MenuItem::with_id(
        app,
        "open-repo",
        "Open Repository",
        true,
        Some("Shift+CmdOrCtrl+O"),
    )?;
    let open_recent = Submenu::with_items(app, "Open Recent", true, &[])?;

    let close_session = MenuItem::with_id(
        app,
        "workspace.close-active-tab",
        "Close Current Session",
        true,
        Some("CmdOrCtrl+W"),
    )?;
    let close_window = MenuItem::with_id(
        app,
        "close-window",
        "Close Window",
        true,
        Some("Shift+CmdOrCtrl+W"),
    )?;

    Submenu::with_items(
        app,
        "File",
        true,
        &[
            &new_window,
            &new_terminal_tab,
            &new_agent_tab,
            &new_file,
            &PredefinedMenuItem::separator(app)?,
            &reopen_closed,
            &launch_configs,
            &PredefinedMenuItem::separator(app)?,
            &open_repo,
            &open_recent,
            &PredefinedMenuItem::separator(app)?,
            &close_session,
            &close_window,
        ],
    )
}
