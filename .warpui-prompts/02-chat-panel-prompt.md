# Agent: chat-panel — Port ChatTimeline, ChatPanelFacade, find overlay, approval

## React Source (READ THESE)
- `src/components/Chat/ChatPanel.tsx` — main entry
- `src/components/Chat/*.tsx` and `src/components/Chat/chatPanel/*.tsx` — ChatPanelFacade internals
- `src/components/Chat/chatPanel/ChatTimeline.tsx` — the timeline layout
- `src/components/Chat/chatPanel/find_overlay.tsx` — find overlay
- `src/components/Chat/chatPanel/approval.tsx` — command approval UI

Also read the CSS:
- `src/components/Chat/ChatPanel.css`
- `src/components/Chat/chatPanel/*.css`

## Target Files (CREATE/OVERWRITE)
- `octomus-ui/src/chat/timeline.rs` — ChatTimeline warpui View
- `octomus-ui/src/chat/layout.rs` — Overall chat panel layout
- `octomus-ui/src/chat/find_overlay.rs` — Find overlay view
- `octomus-ui/src/chat/approval.rs` — Command approval view
- `octomus-ui/src/chat/chat_panel_wrapper.rs` — ChatPanelFacade → warpui View
- `octomus-ui/src/chat/message_row.rs` — Message row renderer
- `octomus-ui/src/chat/message_time.rs` — Message timestamp renderer
- `octomus-ui/src/chat/terminal_row.rs` — Terminal command row in chat
- `octomus-ui/src/chat/terminal_error_row.rs` — Error row in chat
- `octomus-ui/src/chat/multi_agent_row.rs` — Multi-agent conversation row

## Existing octomus-ui State Types
- `octomus-ui/src/state/chat.rs` — ChatState, Message, ChatMessage, ChatAttachment, etc.
- `octomus-ui/src/state/agent.rs` — agent state types

## WarpUI Patterns (same as chrome agent)
Use `Flex::column()` for vertical layouts, `Container::new()` with `.with_corner_radius()`, `.with_margin()`, `.with_padding()` for styling.
Use `NewScrollable::new()` for the scrollable timeline.
Use `Hoverable::new()` for clickable rows.
Use `Appearance` for theme colors.
Use `stack` for overlay elements (like find overlay on top of timeline).

Each file must be a proper `impl View` or helper functions returning `Box<dyn Element>`.

## Reference warpui views
- `app/src/pane_group/pane/welcome_view.rs` — simple layout
- `app/src/workspace/view/conversation_list/view.rs` — scrollable list
- `app/src/view_components/find.rs` — find overlay pattern

## Deliverable
Create all files listed. After writing, run `cargo check -p octomus-ui 2>&1` and fix compile errors.
