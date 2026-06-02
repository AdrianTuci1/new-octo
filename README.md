# Octomus

> **AI-native terminal & agent orchestrator** — a desktop application that brings together a multi-pane terminal workspace and autonomous AI agents in a single, keyboard-driven interface.

Built with **Tauri v2 (Rust)** + **React 18 + Vite**. The Rust backend owns PTY sessions, AI agent loops, and system-level access; the React frontend renders a modern block-based terminal UI with chat, code editor, and settings drawers.

---

## How the terminal works

Octomus replaces the linear scrollback of traditional terminals with a **block-based model**. Every command — whether typed by you or executed by an agent — becomes a discrete, first-class block that can be copied, inspected, and navigated independently.

### Tabs + multi-purpose panes

```
TAB "Terminal"              TAB "Agent"             TAB "Cloud"
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ pane tree (root) │    │ pane tree (root) │    │ pane tree (root) │
│                  │    │                  │    │                  │
│  ┌─Pane A──────┐ │    │  ┌─Pane D──────┐ │    │  ┌─Pane E──────┐ │
│  │ terminal    │ │    │  │ agent chat  │ │    │  │ ssh cloud   │ │
│  └─────────────┘ │    │  └─────────────┘ │    │  └─────────────┘ │
│  ┌─split horiz─┐ │    └──────────────────┘    └──────────────────┘
│  │┌─Pane B────┐│ │
│  ││ terminal  ││ │
│  │└───────────┘│ │
│  │┌─Pane C────┐│ │
│  ││ agent chat││ │
│  │└───────────┘│ │
│  └─────────────┘ │
└──────────────────┘
```

Each **tab** is a workspace that contains one or more **panes**. Panes are arranged in a binary tree — you can split any pane horizontally or vertically, creating layouts like two terminals side-by-side, or a terminal above an agent chat.

### Pane types — terminal and agent

Every pane runs a **launcher surface** that operates in one of two modes:

| Mode | Composer shows | Input goes to |
|------|---------------|---------------|
| **Terminal** | Shell prompt (`$`) | PTY session (local or cloud SSH) |
| **Agent** | AI prompt | Agent loop (start/continue conversation) |

A pane can switch between modes at any time. When you start an agent conversation in a pane, the composer switches to agent mode and the PTY session stays alive in the background for tool-command execution.

### Pane ↔ session binding

Each pane is bound to a **TerminalSession** (Rust `session.rs`) which owns the PTY master, writer, and child process. The binding is managed by `PaneSessionBinding` — a `paneId → sessionId` map stored per tab. When you split a pane, the new pane gets its own session and binding.

```
        REACT FRONTEND                         RUST BACKEND (TAURI)
┌───────────────────────────┐     ┌───────────────────────────────────────┐
│                           │     │                                       │
│  ┌─── Pane A ──────────┐  │     │  TerminalManager (session registry)   │
│  │  terminal mode      │──┼────►│    │                                  │
│  │  terminal_write()   │  │     │    ├── Session #1: local PTY (zsh)    │
│  │  terminal_run_cmd() │  │     │    │                                  │
│  └─────────────────────┘  │     │    └── Session #2: cloud PTY (ssh)    │
│                           │     │                                       │
│  ┌─── Pane B ──────────┐  │     │  Agent Loop (tool executor)           │
│  │  agent mode         │──┼────►│    │                                  │
│  │  agent_start()      │  │     │    └── tool: run_command ──► Session#2│
│  │  agent_continue()   │  │     │                                       │
│  └─────────────────────┘  │     │                                       │
│                           │     │                                       │
└───────────────────────────┘     └───────────────────────────────────────┘
```

### Command blocks and hooks

When a command runs, the Rust PTY reader intercepts shell hooks (`precmd`/`preexec`) via ANSI escape sequences emitted by the shell integration. This produces **terminal blocks** — structured records containing:

- The command string
- Full output (stdout + stderr)
- Exit code
- Start/finish timestamps and duration
- Working directory at execution time

These blocks are rendered in the React UI as expandable cards (`TerminalBlockCard`, `TerminalBlockSummary`, `TerminalBlockDetail`). Agent tool-call commands produce the same blocks, visible inline in the chat transcript.

