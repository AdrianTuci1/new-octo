# Agent: composer — Port ComposerBar, TerminalComposer, model setup, slash commands, pickers

## React Source (READ THESE)
- `src/components/Composer/ComposerBar.tsx` — main agent composer
- `src/components/Composer/TerminalComposer.tsx` — terminal composer
- `src/components/Composer/useComposerBarController.tsx` — controller logic
- `src/components/Composer/ComposerContextMenu.tsx` — context menu
- `src/components/Composer/SlashCommandHighlight.tsx` — slash command highlight
- `src/components/Composer/GitBranchPicker.tsx` — git branch picker
- `src/components/Composer/WorkingDirectoryPicker.tsx` — working directory picker
- `src/components/Composer/ModelSetupOverlay.tsx` — model setup overlay
- `src/components/Composer/CommandApprovalComposer.tsx` — command approval composer

Also read CSS:
- `src/components/Composer/*.css`
- `src/components/Composer/ComposerBar.css`
- `src/components/Composer/TerminalComposer.css`

## Target Files (CREATE/OVERWRITE)
- `octomus-ui/src/composer/input.rs` — ComposerBar View (chat input textarea, actions row)
- `octomus-ui/src/composer/input_selection.rs` — Text selection/completion logic
- `octomus-ui/src/composer/terminal_composer.rs` — TerminalComposer View
- `octomus-ui/src/composer/terminal_controller.rs` — Terminal composer controller
- `octomus-ui/src/composer/controller.rs` — ComposerController (already exists, update to View)
- `octomus-ui/src/composer/composer_state.rs` — ComposerState (update)
- `octomus-ui/src/composer/context_menu.rs` — Composer context menu View
- `octomus-ui/src/composer/context_menu_store.rs` — Store for context menu items
- `octomus-ui/src/composer/slash.rs` — Slash command highlight
- `octomus-ui/src/composer/mentions.rs` — Context mentions
- `octomus-ui/src/composer/model_picker.rs` — Model picker
- `octomus-ui/src/composer/model_setup.rs` — ModelSetupOverlay View
- `octomus-ui/src/composer/branch_picker.rs` — GitBranchPicker View
- `octomus-ui/src/composer/directory_picker.rs` — WorkingDirectoryPicker View
- `octomus-ui/src/composer/command_approval.rs` — CommandApprovalComposer

## WarpUI Patterns
- Composer textarea: use an interactive Container with Text rendering
- Action buttons: use Hoverable + Container with colors
- Progress ring: use SVG-like path rendering (pathfinder_geometry)
- Dropdown menus: use Overlay/Stack with positioned elements
- Keyboard shortcuts: show Text labels with key styling

## Reference warpui views
- `app/src/view_components/dropdown.rs` — dropdown menu patterns
- `app/src/view_components/compact_dropdown.rs` — compact dropdown
- `app/src/view_components/action_button.rs` — button patterns
- `app/src/pane_group/pane/welcome_view.rs` — basic layout

## Existing octomus-ui State
- `octomus-ui/src/state/chat.rs` — ChatAttachment etc.
- `octomus-ui/src/state/launcher.rs` — Launcher state

## Deliverable
Create/update all files listed. Use warpui API only (no egui). After writing, run `cargo check -p octomus-ui 2>&1` and fix compile errors.
