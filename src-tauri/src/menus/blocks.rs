use tauri::{
    menu::{MenuItem, PredefinedMenuItem, Submenu},
    Manager, Runtime,
};

pub fn build<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Submenu<R>> {
    let clear_blocks = MenuItem::with_id(
        app,
        "blocks.clear",
        "Clear Blocks",
        true,
        Some("CmdOrCtrl+K"),
    )?;

    let select_prev = MenuItem::with_id(
        app,
        "blocks.select-prev",
        "Select Previous Block",
        true,
        Some("CmdOrCtrl+Up"),
    )?;
    let select_next = MenuItem::with_id(
        app,
        "blocks.select-next",
        "Select Next Block",
        true,
        Some("CmdOrCtrl+Down"),
    )?;
    let select_all = MenuItem::with_id(
        app,
        "blocks.select-all",
        "Select All Blocks",
        true,
        None::<&str>,
    )?;

    let scroll_top = MenuItem::with_id(
        app,
        "blocks.scroll-top",
        "Scroll to Top of Selected Block",
        true,
        Some("Shift+CmdOrCtrl+Up"),
    )?;
    let scroll_bottom = MenuItem::with_id(
        app,
        "blocks.scroll-bottom",
        "Scroll to Bottom of Selected Block",
        true,
        Some("Shift+CmdOrCtrl+Down"),
    )?;

    let share_block = MenuItem::with_id(
        app,
        "blocks.share",
        "Share Selected Block",
        true,
        Some("Shift+CmdOrCtrl+S"),
    )?;
    let view_shared = MenuItem::with_id(
        app,
        "blocks.view-shared",
        "View Shared Blocks...",
        true,
        None::<&str>,
    )?;
    let bookmark_block = MenuItem::with_id(
        app,
        "blocks.bookmark",
        "Bookmark Selected Block",
        true,
        Some("CmdOrCtrl+B"),
    )?;
    let find_in_block = MenuItem::with_id(
        app,
        "blocks.find",
        "Find Within Selected Block",
        true,
        Some("CmdOrCtrl+F"),
    )?;

    let copy_cmd_out = MenuItem::with_id(
        app,
        "blocks.copy-cmd-out",
        "Copy Command and Output",
        true,
        Some("CmdOrCtrl+C"),
    )?;
    let copy_cmd = MenuItem::with_id(
        app,
        "blocks.copy-cmd",
        "Copy Command",
        true,
        Some("Shift+CmdOrCtrl+C"),
    )?;
    let copy_out = MenuItem::with_id(
        app,
        "blocks.copy-out",
        "Copy Command Output",
        true,
        Some("Option+Shift+CmdOrCtrl+C"),
    )?;

    let show_in_band = MenuItem::with_id(
        app,
        "blocks.show-in-band",
        "Show In-band Command Blocks",
        true,
        None::<&str>,
    )?;
    let show_octomusified = MenuItem::with_id(
        app,
        "blocks.show-octomusified",
        "Show Octomusified SSH Blocks",
        true,
        None::<&str>,
    )?;

    Submenu::with_items(
        app,
        "Blocks",
        true,
        &[
            &clear_blocks,
            &PredefinedMenuItem::separator(app)?,
            &select_prev,
            &select_next,
            &select_all,
            &PredefinedMenuItem::separator(app)?,
            &scroll_top,
            &scroll_bottom,
            &PredefinedMenuItem::separator(app)?,
            &share_block,
            &view_shared,
            &bookmark_block,
            &find_in_block,
            &PredefinedMenuItem::separator(app)?,
            &copy_cmd_out,
            &copy_cmd,
            &copy_out,
            &PredefinedMenuItem::separator(app)?,
            &show_in_band,
            &show_octomusified,
        ],
    )
}
