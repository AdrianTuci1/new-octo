# Octomus — Schelet Arhitectural

> Blueprint complet: directoare, fișiere, dependențe, tipuri partajate și flow-uri de date.
> Stack: **Tauri v2 + Rust (backend) + React 18 + Vite (frontend)**.

---

## 1. Structura Finală a Proiectului

```
octomus/launcher-rs-react/
│
├── src-tauri/                          # ══════ RUST BACKEND ══════
│   ├── Cargo.toml                      # Dependențe Rust
│   ├── tauri.conf.json                 # Configurare Tauri (fereastră, permisiuni)
│   ├── build.rs                        # Tauri build hooks
│   │
│   └── src/
│       ├── main.rs                     # Entry point — Builder + plugin registration
│       ├── state.rs                    # AppState global (Arc<Mutex<...>>)
│       ├── error.rs                    # Error types (thiserror)
│       │
│       ├── terminal/                   # ── Terminal Engine ──
│       │   ├── mod.rs                  # Tauri commands: spawn, write, resize, kill
│       │   ├── pty.rs                  # portable-pty wrapper (spawn, read loop)
│       │   ├── session.rs             # TerminalSession (pty + metadata)
│       │   ├── ansi.rs                # vte parser → events
│       │   ├── grid.rs                # Cell grid (rows × cols)
│       │   ├── block.rs               # Block detection (precmd/preexec hooks)
│       │   └── history.rs             # Command history (in-memory + SQLite)
│       │
│       ├── ai/                         # ── AI Engine ──
│       │   ├── mod.rs                  # Tauri commands: send_message, cancel, reset
│       │   ├── conversation.rs         # Conversation { exchanges, metadata }
│       │   ├── exchange.rs             # Exchange { input, output, status, timing }
│       │   ├── streaming.rs            # SSE/stream handler → Tauri events
│       │   ├── context.rs              # ExecutionContext { os, shell, cwd }
│       │   ├── markdown.rs             # Server-side markdown → segments
│       │   ├── rate_limit.rs           # RequestLimitInfo, credit tracking
│       │   │
│       │   ├── providers/              # LLM Provider implementations
│       │   │   ├── mod.rs              # trait AgentBackend
│       │   │   ├── openai.rs           # OpenAI / compatible
│       │   │   ├── anthropic.rs        # Claude API
│       │   │   ├── gemini.rs           # Google Gemini
│       │   │   └── ollama.rs           # Local LLM (offline)
│       │   │
│       │   └── tools/                  # Tool/Action system
│       │       ├── mod.rs              # trait ToolExecutor
│       │       ├── command.rs          # Execute shell command
│       │       ├── file_read.rs        # Read files
│       │       ├── file_edit.rs        # Edit/create files
│       │       ├── search.rs           # Grep + glob
│       │       └── web.rs              # Web search/fetch
│       │
│       ├── spotlight/                  # ── Spotlight / Commands ──
│       │   ├── mod.rs                  # Tauri commands: get_commands, execute_command
│       │   ├── commands.rs             # SlashCommand registry (Vec<SlashCommand>)
│       │   ├── context_sources.rs      # @-menu data sources (files, symbols, etc.)
│       │   └── fuzzy.rs                # Fuzzy matching (prefix + substring)
│       │
│       ├── editor/                     # ── Code Editor Backend ──
│       │   ├── mod.rs                  # Tauri commands: open_file, save_file
│       │   ├── buffer.rs              # File buffer management
│       │   └── lsp.rs                 # LSP client (tower-lsp)
│       │
│       └── persistence/               # ── Storage ──
│           ├── mod.rs                  # DB init, migrations
│           ├── conversations.rs        # CRUD for conversations
│           ├── history.rs              # Command history queries
│           └── settings.rs             # User preferences
│
├── src/                                # ══════ REACT FRONTEND ══════
│   ├── main.tsx                        # React DOM mount
│   ├── App.tsx                         # Router + global providers
│   ├── styles.css                      # Global styles + design tokens
│   │
│   ├── components/                     # ── UI Components ──
│   │   ├── Spotlight/
│   │   │   ├── SpotlightInput.tsx      # Main input (textarea + trigger detection)
│   │   │   ├── SlashMenu.tsx           # Slash command palette
│   │   │   ├── ContextMenu.tsx         # @-context picker (categories + search)
│   │   │   ├── InputSuggestions.tsx     # Prompt history (↑ arrow)
│   │   │   └── PreparedResponses.tsx   # Quick follow-up buttons
│   │   │
│   │   ├── Chat/
│   │   │   ├── Transcript.tsx          # Message list (scrollable)
│   │   │   ├── MessageBubble.tsx       # Single message (user/assistant)
│   │   │   ├── CodeBlock.tsx           # Interactive code block (copy/run/save)
│   │   │   ├── MarkdownRenderer.tsx    # Parsed markdown → React elements
│   │   │   ├── ToolCallDisplay.tsx     # Tool execution status + results
│   │   │   └── StreamingIndicator.tsx  # Typing dots / progress
│   │   │
│   │   ├── Terminal/
│   │   │   ├── TerminalView.tsx        # xterm.js wrapper
│   │   │   ├── BlockView.tsx           # Command block (input + output)
│   │   │   └── BlockActions.tsx        # Block action buttons
│   │   │
│   │   ├── Editor/
│   │   │   ├── CodeEditor.tsx          # Monaco editor wrapper
│   │   │   └── DiffView.tsx            # Inline diff display
│   │   │
│   │   └── Layout/
│   │       ├── TitleBar.tsx            # Custom titlebar (draggable)
│   │       ├── StatusBar.tsx           # Bottom: model, credits, cwd
│   │       ├── TabBar.tsx              # Multi-tab management
│   │       └── TrayPanel.tsx           # Expandable tray (help/commands/model)
│   │
│   ├── hooks/                          # ── React Hooks ──
│   │   ├── useTerminal.ts              # PTY lifecycle + xterm binding
│   │   ├── useChat.ts                  # Conversation state + streaming
│   │   ├── useSpotlight.ts             # Visibility, mode, hotkey (⌘K)
│   │   ├── useSlashCommands.ts         # Command registry + filtering
│   │   ├── useContextMenu.ts           # @-menu state + data fetching
│   │   ├── useCodeBlocks.ts            # Keyboard nav between code blocks
│   │   └── useTauriEvents.ts           # Generic Tauri event listener
│   │
│   ├── stores/                         # ── State Management ──
│   │   ├── chatStore.ts                # Zustand: messages, status, model
│   │   ├── terminalStore.ts            # Zustand: sessions, active tab
│   │   └── settingsStore.ts            # Zustand: preferences, API keys
│   │
│   ├── lib/                            # ── Utilities ──
│   │   ├── markdown.ts                 # Parse markdown → segments (text/code)
│   │   ├── tauri.ts                    # Typed invoke() + listen() wrappers
│   │   ├── fuzzy.ts                    # Client-side fuzzy matching
│   │   └── shortcuts.ts               # Global keyboard shortcut registry
│   │
│   └── types/                          # ── TypeScript Types ──
│       ├── index.ts                    # Re-exports
│       ├── chat.ts                     # Message, Exchange, Segment types
│       ├── terminal.ts                 # Block, Session types
│       ├── commands.ts                 # SlashCommand, ContextItem types
│       └── events.ts                   # Tauri event payloads
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 2. Rust — Tipuri și Contracte Principale

### 2.1 AppState (Global Singleton)

```rust
// src-tauri/src/state.rs
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub terminals: Arc<Mutex<HashMap<String, TerminalSession>>>,
    pub conversations: Arc<Mutex<HashMap<String, Conversation>>>,
    pub active_conversation_id: Arc<Mutex<Option<String>>>,
    pub active_terminal_id: Arc<Mutex<Option<String>>>,
    pub settings: Arc<Mutex<Settings>>,
    pub db: Arc<rusqlite::Connection>,
}
```

### 2.2 Terminal Commands

```rust
// src-tauri/src/terminal/mod.rs

