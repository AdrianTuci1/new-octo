# Octomus Architecture — Master Reference

> Documentație consolidată extrasă din Warp codebase (Rust, ~3M bytes analizate).
> Stack: **Tauri v2 + Rust backend + React frontend**.

---

## Cuprins

| # | Document | Descriere | Sursa Warp |
|---|----------|-----------|-----------|
| 01 | [Terminal](./01-terminal.md) | Emulator complet: block system, grid, PTY, SSH, session sharing | `terminal/` (~2.5M bytes) |
| 02 | [Agent SDK & Harness](./02-agent-sdk-harness.md) | CLI `oz`, 5 harnașe, AgentDriver, MCP lifecycle, config merge | `ai/agent_sdk/` (~500K bytes) |
| 03 | [Ambient Agents](./03-ambient-agents.md) | Task FSM (8 stări), spawn+poll, scheduled agents, conversations | `ai/ambient_agents/` (~55K bytes) |
| 04 | [Chat Window & Features](./04-chat-window.md) | Panel UI, transcript, markdown pipeline, code block actions, agent tool calls, recommended features | `ai_assistant/` (~130K bytes) + `ai/agent/` (~105K bytes) |
| 05 | [Input & Menus](./05-input-and-menus.md) | Editor input, slash commands (`/`), context menu (`@`), fuzzy matching, availability system | `slash_command_menu/` (~44K) + `ai_context_menu/` (~70K) |
| 06 | [Schelet Arhitectural](./06-skeleton.md) | Structura completă: directoare, Tauri commands, events, tipuri TS, SQLite schema, data flows | Sinteză din 01–05 + codul existent |
| 07 | [Search & Autodetect](./07-search-autodetect.md) | SearchMixer, QueryFilter (25 filtre), Command Search, NLD autodetection algorithm | `search/` (~160K) + `ai/blocklist/input_model.rs` (~33K) |
| 08 | [Sessions & Cloud vs Local](./08-sessions-cloud-local.md) | Session lifecycle, SessionType, CommandExecutor, HarnessKind, ThirdPartyHarness, Cloud vs Local agents | `terminal/model/session.rs` (~65K) + `ai/agent_sdk/` (~63K) + harness (~17K) |
| 09 | [Settings, Sharing & Telemetry](./09-settings-sharing-telemetry.md) | Settings sync (hash-based), Real-time session sharing (PresenceManager), Telemetry batching & redaction, GitHub integrations | `settings/` (~600K) + `terminal/shared_session/` (~80K) + `server/telemetry/` (~1.2M) |
| 10 | [Settings UI & Menus](./10-settings-ui-menus.md) | Sidebar navigation, Umbrellas, Dynamic widgets (Dropdown/Slider/Toggle), Settings Search | `settings_view/` (~2.4M) |

---

## Warp Module Map

```
warp/app/src/
├── terminal/                     # 01-terminal.md
│   ├── mod.rs                    # Entry: SizeInfo, BlockPadding
│   ├── model/terminal_model.rs   # TerminalModel (3651 linii)
│   ├── view.rs                   # Rendering (1.1M bytes)
│   ├── input.rs                  # Input handling (618K bytes)
│   ├── shared_session/           # Real-time sharing
│   └── ...80+ more files
│
├── ai/
│   ├── agent_sdk/                # 02-agent-sdk-harness.md
│   │   ├── mod.rs                # CLI entry (1512 linii)
│   │   ├── driver.rs             # AgentDriver (2387 linii)
│   │   ├── driver/harness/       # Harness implementations
│   │   ├── harness_support.rs    # Harness bridge CLI
│   │   └── ...20+ more files
│   │
│   ├── ambient_agents/           # 03-ambient-agents.md
│   │   ├── task.rs               # AmbientAgentTask (510 linii)
│   │   ├── spawn.rs              # Spawn + poll (177 linii)
│   │   └── scheduled.rs          # Cron agents (471 linii)
│   │
│   ├── agent/conversation.rs     # AIConversation (3742 linii) — shared core
│   ├── ai_assistant/panel.rs     # AI panel UI
│   ├── ai_assistant/transcript.rs # Markdown rendering
│   └── ai_assistant/requests.rs  # Request lifecycle
│
└── ...other modules
```

---

## Octomus Target Architecture

