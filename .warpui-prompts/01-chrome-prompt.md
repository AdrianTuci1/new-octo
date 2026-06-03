# Agent: chrome — Port Topbar, Sidebar, PaneTree, Drawers

## React Source (READ THESE)
Read these React files to understand the design:
- `src/components/App/chrome/WorkspaceTopbar.tsx` — tab bar + sidebar/agents toggle
- `src/components/App/chrome/WorkspaceTopbarTab.tsx` — individual tab
- `src/components/App/chrome/WorkspaceTopbarTabMenu.tsx` — tab context menu
- `src/components/App/chrome/WorkspaceSidebar.tsx` — sidebar with chat/files/search/history nav
- `src/components/App/chrome/WorkspacePanelPlaceholder.tsx` — placeholder panel
- `src/components/App/chrome/workspaceChromeTypes.ts` — types
- `src/components/App/chrome/workspaceChromeData.ts` — data helpers
- `src/components/App/chrome/FileExplorer.tsx` — file tree in sidebar
- `src/components/App/AppWindow.tsx` — main layout that stitches everything together
- `src/components/App/agents/AgentsView.tsx` — agents overlay panel
- `src/components/App/drawers/AppWindowDrawers.tsx` — keyboard shortcuts drawer
- `src/components/App/panes/WorkspacePaneTree.tsx` — pane tree layout container

Also read the CSS files for design reference (paddings, colors, font sizes, transitions):
- `src/components/App/chrome/*.css`
- `src/components/App/AppWindow.css`
- `src/components/App/agents/AgentsView.css`

## Target Files (CREATE/OVERWRITE these in octomus-ui)
- `octomus-ui/src/chrome/topbar.rs` — WorkspaceTopbar warpui View
- `octomus-ui/src/chrome/topbar_tab.rs` — Tab item renderer
- `octomus-ui/src/chrome/topbar_tab_menu.rs` — Tab context menu
- `octomus-ui/src/chrome/sidebar.rs` — WorkspaceSidebar warpui View
- `octomus-ui/src/chrome/pane_tree.rs` — WorkspacePaneTree warpui View
- `octomus-ui/src/chrome/drawers.rs` — Keyboard shortcuts drawer
- `octomus-ui/src/chrome/agents_view.rs` — Agents overlay panel
- `octomus-ui/src/chrome/file_explorer.rs` — FileExplorer view
- `octomus-ui/src/chrome/panel_placeholder.rs` — WorkspacePanelPlaceholder
- `octomus-ui/src/chrome/types.rs` — Shared types for chrome module
- `octomus-ui/src/chrome/data.rs` — Data helpers
- `octomus-ui/src/chrome/workspace_types.rs` — Types shared with other modules

## Existing octomus-ui Module Entry
- `octomus-ui/src/chrome/mod.rs` — must export all new modules
- `octomus-ui/src/state/shell.rs` — state types (WorkspaceChromeTab, WorkspacePaneLayout, etc.)

## WarpUI Patterns to Follow

### View pattern
```rust
use warpui::{
    elements::{Container, Flex, Text, Icon, Stack, // etc},
    AppContext, Entity, View, ViewContext, Element,
};

pub struct MyView { /* fields: model handles, state */ }

impl Entity for MyView {
    type Event = MyViewEvent;
}

impl View for MyView {
    fn ui_name() -> &'static str { "MyView" }
    fn render(&self, app: &AppContext) -> Box<dyn Element> {
        Container::new()
            .with_child(Flex::row()....)
            .finish()
    }
}
```

### Sub-views return `Box<dyn Element>`
Create helper functions that return `Box<dyn Element>` for reusable pieces (like tab items, nav buttons, conversation items).

### Color from Appearance
```rust
let appearance = crate::appearance::Appearance::as_ref(app);
let fg = appearance.theme().foreground();
let bg = appearance.theme().background();
```

### Interaction
```rust
use warpui::elements::{Hoverable, MouseStateHandle};
// Hoverable wraps any element
Hoverable::new(some_element)
    .on_click(move || { /* action */ })
    .finish()
```

### Scrollable areas
```rust
use warpui::elements::{NewScrollable, ScrollableAxis};
NewScrollable::new()
    .with_axis(ScrollableAxis::Vertical)
    .with_child(Flex::column().with_children(items))
    .finish()
```

### Reference existing warpui views for patterns
- `app/src/workspace/view/left_panel.rs` — sidebar panel with tabs
- `app/src/workspace/view/right_panel.rs` — resizable panel
- `app/src/pane_group/pane/welcome_view.rs` — simple view with Flex, Container, Text, Icon
- `app/src/workspace/view/conversation_list/view.rs` — scrollable list

## Deliverable
Create all files listed above. Each file must compile against warpui API (not egui). After writing all files, run `cargo check -p octomus-ui 2>&1` and fix any compile errors.