#[tauri::command]
async fn terminal_spawn(
    state: State<'_, AppState>,
    shell: Option<String>,   // None = detectează automat
    cwd: Option<String>,
) -> Result<String, String>;  // Returns session_id

#[tauri::command]
async fn terminal_write(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String>;

#[tauri::command]
async fn terminal_resize(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String>;

#[tauri::command]
async fn terminal_kill(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String>;
```

### 2.3 AI Commands

```rust
// src-tauri/src/ai/mod.rs

#[tauri::command]
async fn chat_send(
    app: AppHandle,
    state: State<'_, AppState>,
    conversation_id: Option<String>,  // None = new conversation
    prompt: String,
    context: ExecutionContext,
    attachments: Vec<Attachment>,     // @-context items
) -> Result<String, String>;  // Returns message_id; streaming via events

#[tauri::command]
async fn chat_cancel(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<(), String>;

#[tauri::command]
async fn chat_reset(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<(), String>;

#[tauri::command]
async fn chat_list_conversations(
    state: State<'_, AppState>,
) -> Result<Vec<ConversationSummary>, String>;

#[tauri::command]
fn get_execution_context() -> ExecutionContext;
```

### 2.4 AgentBackend Trait

```rust
// src-tauri/src/ai/providers/mod.rs

#[async_trait]
pub trait AgentBackend: Send + Sync {
    async fn stream_response(
        &self,
        messages: Vec<ChatMessage>,
        config: ModelConfig,
        tx: tokio::sync::mpsc::Sender<StreamEvent>,
    ) -> Result<(), AgentError>;

    fn name(&self) -> &str;
    fn supports_tools(&self) -> bool;
}

pub enum StreamEvent {
    Token(String),
    ToolCall { id: String, name: String, args: serde_json::Value },
    ToolResult { id: String, result: String },
    Done { usage: TokenUsage },
    Error(String),
}

pub struct ModelConfig {
    pub model_id: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub system_prompt: Option<String>,
    pub tools: Vec<ToolDefinition>,
}
```

### 2.5 Spotlight Commands

```rust
// src-tauri/src/spotlight/mod.rs

#[tauri::command]
fn spotlight_get_commands() -> Vec<SlashCommand>;

#[tauri::command]
async fn spotlight_execute_command(
    state: State<'_, AppState>,
    command: String,
    args: Option<String>,
) -> Result<CommandResult, String>;

#[tauri::command]
async fn spotlight_search_context(
    state: State<'_, AppState>,
    category: String,
    query: String,
) -> Result<Vec<ContextItem>, String>;

#[tauri::command]
async fn spotlight_search_files(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<FileItem>, String>;
```

---

## 3. Tauri Events (Rust → React)

```rust
// Event channels — emitted from Rust, consumed in React

// Terminal events
app.emit("terminal:output",  { session_id, data: Vec<u8> });
app.emit("terminal:exit",    { session_id, code: i32 });
app.emit("terminal:block",   { session_id, block: Block });

// AI streaming events
app.emit("chat:token",       { conversation_id, message_id, text });
app.emit("chat:tool_call",   { conversation_id, message_id, tool_call });
app.emit("chat:tool_result", { conversation_id, message_id, result });
app.emit("chat:done",        { conversation_id, message_id, usage });
app.emit("chat:error",       { conversation_id, error });

// Task/Agent events
app.emit("task:status",      { task_id, state: TaskState });
app.emit("task:progress",    { task_id, message });
```

---

## 4. React — Tipuri TypeScript Partajate

```typescript
// src/types/chat.ts

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;                     // Raw markdown
  segments: MarkdownSegment[];         // Parsed
  isError: boolean;
  isStreaming: boolean;
  timestamp: number;
  modelId?: string;
  toolCalls?: ToolCall[];
}

export interface Exchange {
  id: string;
  input: Message;
  output: Message;
  status: 'idle' | 'streaming' | 'done' | 'error' | 'cancelled';
  startTime: number;
  finishTime?: number;
  timeToFirstToken?: number;
}

export interface Conversation {
  id: string;
  title: string;
  exchanges: Exchange[];
  modelId: string;
  createdAt: number;
  updatedAt: number;
}

export type MarkdownSegment =
  | { type: 'text'; content: string; html: string }
  | { type: 'code'; code: string; language: string; id: string };

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
  result?: string;
}

// src/types/terminal.ts

export interface TerminalSession {
  id: string;
  shell: string;
  cwd: string;
  isAlive: boolean;
}

export interface Block {
  id: string;
  command: string;
  output: string;
  exitCode: number;
  startTime: number;
  endTime: number;
}

// src/types/commands.ts

export interface SlashCommand {
  name: string;
  description: string;
  icon: string;
  category: 'conversation' | 'navigation' | 'config' | 'context' | 'export' | 'system';
  requiresArg: boolean;
  argHint?: string;
}

export interface ContextItem {
  id: string;
  label: string;
  detail?: string;
  category: string;
  insertText: string;
}

export type ContextCategory =
  | 'files' | 'code' | 'terminal' | 'history'
  | 'rules' | 'web' | 'conversations' | 'skills';

// src/types/events.ts

export interface ChatTokenEvent {
  conversation_id: string;
  message_id: string;
  text: string;
}

export interface ChatDoneEvent {
  conversation_id: string;
  message_id: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface TerminalOutputEvent {
  session_id: string;
  data: number[];  // Uint8Array
}
```

---

## 5. main.rs — Entry Point

```rust
// src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod state;
mod error;
mod terminal;
mod ai;
mod spotlight;
mod editor;
mod persistence;

use state::AppState;

fn main() {
    let app_state = AppState::init()
        .expect("Failed to initialize AppState");

    tauri::Builder::default()
        .manage(app_state)
        // Terminal commands
        .invoke_handler(tauri::generate_handler![
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            // AI commands
            ai::chat_send,
            ai::chat_cancel,
            ai::chat_reset,
            ai::chat_list_conversations,
            ai::get_execution_context,
            // Spotlight commands
            spotlight::spotlight_get_commands,
            spotlight::spotlight_execute_command,
            spotlight::spotlight_search_context,
            spotlight::spotlight_search_files,
            // Editor commands
            editor::editor_open_file,
            editor::editor_save_file,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Octomus");
}
```

---

## 6. Cargo.toml — Dependențe Complete

```toml
[package]
name = "octomus"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
# Core framework
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }

# IDs & time
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }

# Terminal
portable-pty = "0.8"                 # Cross-platform PTY
vte = "0.13"                         # ANSI parser (Alacritty)

# AI / Networking
reqwest = { version = "0.12", features = ["json", "stream"] }
async-trait = "0.1"
futures = "0.3"
eventsource-stream = "0.2"           # SSE parsing

# Storage
rusqlite = { version = "0.31", features = ["bundled"] }

# Error handling & logging
thiserror = "1"
anyhow = "1"
log = "0.4"
env_logger = "0.11"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

---

## 7. package.json — Dependențe Frontend

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.575.0",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "zustand": "^4.5.0",
    "react-markdown": "^9.0.0",
    "react-syntax-highlighter": "^15.5.0",
    "monaco-editor": "^0.47.0",
    "@monaco-editor/react": "^4.6.0"
  }
}
```

---

## 8. Data Flow Diagrams

### 8.1 Terminal Flow

```
User keystroke
    │
    ▼
SpotlightInput.tsx → detect mode
    │
    ├─ starts with "/" → SlashMenu.tsx
    ├─ starts with "@" → ContextMenu.tsx
    ├─ starts with "!" → Terminal mode
    └─ else             → AI mode
    │
    ▼ (Terminal mode)
invoke("terminal_write", { session_id, data })
    │
    ▼
Rust: pty.write(data)
    │
    ▼
PTY process (bash/zsh)
    │
    ▼
Rust: pty.read() → vte::Parser
    │
    ├─ Normal output → emit("terminal:output", { data })
    └─ OSC 7777      → emit("terminal:block", { block })
    │
    ▼
React: xterm.write(data) + BlockView updates
```

### 8.2 AI Chat Flow

```
User types prompt + Enter
    │
    ▼
SpotlightInput.tsx → validate (non-empty, <1000 chars)
    │
    ▼
invoke("chat_send", { prompt, context, attachments })
    │
    ▼
Rust: build messages[] → provider.stream_response(messages, config, tx)
    │
    ▼
Provider (reqwest SSE) ─┬─ Token     → emit("chat:token", { text })
                        ├─ ToolCall  → execute tool → emit("chat:tool_result")
                        ├─ Done      → emit("chat:done", { usage })
                        └─ Error     → emit("chat:error", { error })
    │
    ▼
React: listen("chat:token") → append to message → re-parse markdown
React: listen("chat:done")  → set status=idle, show PreparedResponses
```

### 8.3 Slash Command Flow

```
User types "/" in input
    │
    ▼
SpotlightInput detects → opens SlashMenu
    │
    ▼
SlashMenu: filter commands by prefix match
    │
    ▼ (user selects /compact)
    │
    ├─ has args? → insert "/compact " in input, wait for Enter
    └─ no args?  → invoke("spotlight_execute_command", "/compact")
         │
         ▼
    Rust: match command → execute action → return result
         │
         ▼
    React: handle result (navigate, reset, open panel, etc.)
```

---

## 9. SQLite Schema

```sql
-- Conversations
CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    model_id    TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Exchanges (message pairs)
CREATE TABLE exchanges (
    id                  TEXT PRIMARY KEY,
    conversation_id     TEXT NOT NULL REFERENCES conversations(id),
    user_content        TEXT NOT NULL,
    assistant_content   TEXT,
    status              TEXT NOT NULL DEFAULT 'idle',
    model_id            TEXT,
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    time_to_first_token INTEGER,
    created_at          TEXT NOT NULL,
    finished_at         TEXT
);

-- Command History
CREATE TABLE command_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    command     TEXT NOT NULL,
    output      TEXT,
    exit_code   INTEGER,
    cwd         TEXT,
    shell       TEXT,
    created_at  TEXT NOT NULL
);

-- Settings
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Context Attachments
CREATE TABLE attachments (
    id              TEXT PRIMARY KEY,
    exchange_id     TEXT NOT NULL REFERENCES exchanges(id),
    category        TEXT NOT NULL,
    label           TEXT NOT NULL,
    content         TEXT
);
```

---

## 10. Keyboard Shortcuts

| Shortcut | Action | Component |
|----------|--------|-----------|
| `⌘K` / `⌘Space` | Toggle Spotlight | Global |
| `Enter` | Submit prompt / Select menu item | SpotlightInput |
| `Shift+Enter` | New line in input | SpotlightInput |
| `Escape` | Close menu / Close spotlight | SpotlightInput |
| `↑` on first row | Open prompt history | SpotlightInput |
| `↑/↓` | Navigate menu items / code blocks | SlashMenu, Transcript |
| `⌘C` | Copy selected code block | CodeBlock |
| `⌘Enter` | Execute code in terminal | CodeBlock |
| `⌘L` | Reset conversation | Global |
| `⌘T` | New tab | Global |
| `⌘W` | Close tab | Global |
| `⌘1-9` | Switch to tab N | Global |

---

## 11. Relația cu Documentele Anterioare

```
06-skeleton.md (ACEST DOCUMENT)
    │
    ├── referă 01-terminal.md       → terminal/ module
    ├── referă 02-agent-sdk.md      → ai/providers/ + ai/tools/
    ├── referă 03-ambient-agents.md → ai/exchange.rs + ai/streaming.rs
    ├── referă 04-chat-window.md    → components/Chat/* + hooks/useChat.ts
    └── referă 05-input-menus.md    → components/Spotlight/* + spotlight/ module
```
