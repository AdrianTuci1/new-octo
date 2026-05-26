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

## Octomus Current Architecture

```
launcher-rs-react/
├── Cargo.toml                    # Cargo workspace: desktop, CLI, cloud protocol
├── octomus-cli/                  # Headless Octomus runtime entrypoint
├── octomus-cloud-protocol/       # Shared cloud runtime protocol types
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json           # productName: Octomus
│   ├── resources/skills/         # Bundled Octomus skills
│   ├── src/
│   │   ├── main.rs               # Tauri entry, windows, tray, menus, command registry
│   │   ├── lib.rs                # Backend module exports
│   │   ├── octomus_paths.rs      # ~/.octomus layout and bundled skill discovery
│   │   ├── ai/                   # Agent loop, OpenAI-compatible harness, MCP, diff, prediction
│   │   ├── terminal/             # PTY/session manager, blocks, FS, git, completions
│   │   ├── memory/               # Local-first persistence and sync queue
│   │   ├── menus/                # Native app/menu/tray definitions
│   │   ├── shell_signatures/     # Shell command signature lookup and parsing
│   │   ├── cloud_runtime.rs      # Remote/cloud runtime launch orchestration
│   │   ├── code_index.rs         # Project indexing and search
│   │   ├── keybindings.rs        # Backend shortcut catalog and menu dispatch
│   │   ├── secure_store.rs       # Secret storage bridge
│   │   └── app_updates/          # Update state and install commands
│
├── src/                          # React frontend
│   ├── App.tsx                   # Top-level app composition
│   ├── main.tsx                  # Entry
│   ├── styles.css                # Design tokens and global styles
│   ├── components/
│   │   ├── App/                  # App shell, workspace chrome, settings, drawers
│   │   ├── Chat/                 # Transcript, message bubbles, tool/result blocks
│   │   ├── Composer/             # Prompt/terminal composer, context menu, model setup
│   │   ├── Editor/               # Monaco editor workspace and diff UI
│   │   ├── Layout/Launcher/      # Main Octomus surface and orchestration hooks
│   │   ├── Onboarding/           # First-run setup UI
│   │   └── Tray/                 # Tray panels for history, commands, models, help
│   ├── hooks/
│   │   ├── useChat/              # Chat lifecycle, bridge, tool-call dispatch
│   │   ├── useWorkingDirectory.ts
│   │   ├── useTerminalRuntimeContext.ts
│   │   ├── useComposerIntelligence.ts
│   │   ├── useGitContext.ts
│   │   └── useLauncherAppState.ts
│   ├── stores/                   # Zustand stores: chat, editor, launcher, memory, UI
│   ├── lib/                      # Frontend service adapters and helpers
│   └── types/
│       ├── chat.ts
│       ├── terminal.ts
│       ├── memory.ts
│       ├── filesystem.ts
│       └── index.ts
│
├── scripts/                      # Dev and release scripts
├── assets/                       # Logos and UI/MCP/file-type SVG assets
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Key Design Decisions

### 1. Terminal: Rust PTY + React Blocks

Octomus keeps terminal process ownership in Rust and presents terminal output through React components. The backend owns PTY/session lifecycle, runtime context, command history, filesystem helpers, git context, and command prediction.

```
React Composer/Chat Blocks ←→ Tauri commands/events ←→ Rust terminal manager ←→ PTY
```

### 2. Block System: Interceptor Pattern

Command boundaries are represented as terminal blocks. The current backend pieces live under `src-tauri/src/terminal/`:

```
ansi.rs, block.rs, events.rs, manager.rs, pty.rs, requests.rs, session.rs
```

The frontend renders summaries/details in `src/components/Chat/blocks/TerminalBlock*.tsx` and orchestrates terminal composer state through `src/components/Composer/`.

### 3. AI: Octomus Agent Harness

The Octomus agent runtime is implemented in `src-tauri/src/ai/agent/` with an OpenAI-compatible provider, scripted planning helpers, lifecycle contracts, tool actions, continuation handling, and run management.

```
React useChat bridge → ai::agent_start / agent_continue → AgentHarnessManager → agent loop → events + memory persistence
```

MCP support is in `src-tauri/src/ai/mcp/`; web search, diff application, command prediction, and composer intelligence are separate AI submodules.

### 4. Local-First Filesystem

```
~/.octomus/
├── .mcp.json
├── ai-provider.json
├── keybindings.yaml
├── settings.toml
├── skills/
└── tab_configs/
    ├── startup_config.toml
    └── my_tab_config.toml
```

The root can be overridden with `OCTOMUS_HOME`. Bundled skills are discovered from `OCTOMUS_BUNDLED_SKILLS_DIR`, `src-tauri/resources/skills/`, or packaged `resources/skills/`.

---

## Current Rust Workspace

```toml
[workspace]
members = ["src-tauri", "octomus-cli", "octomus-cloud-protocol"]
resolver = "2"
```

The packaged app name is `Octomus` (`src-tauri/tauri.conf.json`), while the Rust desktop crate and binary are still named `octomus_launcher_prototype` for compatibility with the current prototype bundle.

---

## Implementation Status Map

| Area | Current files |
|------|---------------|
| Terminal/session runtime | `src-tauri/src/terminal/*`, `src/hooks/useTerminalRuntimeContext.ts`, `src/hooks/useTerminalCommandBlocks.ts` |
| AI agent loop | `src-tauri/src/ai/agent/*`, `src/hooks/useChat/*`, `src/components/Chat/*` |
| MCP | `src-tauri/src/ai/mcp/*`, `src/components/App/settings/sections/MCPServersSection.tsx` |
| Local memory | `src-tauri/src/memory/*`, `src/lib/octomusMemory.ts`, `src/stores/memoryStore.ts` |
| Settings and menus | `src-tauri/src/menus/*`, `src-tauri/src/keybindings.rs`, `src/components/App/settings/*` |
| Editor/workspace chrome | `src/components/Editor/*`, `src/components/App/chrome/*`, `src/stores/editorStore.ts` |
| Cloud/runtime | `src-tauri/src/cloud_runtime.rs`, `src-tauri/src/terminal/transport/*`, `octomus-cli/`, `octomus-cloud-protocol/` |
