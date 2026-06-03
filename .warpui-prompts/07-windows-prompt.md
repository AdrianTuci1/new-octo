# Agent: windows — Port Tray panel, Launcher layout, Onboarding

## React Source (READ THESE)
- `src/components/Tray/TrayPanel.tsx` — main tray panel
- `src/components/Tray/TrayCommands.tsx` — commands tab
- `src/components/Tray/TrayConversations.tsx` — conversations tab
- `src/components/Tray/TrayFooter.tsx` — tray footer
- `src/components/Tray/TrayHelp.tsx` — help tab
- `src/components/Tray/TrayHistory.tsx` — history tab
- `src/components/Tray/TrayModels.tsx` — models tab
- `src/components/Onboarding/Onboarding.tsx` — onboarding flow
- `src/components/App/AppWindow.tsx` — the main window layout (for launcher vs settings vs panel)
- `src/components/App/chrome/WorkspacePanelPlaceholder.tsx` — placeholder panel

Also read CSS:
- `src/components/Tray/*.css`
- `src/components/Onboarding/Onboarding.css`

## Target Files (CREATE/OVERWRITE)
- `octomus-ui/src/windows/tray_panel.rs` — TrayPanel View
- `octomus-ui/src/windows/tray_commands.rs` — TrayCommands
- `octomus-ui/src/windows/tray_conversations.rs` — TrayConversations
- `octomus-ui/src/windows/tray_footer.rs` — TrayFooter
- `octomus-ui/src/windows/tray_help.rs` — TrayHelp
- `octomus-ui/src/windows/tray_history.rs` — TrayHistory
- `octomus-ui/src/windows/tray_models.rs` — TrayModels
- `octomus-ui/src/windows/onboarding.rs` — Onboarding View
- `octomus-ui/src/windows/placeholder.rs` — PanelPlaceholder View
- `octomus-ui/src/windows/mod.rs` — module root

## WarpUI Patterns
- Tabs/modes: Flex::column with conditional rendering based on mode
- Lists: NewScrollable with clickable items
- Buttons: Hoverable + Container
- Footer: Flex::row() at bottom with mode buttons
- Use Appearance for theme colors
- Search input: Container with Text and border styling

## Reference warpui views
- `app/src/workspace/view/left_panel.rs` — navigation buttons
- `app/src/view_components/action_button.rs` — button patterns
- `app/src/pane_group/pane/welcome_view.rs` — basic layout

## Deliverable
Create all files listed. Use warpui API only (no egui). After writing, run `cargo check -p octomus-ui 2>&1` and fix compile errors.
