# Terminal Architecture — Warp Reference & Octomus Adaptation

> Reverse-engineered din Warp codebase (~2.5M bytes, 80+ module Rust).
> Adaptat pentru Octomus: Tauri v2 + Rust backend + React frontend.

---

## 1. Warp Terminal — Structura

Warp implementează un **emulator de terminal complet** pe un framework UI proprietar (`warpui`). Structura relevantă:

```
warp/app/src/terminal/
├── mod.rs                    # Entry (499 linii) — SizeInfo, BlockPadding, constants
├── model/
│   ├── terminal_model.rs     # CORE: 3651 linii — TerminalModel struct
│   ├── blocks/               # Block system (prompt+command → output)
│   ├── session.rs            # Session lifecycle
│   ├── ansi.rs               # ANSI escape sequence handler
│   ├── grid/                 # Grid rendering (cells, rows, columns)
│   ├── completions.rs        # Shell completions
│   ├── selection.rs          # Text selection
│   ├── secrets.rs            # Secret obfuscation
│   └── kitty.rs / iterm_image.rs  # Image protocols
├── view.rs                   # UI rendering — 1.1M bytes (!)
├── input.rs                  # Input handling — 618K bytes (!)
├── cli_agent.rs              # CLI agent integration
├── cli_agent_sessions/       # Agent session management
├── shared_session/           # Real-time session sharing
├── local_tty/                # Local PTY management
├── remote_tty/               # Remote PTY (SSH)
├── ssh/                      # SSH connection + warpification
├── history/                  # Command history (38K)
├── warpify/                  # SSH warpification engine
├── find/                     # In-terminal search
└── block_list_viewport.rs    # Viewport scrolling (91K)
```

---

## 2. TerminalModel — Core Data Structure

```rust
// Warp's central terminal state — ~30 fields
pub struct TerminalModel {
    // ═══ Display Layers ═══
    alt_screen: AltScreen,              // Fullscreen apps (vim, htop, etc.)
    block_list: BlockList,              // All command blocks (Warp-specific)
    alt_screen_active: bool,            // Which layer is active

    // ═══ Window State ═══
    title: Option<String>,              // Window title from OSC sequences
    title_stack: Vec<Option<String>>,    // Push/pop title stack (max 4096)
    custom_title: Option<String>,        // User-set title override

    // ═══ Colors ═══
    colors: color::List,                // Default ANSI color palette
    override_colors: color::OverrideList, // ESC-set color overrides

    // ═══ PTY Communication ═══
    event_proxy: ChannelEventListener,   // Event channel to PTY
    is_input_dirty: bool,                // User edited since last submit

    // ═══ PTY Processing States ═══
    is_receiving_in_band_command_output: IsReceivingInBandCommandOutput,
    is_receiving_completions_output: IsReceivingCompletionsOutput,
    is_receiving_iterm_image_data: IsReceivingITermImageData,
    is_receiving_kitty_image_data: IsReceivingKittyActionData,
    is_receiving_hook: IsReceivingHook,

    // ═══ Session Management ═══
    shell_launch_state: ShellLaunchState,
    pending_shell_launch_data: Option<ShellLaunchData>,
    active_shell_launch_data: Option<ShellLaunchData>,
    pending_session_info: Option<SessionInfo>,
    handled_exit: bool,
    session_startup_path: Option<PathBuf>,

    // ═══ SSH ═══
    pending_legacy_ssh_session: Option<SSHValue>,
    pending_warp_initiated_control_mode: Option<WarpInitiatedTmuxControlMode>,
    tmux_control_mode_context: Option<TmuxControlModeContext>,

    // ═══ Session Sharing ═══
    shared_session_status: SharedSessionStatus,
    ordered_terminal_events_for_shared_session_tx: Option<Sender<OrderedTerminalEventType>>,

    // ═══ AI Integration ═══
    conversation_transcript_viewer_status: Option<ConversationTranscriptViewerStatus>,
    is_receiving_agent_conversation_replay: bool,

    // ═══ Secret Redaction ═══
    obfuscate_secrets: ObfuscateSecrets,
}
```

---

## 3. Block System — Warp's Killer Feature

Spre deosebire de un terminal tradițional cu scroll liniar, Warp **segmentează output-ul în blocuri**. Fiecare comandă executată = un `Block`:

```
┌─────────────────────────────────────────┐
│ Block N                                 │
│ ┌───────────────────────────────────┐   │
│ │ Prompt + Command Grid             │   │  ← GridType::PromptAndCommand
│ │ ~/projects $ git status           │   │
│ └───────────────────────────────────┘   │
│ ┌───────────────────────────────────┐   │
│ │ Output Grid                       │   │  ← GridType::Output
│ │ On branch main                    │   │
│ │ Changes not staged for commit:    │   │
│ │   modified:   src/main.rs         │   │
│ └───────────────────────────────────┘   │
│ [padding_bottom]                        │
└─────────────────────────────────────────┘
```

```rust
pub struct BlockPadding {
    pub padding_top: f32,           // Top of block → prompt
    pub command_padding_top: f32,   // Prompt → command text
    pub middle: f32,                // Command → output
    pub bottom: f32,                // Output → block end
}
```

**Block Selection** — utilizatorii pot selecta blocuri individuale sau range-uri:
- Click = select un block
- Ctrl+Click = toggle individual
- Shift+Click = range select
- Copy = copie doar blocurile selectate

---

## 4. SizeInfo — Terminal Dimensions

