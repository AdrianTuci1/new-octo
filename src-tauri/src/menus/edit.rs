use tauri::{
    menu::{CheckMenuItem, MenuItem, PredefinedMenuItem, Submenu},
    Manager, Runtime,
};

pub fn build<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Submenu<R>> {
    let clear_editor = MenuItem::with_id(
        app,
        "clear-editor",
        "Clear Command Editor",
        true,
        Some("Ctrl+C"),
    )?;
    let add_next_occ = MenuItem::with_id(
        app,
        "add-next-occurrence",
        "Add Selection for Next Occurrence",
        true,
        Some("CmdOrCtrl+G"),
    )?;
    let add_cursor_above = MenuItem::with_id(
        app,
        "add-cursor-above",
        "Add Cursor Above",
        true,
        Some("Shift+CmdOrCtrl+Up"),
    )?;
    let add_cursor_below = MenuItem::with_id(
        app,
        "add-cursor-below",
        "Add Cursor Below",
        true,
        Some("Shift+CmdOrCtrl+Down"),
    )?;

    let find_terminal = MenuItem::with_id(
        app,
        "find-terminal",
        "Find in Terminal",
        true,
        Some("CmdOrCtrl+F"),
    )?;
    let go_to_line =
        MenuItem::with_id(app, "go-to-line", "Go to Line", false, Some("CmdOrCtrl+G"))?;
    let focus_terminal_input = MenuItem::with_id(
        app,
        "focus-terminal-input",
        "Focus Terminal Input",
        true,
        Some("CmdOrCtrl+L"),
    )?;

    let sync_inputs = Submenu::with_items(app, "Synchronize Inputs", true, &[])?;

    let use_octomus_prompt = CheckMenuItem::with_id(
        app,
        "use-octomus-prompt",
        "Use Octomus's Prompt",
        true,
        true,
        None::<&str>,
    )?;
    let copy_on_select = CheckMenuItem::with_id(
        app,
        "copy-on-select",
        "Copy on Select within the Terminal",
        true,
        true,
        None::<&str>,
    )?;

    Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &clear_editor,
            &PredefinedMenuItem::separator(app)?,
            &add_next_occ,
            &add_cursor_above,
            &add_cursor_below,
            &PredefinedMenuItem::separator(app)?,
            &find_terminal,
            &go_to_line,
            &focus_terminal_input,
            &PredefinedMenuItem::separator(app)?,
            &sync_inputs,
            &PredefinedMenuItem::separator(app)?,
            &use_octomus_prompt,
            &copy_on_select,
        ],
    )
}