### Shell integration

The Rust PTY reader (`ansi.rs` `HookParser`) parses the following hook events from the shell:

| Hook | Purpose |
|------|---------|
| `PreCmd` | Marks command start, captures cwd |
| `PostCmd` | Marks command end, captures exit code |
| `CompletionsStart` / `CompletionsEnd` | Delimits shell completion output |
| `CompletionResult` | Individual tab-completion entry |
| `CompletionUpdateDescription` | Inline help text for completions |

---

## Multi-pane workspace

### Pane layout model

Panes are organized as a binary tree of `leaf` and `split` nodes:

```
WorkspacePaneLayout {
  activePaneId: "pane-3",
  root: {
    type: "split", direction: "horizontal",
    children: [
      { type: "leaf", paneId: "pane-1" },
      {
        type: "split", direction: "vertical",
        children: [
          { type: "leaf", paneId: "pane-2" },
          { type: "leaf", paneId: "pane-3" }  ← active
        ]
      }
    ]
  }
}
```

The `PaneLayout` domain class handles split, remove, normalize, and active-pane tracking. The tree is rendered by `WorkspacePaneTree` which recursively walks the layout and renders `WorkspacePaneSlot` for each leaf.

### Interactions

- **Split horizontally** — splits the active pane left/right
- **Split vertically** — splits the active pane top/bottom
- **Close pane** — removes the pane, collapsing the tree
- **Focus follows mouse** — optional setting that focuses panes on hover
- **Resize** — panes share the available space; resizing is done by adjusting the split ratios (future)

### Tab chrome

Each tab has:
- A **label** (directory name, agent title, or custom)
- An optional **tint color**
- An optional **execution status indicator** (for agent tabs)
- Right-click context menu: close, close others, close to right, move left/right, rename, save as tab config, set tint

Tabs can be **brought into the launcher** (embedded in a pane) or **removed from the launcher** (restored as an independent tab).

---

## AI Agent system

### Agent loop

The agent runtime (`src-tauri/src/ai/agent/`) implements a full autonomous loop:

```
  ┌──────────┐
  │user      │
  │prompt    │
  └────┬─────┘
       ▼
  ┌──────────────────────────────────────────────────────┐
  │                  AGENT LOOP                           │
  │                                                      │
  │  ┌──────────┐    ┌───────────────┐    ┌───────────┐  │
  │  │  LLM     │    │ parse         │    │ dispatch  │  │
  │  │ Provider │───►│ response      │───►│ tool call │  │
  │  │ (OpenAI- │    │               │    │           │  │
  │  │ compat)  │    │ text ──► chat │    │ terminal  │  │
  │  └──────────┘    └───────────────┘    │ file      │  │
  │       ▲                               │ diff      │  │
  │       │                               │ web       │  │
  │       │         ┌───────────┐         │ mcp       │  │
  │       │         │ tool      │◄────────│           │  │
  │       └─────────│ result    │         └───────────┘  │
  │                 └───────────┘                        │
  │                          ▲                          │
  │                          │                          │
  │              ┌───────────┴───────────┐              │
  │              │ execute tool          │              │
  │              └───────────────────────┘              │
  └──────────────────────────────────────────────────────┘
       │
       ▼ (when done)
  ┌──────────┐
  │conversat.│
  │saved     │
  └──────────┘
```

### Tool actions

Agents can invoke these tool categories:

| Tool | Module | Description |
|------|--------|-------------|
| `run_terminal_command` | `terminal/` | Execute shell commands in the pane's PTY session |
| `read_file` / `write_file` | `terminal/fs.rs` | Read/write files on the local filesystem |
| `list_directory` / `search_directory` | `terminal/fs.rs` | Directory listing and recursive search |
| `apply_diff` | `ai/diff/` | Apply unified diffs with validation |
| `web_search` | `ai/web_search.rs` | Search the web for current information |
| `MCP tools` | `ai/mcp/` | Dynamic tools from configured MCP servers |

### Agent run management

The `AgentsView` panel provides a filterable, searchable list of all agent runs with status tracking (active, completed, failed, cancelled), environment grouping, and time-based filtering.

