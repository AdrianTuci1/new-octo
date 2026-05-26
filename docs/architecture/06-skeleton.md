# Octomus — Schelet Arhitectural

> Structura curentă a repo-ului și contractele principale.
> Stack: **Tauri v2 + Rust backend + React 18 + Vite frontend**.

---

## 1. Structura Actuală a Proiectului

Numele aplicației afișat utilizatorului este **Octomus** (`productName` în `src-tauri/tauri.conf.json`). Numele folderului local al repo-ului poate rămâne `launcher-rs-react`, dar documentația și UI-ul trebuie să trateze produsul ca Octomus.

```
launcher-rs-react/
├── Cargo.toml                         # workspace: src-tauri, octomus-cli, octomus-cloud-protocol
├── package.json                       # Vite/React scripts and frontend deps
├── vite.config.ts
├── tsconfig.json
├── scripts/                           # dev/release helpers
├── assets/                            # logos, MCP icons, SVG/file-type assets
│
├── octomus-cli/                       # headless Octomus runtime entrypoint
├── octomus-cloud-protocol/            # shared types for cloud runtime contracts
│
├── src-tauri/                         # Rust desktop backend
│   ├── Cargo.toml                     # desktop crate: octomus_launcher_prototype
│   ├── tauri.conf.json                # productName: Octomus
│   ├── capabilities/default.json
│   ├── icons/
│   ├── resources/skills/              # bundled Octomus skills
│   └── src/
│       ├── main.rs                    # Tauri app setup, windows, tray, menus, commands
│       ├── lib.rs                     # module exports
│       ├── octomus_paths.rs           # ~/.octomus layout and skill discovery
│       ├── cloud_runtime.rs           # remote runtime command/run orchestration
│       ├── code_index.rs              # project indexing and search
│       ├── keybindings.rs             # shortcut definitions and native menu bridge
│       ├── secure_store.rs            # OS-backed secret storage
│       ├── app_updates/               # update state/check/install/restart commands
│       ├── menus/                     # app, edit, file, view, tab, blocks, AI menus
│       ├── memory/                    # local-first settings, conversations, cloud objects, sync
│       ├── terminal/                  # PTY sessions, blocks, filesystem, git, predictions
│       ├── shell_signatures/          # command signature parser/registry/lookup
│       └── ai/                        # agent loop, MCP, diff, web search, prediction
│           ├── agent/                 # Octomus agent contract, harness, actions, OpenAI provider
│           ├── agent_management/      # manager and retry helpers
│           ├── diff/                  # apply/validate file diffs
│           ├── mcp/                   # MCP server config and runtime tools
│           └── predict/               # composer and terminal command prediction
│
└── src/                               # React frontend
    ├── main.tsx
    ├── App.tsx
    ├── App.css
    ├── styles.css
    ├── components/
    │   ├── App/                       # app shell, workspace chrome, settings, drawers
    │   ├── Chat/                      # transcript, messages, code diffs, tool-result blocks
    │   ├── Composer/                  # prompt/terminal composer and context menus
    │   ├── Editor/                    # Monaco editor workspace
    │   ├── Layout/Launcher/           # main Octomus surface orchestration
    │   ├── Onboarding/
    │   └── Tray/
    ├── hooks/
    │   ├── useChat/                   # chat state/effects/actions and tool dispatch
    │   ├── useWorkingDirectory.ts
    │   ├── useTerminalRuntimeContext.ts
    │   ├── useComposerIntelligence.ts
    │   ├── useGitContext.ts
    │   ├── useKeybindingCatalog.ts
    │   └── useLauncherAppState.ts
    ├── lib/                           # frontend service adapters and helpers
    ├── stores/                        # Zustand: chat, editor, launcher, memory, UI
    └── types/                         # shared TS contracts
```

---

## 2. Runtime Filesystem

Octomus creează și menține layout-ul local în `src-tauri/src/octomus_paths.rs`.

```
~/.octomus/
├── .mcp.json                         # MCP config, compatible with mcpServers JSON
├── ai-provider.json                   # OpenAI-compatible provider settings
├── keybindings.yaml
├── settings.toml
├── skills/                            # user-installed/custom skills
└── tab_configs/
    ├── startup_config.toml
    └── my_tab_config.toml
```

Variabile relevante:

