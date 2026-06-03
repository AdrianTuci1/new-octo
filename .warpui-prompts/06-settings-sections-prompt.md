# Agent: settings-sections — Port ALL settings section pages

## React Source (READ THESE)
- `src/components/App/settings/sections/AccountSection.tsx`
- `src/components/App/settings/sections/AgentSection.tsx`
- `src/components/App/settings/sections/AppearanceSection.tsx`
- `src/components/App/settings/sections/CloudCredentialsSection.tsx`
- `src/components/App/settings/sections/CloudTerminalsSection.tsx`
- `src/components/App/settings/sections/CodeSettingsSections.tsx`
- `src/components/App/settings/sections/KeyboardShortcutsSection.tsx`
- `src/components/App/settings/sections/KnowledgeSection.tsx`
- `src/components/App/settings/sections/MCPServersSection.tsx`
- `src/components/App/settings/sections/ProfilesSection.tsx`
- `src/components/App/settings/sections/SectionPlaceholder.tsx`
- `src/components/App/settings/sections/SettingsPrimitives.tsx`
- `src/components/App/settings/sections/ThirdPartyCliAgentsSection.tsx`
- `src/components/App/settings/settingsData.ts` — data for all sections
- `src/components/App/settings/settingsTypes.ts` — types

Also read CSS:
- `src/components/App/settings/*.css`

## Target Files (CREATE/OVERWRITE)
- `octomus-ui/src/settings/sections/profile.rs` — AccountSection port
- `octomus-ui/src/settings/sections/agent.rs` — AgentSection port
- `octomus-ui/src/settings/sections/appearance.rs` — AppearanceSection port
- `octomus-ui/src/settings/sections/cloud_credentials.rs` — CloudCredentialsSection port
- `octomus-ui/src/settings/sections/cloud.rs` — CloudTerminalsSection port
- `octomus-ui/src/settings/sections/code.rs` — CodeSettingsSections port
- `octomus-ui/src/settings/sections/keyboard.rs` — KeyboardShortcutsSection port
- `octomus-ui/src/settings/sections/knowledge.rs` — KnowledgeSection port
- `octomus-ui/src/settings/sections/mcp.rs` — MCPServersSection port
- `octomus-ui/src/settings/sections/profiles.rs` — ProfilesSection port
- `octomus-ui/src/settings/sections/placeholder.rs` — SectionPlaceholder
- `octomus-ui/src/settings/sections/primitives.rs` — SettingsPrimitives (form fields: text input, toggle, dropdown, etc.)
- `octomus-ui/src/settings/sections/third_party_cli.rs` — ThirdPartyCliAgentsSection port
- `octomus-ui/src/settings/sections/mod.rs` — module root, export all sections

## WarpUI Patterns
- Each section is a struct with `render` method returning `Box<dyn Element>`
- Use `Flex::column()` for vertical section layout
- Use `Container` for grouping related settings (card-like sections)
- Use `Text` for labels and descriptions
- Use `Hoverable` for buttons and toggles
- Use `Appearance` for theme colors
- Settings primitives: create reusable components:
  - `SettingsTextInput` — labeled text input field
  - `SettingsToggle` — on/off toggle
  - `SettingsDropdown` — dropdown selector
  - `SettingsButton` — action button
  - `SettingsSection` — section wrapper with title + description

## Reference warpui views
- `app/src/pane_group/pane/welcome_view.rs` — Container, Flex, Text
- `app/src/view_components/action_button.rs` — reusable button pattern
- `app/src/view_components/dropdown.rs` — dropdown component
- `app/src/view_components/clickable_text_input.rs` — text input pattern

## Existing octomus-ui files
- `octomus-ui/src/settings/sections/*.rs` — existing egui versions, overwrite them

## Deliverable
Create/overwrite all files listed. Use warpui API only. After writing, run `cargo check -p octomus-ui 2>&1` and fix compile errors.