---

## What else the app does

### Sidebar panels

The left sidebar has four sections, toggled via icons:

| Panel | Content |
|-------|---------|
| **Chat** | Active and past conversations, with right-click context menu (delete, fork in new tab/pane) |
| **Files** | File explorer rooted at the active working directory, click to open in editor |
| **Search** | Project-wide search (coming soon) |
| **History** | Command history browser (coming soon) |

### Code editor (Monaco)

The built-in Monaco editor supports:
- Multi-tab file editing
- Syntax highlighting for all major languages
- Diff view for code changes
- Opens from file explorer or agent tool results

### Settings

Full settings UI organized by section:

| Section | What you configure |
|---------|-------------------|
| **Profile** | Display name, avatar, local profile |
| **Account** | Cloud credentials, login state |
| **Agents** | Agent profiles, autonomy level, model selection |
| **Appearance** | Theme, font size, focus-follows-mouse |
| **Code** | Editor settings, language preferences |
| **Cloud Terminals** | SSH hosts, connection methods (ssh-agent / ssh-key) |
| **Keyboard Shortcuts** | View and customize keybindings |
| **Knowledge** | Rules, skills, memory management |
| **MCP Servers** | Configure and manage MCP server connections |
| **3rd-Party CLI Agents** | Claude Code, Codex, and other CLI harness integration |

### Drawers

Slide-out panels from the right edge:

| Drawer | Purpose |
|--------|---------|
| **Editor** | Monaco editor workspace |
| **Model Management** | Configure OpenAI-compatible providers and models |
| **Cloud Profile** | Manage cloud environment connections |
| **Profile Editor** | Edit user profile details |
| **Rules** | View and edit agent rules |
| **Code Review** | Git diff viewer with change review |
| **Keyboard Shortcuts** | Browse and search all keybindings |

### Cloud runtime

- **Cloud terminals** — SSH into remote VMs via ssh-agent or uploaded SSH keys (`src-tauri/src/terminal/transport/cloud.rs`)
- **Cloud agents** — Run agents on remote infrastructure via `octomus-cli` runtime
- **Octomus CLI** — Headless runtime entrypoint (`octomus-cli/`) for remote/CI agent execution
- **Cloud protocol** — Shared types between desktop and remote runtimes (`octomus-cloud-protocol/`)

### Git integration

- Real-time git diff summary in the topbar (additions/deletions count)
- `terminal_get_worktree_diff` command for full diff inspection
- Code Review drawer for detailed change review
- Branch-aware context for agent conversations

### Tab configs

Save and restore workspace layouts as TOML files under `~/.octomus/tab_configs/`:
- `startup_config.toml` — loaded automatically on app launch
- Custom configs — launch pre-arranged tab/pane setups with `New worktree config`
- Create/update configs from the `+` menu in the topbar

### Local-first persistence

Everything lives under `~/.octomus/` (overridable via `OCTOMUS_HOME`):

```
~/.octomus/
├── .mcp.json              # MCP server config
├── ai-provider.json       # LLM provider settings
├── keybindings.yaml       # Custom keyboard shortcuts
├── settings.toml          # App settings
├── skills/                # User-installed skills
└── tab_configs/           # Saved workspace layouts
```

### Keyboard-first design

- Global shortcut to summon/hide the launcher
- Tab navigation, pane splitting, and mode switching via keyboard
- Full keybinding catalog (`src-tauri/src/keybindings.rs`) exposed in settings
- Customizable via `keybindings.yaml`

### MCP (Model Context Protocol) support

