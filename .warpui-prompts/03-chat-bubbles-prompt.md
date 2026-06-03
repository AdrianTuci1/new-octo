# Agent: chat-bubbles — Port MessageBubbles, blocks, markdown, diffs

## React Source (READ THESE)
- `src/components/Chat/MessageBubble.tsx` — entry
- `src/components/Chat/messageBubble/*.tsx` — MessageBubbleFacade
- `src/components/Chat/messageBubble/bubble.rs` equivalent → examine all tsx in that dir
- `src/components/Chat/messageBubble/blocks.tsx` — block renderers (thinking, exploration, web search)
- `src/components/Chat/messageBubble/code_block.tsx` — syntax highlighted code blocks
- `src/components/Chat/messageBubble/diff.rs` equivalent → diff rendering
- `src/components/Chat/messageBubble/markdown.tsx` — markdown renderer
- `src/components/Chat/messageBubble/file_proposals.tsx` — file proposals
- `src/components/Chat/messageBubble/bubble_presenter.tsx` — bubble layout
- `src/components/Chat/messageBubble/types.ts` — bubble types
- `src/components/Chat/CodeDiffView.tsx` — code diff view

Also read CSS:
- `src/components/Chat/messageBubble/*.css`
- `src/components/Chat/CodeDiffView.css`

## Target Files (CREATE/OVERWRITE)
- `octomus-ui/src/chat/bubble.rs` — Main MessageBubble View
- `octomus-ui/src/chat/bubble_content.rs` — Bubble content rendering
- `octomus-ui/src/chat/bubble_presenter.rs` — Bubble layout/presenter
- `octomus-ui/src/chat/blocks.rs` — Block renderers (thinking, exploration, web search)
- `octomus-ui/src/chat/block_index.rs` — Block index/highlight
- `octomus-ui/src/chat/code_block.rs` — Code block with syntax highlighting
- `octomus-ui/src/chat/diff.rs` — Diff rendering
- `octomus-ui/src/chat/markdown.rs` — Markdown → warpui elements
- `octomus-ui/src/chat/markdown_text.rs` — Text markdown segments
- `octomus-ui/src/chat/highlight.rs` — Syntax highlighting helpers
- `octomus-ui/src/chat/file_proposals.rs` — File proposals view
- `octomus-ui/src/chat/file_proposal_state.rs` — File proposal state types
- `octomus-ui/src/chat/tool_message.rs` — Tool message renderer

## Existing octomus-ui Types
- `octomus-ui/src/chat/types.rs` — MessageRole, AgentRunStatus, DiffDelta, FileDiff, etc.
- `octomus-ui/src/state/chat.rs` — ChatMessage, ChatState, FileDiff, etc.

## WarpUI Patterns
- Use `Flex::row()`/`Flex::column()` for layout of bubbles
- Use `Container::new()` with `.with_corner_radius()` for bubble styling
- Use `Text::new()` with `.with_font_size()` and `.with_color()` for text
- Use `Appearance` for theme colors
- For code blocks: use `Container` with monospace styling and a copy button
- For diffs: render lines with `+` green / `-` red colors
- For markdown: parse with pulldown-cmark, convert to Flex/Container/Text elements
- Each block type gets its own render function returning `Box<dyn Element>`

## Reference warpui views
- `app/src/pane_group/pane/welcome_view.rs` — simple elements
- `app/src/terminal/block_list_element.rs` — complex block rendering patterns
- `crates/warpui_core/src/elements/*.rs` — understand Text, Container, Flex APIs

## Deliverable
Create all files listed. Each file must use warpui API (not egui). After writing, run `cargo check -p octomus-ui 2>&1` and fix compile errors.