```rust
pub struct SizeInfo {
    pane_width_px: f32,         // Total pane width
    pane_height_px: f32,        // Total pane height
    rows: usize,                // Calculated: (height - 2*padding_y) / cell_height
    columns: usize,             // Calculated: (width - 2*padding_x) / cell_width
    cell_width_px: Pixels,      // Single character width
    cell_height_px: Pixels,     // Single character height (line height)
    padding_x_px: Pixels,       // Horizontal padding
    padding_y_px: Pixels,       // Vertical padding
}
```

> **Design Decision (Warp)**: Rows sunt calculate din **pane size**, NU din content size. Motivul: programele fullscreen (vim, htop) nu gestionează bine resize-uri frecvente care ar apărea când input-ul crește/scade.

---

## 5. Session Lifecycle

```
┌──────────────────────────────────────────────────────┐
│ 1. Shell Launch                                      │
│    ShellLaunchData { shell_path, args, env_vars }    │
│                         │                            │
│ 2. Bootstrap            ▼                            │
│    BootstrapStage::WaitingForInitShell               │
│                         │                            │
│ 3. InitShell DCS        ▼                            │
│    SessionInfo populated from shell hook              │
│                         │                            │
│ 4. Running              ▼                            │
│    Block creation per command executed                │
│    (precmd → preexec → command_finished hooks)       │
│                         │                            │
│ 5. Exit                 ▼                            │
│    handled_exit = true, session cleaned up            │
└──────────────────────────────────────────────────────┘
```

**Session Types:**
| Type | Description | Use Case |
|------|-------------|----------|
| Local | Direct PTY spawn | Normal terminal usage |
| SSH | Remote via PTY + tmux control mode | SSH connections |
| Shared | Real-time viewer/sharer protocol | Collaboration |
| Cloud Mode | Dummy session, no local shell | Ambient agents |
| Subshell | Nested shell (detected via RC file) | `bash` inside `zsh` |

---

## 6. Feature Matrix

| Feature | Warp Module | Size | Relevance Octomus |
|---------|------------|------|------------------|
| Block system | `model/blocks/` | Core | ⭐⭐⭐ High |
| ANSI parsing | `model/ansi.rs` | Core | ⭐⭐⭐ High |
| Grid rendering | `grid_renderer.rs` | 103K | ⭐⭐⭐ High |
| Input handling | `input.rs` | 618K | ⭐⭐ Medium |
| Command history | `history/` | 38K | ⭐⭐⭐ High |
| Completions | `model/completions/` | Variable | ⭐⭐ Medium |
| Find in terminal | `find/` | Variable | ⭐⭐ Medium |
| Text selection | `model/selection.rs` | Variable | ⭐⭐ Medium |
| Alt screen | `alt_screen/` | Variable | ⭐⭐⭐ High |
| SSH warpification | `ssh/` + `warpify/` | Variable | ⭐ Low (later) |
| Session sharing | `shared_session/` | Variable | ⭐ Low (later) |
| Image protocols | `kitty.rs`, `iterm_image.rs` | Variable | ⭐ Low |
| Secret redaction | `model/secrets.rs` | Variable | ⭐⭐ Medium |
| Block filter | `block_filter.rs` | 28K | ⭐⭐ Medium |

---

## 7. Octomus Adaptation Plan

### 7.1 Architecture Mapping (Tauri + Rust)

```
Octomus (launcher-rs-react)
├── src-tauri/src/
│   ├── terminal/
│   │   ├── mod.rs              # Terminal module entry
│   │   ├── model.rs            # TerminalState (simplified TerminalModel)
│   │   ├── pty.rs              # PTY spawn + read/write (portable_pty)
│   │   ├── ansi.rs             # ANSI parser (use `vte` crate)
│   │   ├── grid.rs             # Cell grid (rows × columns)
│   │   ├── block.rs            # Block system
│   │   ├── session.rs          # Session lifecycle
│   │   ├── size.rs             # SizeInfo equivalent
│   │   └── history.rs          # Command history
│   ├── ai/
│   │   ├── mod.rs
│   │   ├── conversation.rs
│   │   └── provider.rs
│   └── main.rs
└── src/
    ├── components/
    │   ├── Terminal.tsx         # Terminal renderer (xterm.js or custom)
    │   ├── BlockView.tsx        # Block-based rendering
    │   ├── SpotlightInput.tsx   # AI spotlight input
    │   └── CodeEditor.tsx       # Code editing component
    └── App.tsx
```

### 7.2 Recommended Crates

```toml
[dependencies]
# Terminal
portable-pty = "0.8"        # Cross-platform PTY
vte = "0.13"                # ANSI escape sequence parser (same as Alacritty)

# AI
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }

# Tauri
tauri = { version = "2.0.0", features = [] }
```

### 7.3 What to Build vs What to Use

| Component | Build vs Use | Recommendation |
|-----------|-------------|---------------|
| PTY management | Use crate | `portable-pty` |
| ANSI parsing | Use crate | `vte` (Alacritty's parser) |
| Grid model | Build | Simplified version of Warp's grid |
| Block system | Build | Core differentiator |
| Terminal rendering | Use library | `xterm.js` in React webview |
| Code editor | Use library | Monaco Editor in React |
| AI chat | Build | Custom, reuse transcript patterns |

### 7.4 Key Design Decisions

1. **xterm.js vs Custom Renderer**: Folosește `xterm.js` în frontend-ul React. Warp a construit un renderer custom de la zero — asta a durat ani. xterm.js oferă 90% din funcționalitate instant.

2. **Block System**: Implementează block detection prin interceptarea hook-urilor shell (precmd/preexec). Trimite events din Rust → React prin Tauri events.

3. **Dual Mode**: Spotlight mode (input AI) + Terminal mode (shell complet). Toggle între ele cu hotkey.

4. **PTY in Rust**: PTY-ul rulează în Rust backend (Tauri), trimite output prin events la React frontend. Input vine din React → Tauri command → PTY write.