| Env var | Rol |
|---------|-----|
| `OCTOMUS_HOME` | Suprascrie root-ul local, implicit `~/.octomus` |
| `OCTOMUS_BUNDLED_SKILLS_DIR` | Adaugă o sursă explicită pentru skill-urile bundled |

Skill-urile bundled sunt căutate în ordine în override-ul de env, `src-tauri/resources/skills/`, `resources/skills/`, apoi în directorul `resources/skills/` asociat crate-ului Tauri.

---

## 3. Backend Modules

### 3.1 App Entry

`src-tauri/src/main.rs` este punctul de compunere:

- pornește `shell_signatures::warm_up()`;
- înregistrează managerii Tauri: updates, cloud runtime, code index, terminal, agent harness, composer intelligence, memory;
- configurează meniurile native, tray-ul, shortcut-ul global și ferestrele `main`, `settings`, `onboarding`;
- expune comenzile Tauri printr-un singur `invoke_handler`.

### 3.2 Commands Expuse

| Domeniu | Comenzi principale |
|---------|--------------------|
| Updates | `app_updates_get_state`, `app_updates_check`, `app_updates_install`, `app_updates_restart` |
| Cloud runtime | `cloud_runtime_build_launch_command`, `cloud_runtime_start_run`, `cloud_runtime_cancel_run` |
| Code index | `code_index_list_projects`, `code_index_index_project`, `code_index_remove_project`, `code_index_search` |
| Agent | `agent_start`, `agent_continue`, `agent_cancel`, `agent_get_run`, `agent_list_runs`, `agent_list_skills`, `agent_get_loop_contract` |
| Provider config | `agent_configure_openai_compatible`, `agent_clear_openai_compatible`, `agent_provider_status` |
| MCP | `mcp_list_servers`, `mcp_list_runtime_tools`, `mcp_upsert_server`, `mcp_remove_server` |
| AI helpers | `web_search`, `ai_predict_command_smart`, `apply_file_diff` |
| Terminal | `terminal_create_session`, `terminal_write`, `terminal_run_command`, `terminal_resize`, `terminal_kill_session`, `terminal_get_blocks` |
| Context | `terminal_get_path_context`, `terminal_get_runtime_context`, `terminal_get_git_context`, `terminal_get_worktree_diff` |
| Filesystem | `terminal_list_directory_entries`, `terminal_search_directory_entries`, `terminal_read_file`, `terminal_write_file` |
| Intelligence | `terminal_list_commands`, `terminal_get_recent_history`, `terminal_get_prediction`, `terminal_get_composer_intelligence` |
| Memory | `memory_bootstrap`, settings/workspace/conversation/cloud object CRUD, sync queue, `memory_sync_once` |
| App shell | `octomus_list_tab_configs`, `keybindings_list_definitions`, secure-store commands, onboarding/window helpers |

### 3.3 Agent Runtime

```
src-tauri/src/ai/
├── mod.rs                         # Tauri command façade
├── web_search.rs
├── agent/
│   ├── mod.rs                     # run model and manager-facing exports
│   ├── commands.rs                # start/continue/cancel/get/list commands
│   ├── harness.rs                 # agent harness execution
│   ├── actions.rs                 # tool action types and lifecycle
│   ├── conversation.rs            # conversation/run state
│   ├── continuation.rs
│   ├── decision.rs
│   ├── types.rs
│   ├── loop_contract.*            # JSON/Rust/Markdown contract
│   ├── openai/                    # OpenAI-compatible provider internals
│   └── scripted/                  # planning helpers
├── mcp/
├── diff/
└── predict/
```

Frontend-ul consumă acest runtime prin `src/hooks/useChat/`, `src/components/Chat/`, `src/components/Composer/` și `src/stores/chatStore.ts`.

### 3.4 Terminal Runtime

```
src-tauri/src/terminal/
├── mod.rs                         # Tauri command façade
├── manager.rs                     # session registry
├── session.rs                     # session model
├── pty.rs                         # PTY spawn/read/write
├── ansi.rs                        # ANSI handling
├── block.rs                       # terminal command blocks
├── events.rs                      # event payloads
├── requests.rs                    # command request types
├── fs.rs                          # directory listing/search/read/write
├── git.rs                         # branch and worktree context
├── intelligence.rs                # history/prediction context
├── completions.rs
└── transport/
    ├── local.rs
    └── cloud.rs
```

