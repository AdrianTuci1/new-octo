# Agent: app-shell — Port Launcher per-pane (shell + chat + composer integration)

## React Source (READ THESE)
- `src/components/Layout/Launcher/Launcher.tsx` — the main launcher that composes ChatPanel + Composer + TrayPanel
- `src/components/Layout/Launcher/AgentStatusBar.tsx` — agent status indicator
- `src/components/Layout/Launcher/LauncherContext.tsx` — launcher context/provider
- `src/components/App/panes/WorkspacePaneSlot.tsx` — pane slot wrapper with store
- `src/components/App/panes/WorkspacePaneTree.tsx` — pane tree container
- `src/components/App/AppWindow.tsx` — how everything is stitched together
- `src/views/Shell/ShellWindow.tsx` — top-level shell window

Also read CSS:
- `src/components/Layout/Launcher/*.css`
- `src/components/App/panes/*.css`
- `src/components/App/AppWindow.css`

## Target Files (CREATE/OVERWRITE)
- `octomus-ui/src/app.rs` — Main app entry View that stitches chrome + pane tree + settings
- `octomus-ui/src/state/launcher.rs` — Launcher state (update for View model)
- `octomus-ui/src/state/runtime.rs` — Runtime state (connections, session lifecycle)
- `octomus-ui/src/state/ui.rs` — UI state (is_chat_open, is_terminal_mode, etc.)

## Patterns
This is the integration point. Create ONE View (e.g. `LauncherPaneView` or `AppView`) that holds:
- chrome (topbar, sidebar)
- pane tree (terminal panes + LauncherSlot per pane)
- settings view (when active)
- agents overlay (when active)
- drawers overlay (when active)

The LauncherSlot contains:
- TerminalView (from `app/src/terminal/`)
- ChatTimeline (from chat module)
- ComposerBar or TerminalComposer
- TrayPanel
- AgentStatusBar

It should use:
```rust
Stack::new()
    .with(main_content)
    .with(drawers_overlay)
    .with(agents_overlay)
    .finish()
```

Use `Appearance` for colors, `Resizable` for resizable panels, `Flex` for layouts.

## Reference warpui views
- `app/src/workspace/view.rs` — top-level workspace view
- `app/src/pane_group/pane/mod.rs` — pane group with terminal
- `app/src/workspace/view/left_panel.rs` — resizable sidebar pattern
- `app/src/workspace/view/right_panel.rs` — resizable panel pattern

## Deliverable
Create/update all files listed. This is the integration point that stitches all other views together. Use warpui API only (no egui). After writing, run `cargo check -p octomus-ui 2>&1` and fix compile errors.
