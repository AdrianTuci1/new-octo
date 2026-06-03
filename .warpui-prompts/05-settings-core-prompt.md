# Agent: settings-core — Port SettingsSidebar + SettingsContent + data/types

## React Source (READ THESE)
- `src/components/App/settings/SettingsSidebar.tsx` — sidebar with sections list
- `src/components/App/settings/SettingsContent.tsx` — content area that renders section
- `src/components/App/settings/settingsData.ts` — settings data structure
- `src/components/App/settings/settingsTypes.ts` — types
- `src/components/App/settings/agentSettings.ts` — agent settings data
- `src/components/App/settings/codeSettings.ts` — code settings data
- `src/components/App/settings/profileSettings.ts` — profile settings data
- `src/components/App/settings/cloudProfiles.ts` — cloud profile data
- `src/components/App/settings/useProfileSettings.ts` — profile settings hooks

Also read CSS:
- `src/components/App/settings/*.css`
- `src/components/App/AppWindow.css` — settings layout

## Target Files (CREATE/OVERWRITE)
- `octomus-ui/src/settings/sidebar.rs` — SettingsSidebar warpui View
- `octomus-ui/src/settings/mod.rs` — module root, import sidebar and drawer and sections
- `octomus-ui/src/settings/drawer.rs` — Settings drawer (optional, if separate from sidebar)
- `octomus-ui/src/settings/sections/mod.rs` — module for all sections

## WarpUI Patterns
- Sidebar: `Flex::column()` with clickable section items
- Use `Hoverable::new()` for section navigation buttons
- Use `Container::new()` with `.with_padding()` and `.with_corner_radius()` for active section highlight
- Use `Appearance` for theme colors
- Content area: `Stack` or `Flex` that shows the selected section

## Reference warpui views
- `app/src/workspace/view/left_panel.rs` — sidebar with nav buttons
- `app/src/workspace/view/conversation_list/view.rs` — list of clickable items

## Deliverable
Create all files. After writing, run `cargo check -p octomus-ui 2>&1` and fix compile errors.