Pe frontend, terminalul apare ca blocuri de chat și composer state, nu ca un modul separat `components/Terminal/`. Componentele relevante sunt `TerminalComposer`, `TerminalBlockCard`, `TerminalBlockSummary` și `TerminalBlockDetail`.

### 3.5 Memory Runtime

```
src-tauri/src/memory/
├── mod.rs                         # Tauri command façade
├── paths.rs                       # manager/root resolution
├── storage.rs                     # atomic JSON storage helpers
├── types.rs                       # shared Rust payloads
├── conversations.rs
├── execution_plans.rs
├── cloud.rs
└── sync.rs
```

Frontend bridge-ul este `src/lib/octomusMemory.ts`, iar store-ul singleton este `src/stores/memoryStore.ts`.

---

## 4. Frontend Modules

| Zonă | Fișiere |
|------|---------|
| App shell | `src/components/App/AppWindow.tsx`, `src/components/App/chrome/*`, `src/components/App/drawers/*` |
| Settings | `src/components/App/settings/*`, `src/components/App/settings/sections/*`, `src/components/App/settings/menus/*` |
| Chat | `src/components/Chat/*`, `src/components/Chat/blocks/*`, `src/hooks/useChat/*` |
| Composer | `src/components/Composer/*`, `src/hooks/useComposerIntelligence.ts`, `src/hooks/useModelSelection.ts` |
| Editor | `src/components/Editor/*`, `src/stores/editorStore.ts` |
| Main surface | `src/components/Layout/Launcher/*`, `src/hooks/useLauncherAppState.ts`, `src/stores/launcherStore.ts` |
| Tray | `src/components/Tray/*`, `src/hooks/useTray.ts` |
| Runtime context | `src/hooks/useWorkingDirectory.ts`, `src/hooks/useTerminalRuntimeContext.ts`, `src/hooks/useGitContext.ts` |

Tipurile partajate trăiesc în `src/types/`: `chat`, `terminal`, `memory`, `filesystem`, `git`, `history`, `model`, `skills`, `ui`, `keybindings`, `codeIndex`.

---

## 5. Flow-uri de Date

### 5.1 Chat și Agent

```
ComposerBar / TerminalComposer
    │
    ▼
useChat actions + bridge
    │
    ▼
invoke("agent_start" / "agent_continue")
    │
    ▼
AgentHarnessManager → src-tauri/src/ai/agent/*
    │
    ├─ tool actions: terminal, file, diff, web, MCP
    ├─ events: streamed back to React
    └─ memory: persisted through memory commands/store
```

### 5.2 Terminal Command

```
Composer or agent tool call
    │
    ▼
invoke("terminal_run_command" / "terminal_write")
    │
    ▼
TerminalManager → PTY/session
    │
    ├─ block events
    ├─ runtime context/history
    └─ git/filesystem helpers
    │
    ▼
Chat terminal blocks + memory snapshots
```

### 5.3 Settings and Files

```
Settings UI / commands
    │
    ├─ memory_* commands → local-first state under ~/.octomus
    ├─ octomus_list_tab_configs → ~/.octomus/tab_configs/*.toml
    ├─ mcp_* commands → ~/.octomus/.mcp.json
    └─ secure_store commands → OS secret store
```

---

## 6. Package and Naming

| Layer | Current name |
|-------|--------------|
| User-facing app | `Octomus` |
| Tauri `productName` | `Octomus` |
| Tauri identifier | `com.octomus.launcher.prototype` |
| Tauri main binary | `octomus_launcher_prototype` |
| Rust desktop crate | `octomus_launcher_prototype` |
| Frontend package | `octomus-launcher-rs-react` |
| CLI crate | `octomus-cli` |

Documentația publică și textele din produs trebuie să folosească **Octomus**. Numele care conțin `launcher` sunt nume istorice de repo/crate/binary sau nume de module UI existente.

---

## 7. Relația cu Documentele Anterioare

```
00-index.md
    └── harta de ansamblu și statusul curent

01-terminal.md
    └── detalii terminal/session/block runtime

02-agent-sdk-harness.md, 03-ambient-agents.md, 04-chat-window.md
    └── referințe Warp + adaptarea agentului Octomus

05-input-and-menus.md, 10-settings-ui-menus.md
    └── composer, meniuri, settings și interacțiuni UI

08-sessions-cloud-local.md
    └── local/cloud runtime, octomus-cli și protocolul cloud

internal_memory_management.md
    └── layout-ul persistent din ~/.octomus și local-first memory layer
```