- Configure MCP servers via settings UI or `~/.octomus/.mcp.json`
- Runtime tools dynamically exposed to agents
- Compatible with the standard MCP JSON config format

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                     │
│                                                         │
│  ┌──────────────────┐     ┌──────────────────────────┐  │
│  │   React Frontend  │     │      Rust Backend         │  │
│  │                   │     │                          │  │
│  │  • Workspace UI   │◄───►│  • Terminal (PTY/Sessions)│  │
│  │  • Chat/Composer  │invoke│  • AI Agent Loop         │  │
│  │  • Monaco Editor  │events│  • MCP Runtime           │  │
│  │  • Settings UI    │     │  • Memory/Persistence     │  │
│  │  • Zustand stores │     │  • Shell Signatures       │  │
│  │                   │     │  • Cloud Runtime          │  │
│  └──────────────────┘     └──────────────────────────┘  │
│                                                         │
│  Cargo workspace: src-tauri | octomus-cli | cloud-proto │
└─────────────────────────────────────────────────────────┘
```

| Layer | Stack |
|-------|-------|
| Desktop shell | Tauri v2 |
| Backend language | Rust |
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| State management | Zustand |
| Code editor | Monaco Editor |
| Terminal PTY | portable-pty (cross-platform) |
| ANSI parsing | Custom HookParser (shell hook interception) |
| Markdown rendering | react-markdown + remark-gfm |

---

## Documentation

- [Architecture index](docs/architecture/00-index.md) — master reference and implementation status
- [Terminal architecture](docs/architecture/01-terminal.md) — block system, PTY, session lifecycle
- [Agent SDK & harness](docs/architecture/02-agent-sdk-harness.md) — CLI harnesses, AgentDriver, MCP lifecycle
- [Ambient agents](docs/architecture/03-ambient-agents.md) — task FSM, spawn/poll, scheduled agents
- [Chat window](docs/architecture/04-chat-window.md) — transcript, markdown, code blocks, tool calls
- [Input & menus](docs/architecture/05-input-and-menus.md) — slash commands, context mentions, fuzzy matching
- [Architectural skeleton](docs/architecture/06-skeleton.md) — full project structure, data flows
- [Search & autodetect](docs/architecture/07-search-autodetect.md) — command search, NLD autodetection
- [Sessions & Cloud vs Local](docs/architecture/08-sessions-cloud-local.md) — session types, harness dispatch
- [Settings & sharing](docs/architecture/09-settings-sharing-telemetry.md) — settings sync, telemetry
- [Settings UI](docs/architecture/10-settings-ui-menus.md) — umbrella navigation, dynamic widgets
- [Chain of Thought](docs/01_chain_of_thought.md)
- [Tool Call Lifecycle](docs/02_tool_call_lifecycle.md)
- [Conversation Model](docs/03_conversation_exchange_model.md)
- [MCP Integration](docs/05_mcp_integration.md)
- [Autonomous Loop](docs/06_autonomous_agent_loop.md)
- [Predict & Tips](docs/07_predict_and_tips.md)
- [Runtime & Release Plan](docs/08_runtime_and_release_plan.md)

---

## Development

### Setup

```bash
npm install
cp .env.example .env   # configure your AI provider
npm run dev:app
```

### Prerequisites

- Rust toolchain (cargo & rustc)
- Node.js v18+

### Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:app` | Run the application in dev mode |
| `npm run test` | Run JS and Rust test suites |
| `npm run test:rust` | Run Rust unit tests only |
| `npm run test:agent-evals` | Run agent evaluation scenarios |
| `npm run test:agent-evals:live` | Run live model-backed evals (requires `tests.env`) |
| `npm run logs` | Tail development logs |
| `npm run tauri -- dev` | Raw Tauri dev command |
| `npm run release:cli` | Build `octomus-cli` archives |
| `npm run release:desktop` | Build desktop bundles for current OS |
| `npm run release:dmg` | Build macOS `.dmg` |
| `npm run release:exe` | Build Windows `.exe` |
| `npm run release:aws` | Build all platforms via AWS CodeBuild |

### Release artifacts

- CLI archives: `artifacts/cli/octomus-cli-<version>-<target>.tar.gz`
- Desktop bundles: `artifacts/desktop/<platform>-<version>/`
- macOS: `.dmg` (requires Finder Automation permission)
- Windows: `.exe`, `.msi`
- Linux: `.AppImage`, `.deb`

---

## License

The author disclaims copyright to this source code. In place of a legal notice, here is a blessing:

> *"Everything around you that you call life was made up by people that were no smarter than you. And you can change it, you can influence it... Once you learn that, you'll never be the same again."*

---

Developed by StaticLabs.
