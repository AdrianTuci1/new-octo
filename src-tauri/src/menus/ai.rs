use tauri::{
    menu::{MenuItem, PredefinedMenuItem, Submenu},
    Manager, Runtime,
};

pub fn build<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Submenu<R>> {
    let new_agent_pane = MenuItem::with_id(
        app,
        "ai.new-agent-pane",
        "New Agent Pane",
        true,
        Some("CmdOrCtrl+Space"),
    )?;
    let attach_context = MenuItem::with_id(
        app,
        "ai.attach-context",
        "Attach Selection as Agent Context",
        true,
        Some("Shift+CmdOrCtrl+Space"),
    )?;

    // Grayed out (enabled = false) in the image
    let open_suggestions = MenuItem::with_id(
        app,
        "ai.open-suggestions",
        "Open AI Command Suggestions",
        false,
        Some("CmdOrCtrl+`"),
    )?;

    let open_rules = MenuItem::with_id(app, "ai.open-rules", "Open AI Rules", true, None::<&str>)?;
    let open_mcp = MenuItem::with_id(app, "ai.open-mcp", "Open MCP Servers", true, None::<&str>)?;

    Submenu::with_items(
        app,
        "AI",
        true,
        &[
            &new_agent_pane,
            &attach_context,
            &PredefinedMenuItem::separator(app)?,
            &open_suggestions,
            &PredefinedMenuItem::separator(app)?,
            &open_rules,
            &open_mcp,
        ],
    )
}