```
octomus/launcher-rs-react/
├── src-tauri/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs               # Tauri entry + commands
│   │   ├── terminal/             # Terminal engine
│   │   │   ├── mod.rs            # Module entry
│   │   │   ├── model.rs          # TerminalState
│   │   │   ├── pty.rs            # PTY management (portable-pty)
│   │   │   ├── ansi.rs           # ANSI parsing (vte crate)
│   │   │   ├── grid.rs           # Cell grid
│   │   │   ├── block.rs          # Block system
│   │   │   ├── session.rs        # Session lifecycle
│   │   │   ├── size.rs           # Dimensions
│   │   │   └── history.rs        # Command history
│   │   ├── ai/                   # AI engine
│   │   │   ├── mod.rs
│   │   │   ├── config.rs         # AgentConfig
│   │   │   ├── driver.rs         # AgentDriver (simplified)
│   │   │   ├── harness.rs        # AgentBackend trait
│   │   │   ├── task.rs           # Task + TaskState FSM
│   │   │   ├── runner.rs         # Background task runner
│   │   │   ├── conversation.rs   # Conversation model
│   │   │   └── providers/
│   │   │       ├── openai.rs
│   │   │       ├── anthropic.rs
│   │   │       └── gemini.rs
│   │   ├── editor/               # Code editor backend
│   │   │   ├── mod.rs
│   │   │   ├── buffer.rs         # Text buffer
│   │   │   └── lsp.rs            # Language Server Protocol
│   │   └── spotlight/            # Spotlight launcher logic
│   │       ├── mod.rs
│   │       ├── commands.rs       # Built-in commands
│   │       └── fuzzy.rs          # Fuzzy matching
│   └── tauri.conf.json
│
├── src/                          # React frontend
│   ├── App.tsx                   # Main app
│   ├── main.tsx                  # Entry
│   ├── styles.css
│   ├── components/
│   │   ├── Spotlight.tsx         # Spotlight input overlay
│   │   ├── Terminal.tsx          # Terminal renderer (xterm.js)
│   │   ├── BlockView.tsx         # Block-based output
│   │   ├── Transcript.tsx        # AI chat transcript
│   │   ├── CodeEditor.tsx        # Monaco editor wrapper
│   │   └── StatusBar.tsx         # Bottom bar (task status, etc.)
│   ├── hooks/
│   │   ├── useTerminal.ts        # Terminal state hook
│   │   ├── useTaskEvents.ts      # AI task events hook
│   │   └── useSpotlight.ts       # Spotlight visibility hook
│   └── types/
│       └── index.ts              # Shared TypeScript types
│
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Key Design Decisions

### 1. Terminal: xterm.js vs Custom

**Decision: Use xterm.js** for the terminal renderer in React, backed by Rust PTY.

| Approach | Pro | Con |
|----------|-----|-----|
| xterm.js | Mature, fast, proven | Less control over rendering |
| Custom renderer | Full control (like Warp) | 2+ years of work |
| Alacritty-like | GPU-accelerated | Can't embed in webview |

**Flow:**
```
React (xterm.js) ←→ Tauri Events ←→ Rust (portable-pty)
     render            IPC             PTY read/write
```

### 2. Block System: Interceptor Pattern

Like Warp, detect command boundaries via shell hooks:

```bash
# In user's shell RC file:
precmd() { printf '\e]7777;precmd\a' }
preexec() { printf '\e]7777;preexec;%s\a' "$1" }
```

Rust ANSI parser intercepts these → creates Block boundaries.

### 3. AI: API-Direct (No CLI Harness)

Unlike Warp (which wraps CLI tools like Claude Code), Octomus calls LLM APIs directly:

```
Warp:     AgentDriver → HarnessRunner → Claude CLI → Anthropic API
Octomus:  AgentDriver → AgentBackend → reqwest → Anthropic API (direct)
```

### 4. Spotlight: Dual Mode

```
┌───────────────────────────────────────┐
│  ⌘K / ⌘Space  →  Spotlight Opens     │
│                                       │
│  Mode 1: Terminal Command             │
│  $ git status                         │
│  (Executed in PTY, output in block)   │
│                                       │
│  Mode 2: AI Query                     │
│  > Fix the login bug in auth.rs       │
│  (Sent to LLM, response in transcript)│
│                                       │
│  Mode 3: Quick Action                 │
│  :open settings                       │
│  (Built-in command, no LLM)           │
└───────────────────────────────────────┘
```

---

## Recommended Crates

```toml
[dependencies]
# Core
tauri = { version = "2.0.0", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }

# Terminal
portable-pty = "0.8"            # Cross-platform PTY
vte = "0.13"                    # ANSI parser (Alacritty's)

# AI
reqwest = { version = "0.12", features = ["json", "stream"] }
async-stream = "0.3"            # Stream utilities
futures = "0.3"

# Storage
rusqlite = { version = "0.31", features = ["bundled"] }

# Logging
log = "0.4"
env_logger = "0.11"
```

---

## Implementation Phases

### Phase 1: Terminal Foundation
- [ ] PTY spawn + read/write in Rust
- [ ] ANSI parsing with `vte`
- [ ] xterm.js integration in React
- [ ] Basic I/O: type → PTY → output → xterm.js
- [ ] Window management (spotlight overlay)

### Phase 2: Block System
- [ ] Shell hook injection (precmd/preexec)
- [ ] Block detection in ANSI parser
- [ ] Block rendering in React
- [ ] Command history (SQLite)
- [ ] Block selection/copy

### Phase 3: AI Integration
- [ ] AgentBackend trait + OpenAI provider
- [ ] Spotlight dual-mode (terminal vs AI)
- [ ] Streaming responses
- [ ] Markdown rendering for AI responses
- [ ] Code block extraction + "Run" action

### Phase 4: Code Editor
- [ ] Monaco editor integration
- [ ] File open/save via Tauri FS
- [ ] LSP client in Rust
- [ ] AI-assisted editing (inline suggestions)

### Phase 5: Advanced
- [ ] MCP server support
- [ ] Task runner (background agents)
- [ ] Conversation persistence (SQLite)
- [ ] Scheduled tasks
- [ ] Multi-tab / multi-pane
