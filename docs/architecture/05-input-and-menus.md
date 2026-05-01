# Input Area, Buttons & Slash/@ Menus — Warp Reference & Octomus Adaptation

> Reverse-engineered din Warp codebase: `ai_assistant/panel.rs` (45K), `slash_command_menu/` (44K), `ai_context_menu/` (70K+).
> Adaptat pentru Octomus: Tauri v2 + Rust backend + React frontend.

---

## 1. Input Area — Layout

```
┌────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────┐ │
│ │                                                        │ │
│ │  Editor (autogrow, soft-wrap, max 300px height)        │ │
│ │  " Ask a question..."  (placeholder)                   │ │
│ │                                                        │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│  Credits: 5/100 · 2 hours until refresh        ⚠️          │
├────────────────────────────────────────────────────────────┤
│  [@] Context   [/] Commands   [?] Help          [Submit ▶] │
└────────────────────────────────────────────────────────────┘
```

### 1.1 Editor Configuration

```rust
// From panel.rs — the text editor inside the AI panel
let options = EditorOptions {
    text: TextOptions::ui_text(Some(13.), appearance),  // 13px font
    propagate_and_no_op_vertical_navigation_keys: PropagateAndNoOpNavigationKeys::Always,
    autogrow: true,               // Grows with content
    soft_wrap: true,              // Wraps long lines
    supports_vim_mode: true,      // Vim keybindings
    ..Default::default()
};
```

**Constants:**
```rust
const MAX_EDITOR_HEIGHT: f32 = 300.;        // Max input height before scroll
const EDITOR_MARGIN: f32 = 16.;             // Padding around editor
const BODY_FONT_SIZE: f32 = 13.;            // Editor text size
const PROMPT_CHARACTER_LIMIT: usize = 1000; // ~250 tokens
const ASK_AI_BLOCK_INPUT_LIMIT: usize = 100; // Max chars for block command

// Placeholder text changes based on state:
const INIT_PLACEHOLDER_TEXT: &str = " Ask a question...";
const FOLLOWUP_PLACEHOLDER_TEXT: &str = " Type a response or click one above...";
```

### 1.2 Editor Events → Actions

```rust
// Handle user interactions in the editor
fn handle_editor_event(&mut self, event: &EditorEvent, ctx: &mut ViewContext<Self>) {
    match event {
        EditorEvent::Enter => {
            // Close suggestions, validate, issue request
            if !is_prompt_too_long(text) && !is_prompt_empty(text) {
                self.issue_request(buffer_text, ctx);
            }
        }
        EditorEvent::Edited(_) => {
            // Force re-render for character limit warning
            // Close suggestions if text doesn't match selected suggestion
        }
        EditorEvent::CmdUpOnFirstRow => {
            // Navigate to last code block in transcript
            transcript_view.select_last_code_block(ctx);
        }
        EditorEvent::Activate => {
            // Focus editor state
            self.focus_state = PanelFocusState::Editor;
        }
        EditorEvent::Escape => {
            // Close input suggestions
        }
        EditorEvent::Navigate(NavigationKey::Up) => {
            // If cursor on first row → open input suggestions (prompt history)
        }
    }
}
```

### 1.3 Input Validation

```rust
fn is_prompt_too_long(prompt: &str) -> bool {
    prompt.chars().count() > 1000  // PROMPT_CHARACTER_LIMIT
}

fn is_prompt_empty(prompt: &str) -> bool {
    prompt.chars().count() == 0
}

// On too-long attempt, telemetry event is sent:
// TelemetryEvent::WarpAICharacterLimitExceeded
```

---

## 2. Slash Commands (`/`)

### 2.1 Architecture

Typing `/` in the input opens the **Slash Command Menu**. Commands are registered statically:

```rust
pub struct StaticCommand {
    pub name: &'static str,             // "/agent", "/fork", etc.
    pub description: &'static str,      // Human-readable description
    pub icon_path: &'static str,        // SVG icon path
    pub availability: Availability,      // Bitflag context requirements
    pub auto_enter_ai_mode: bool,       // Switch to AI mode on selection
    pub argument: Option<Argument>,     // Optional/required argument
}

pub struct Argument {
    pub hint_text: Option<&'static str>,      // e.g. "<describe your task>"
    pub is_optional: bool,
    pub should_execute_on_selection: bool,     // Execute immediately vs insert
}
```

### 2.2 Availability System (Bitflags)

```rust
bitflags! {
    pub struct Availability: u16 {
        const ALWAYS            = 0;       // No requirements
        const AGENT_VIEW        = 1 << 0;  // Requires agent view
        const TERMINAL_VIEW     = 1 << 1;  // Requires terminal view
        const LOCAL             = 1 << 2;  // Local session only
        const REPOSITORY        = 1 << 3;  // Requires git repo
        const NO_LRC_CONTROL    = 1 << 4;  // No active long-running command
        const ACTIVE_CONVERSATION = 1 << 5; // Conversation must exist
        const CODEBASE_CONTEXT  = 1 << 6;  // Codebase indexing enabled
        const AI_ENABLED        = 1 << 7;  // AI is globally enabled
        const NOT_CLOUD_AGENT   = 1 << 8;  // Not in cloud agent mode
        const CLOUD_AGENT_V2    = 1 << 9;  // Cloud mode V2 only
    }
}

// Command available when session satisfies ALL flags:
fn is_active(&self, session_context: Availability) -> bool {
    session_context.contains(self.availability)
}

// Filtering uses prefix match (after removing "/"):
fn matches_filter(&self, filter_text: &str) -> bool {
    self.name[1..].starts_with(&filter_text.to_lowercase())
}
```

### 2.3 Complete Command Registry (38 commands)

| Command | Description | Availability | Has Args |
|---------|-------------|-------------|----------|
| `/agent` | Start a new conversation | AI + Not Cloud | Optional |
| `/new` | Alias for /agent | AI + Not Cloud + No LRC | Optional |
| `/cloud-agent` | Start cloud agent conversation | AI + Not Cloud | Optional |
| `/model` | Switch base agent model | Agent View + AI | No |
| `/profile` | Switch execution profile | Agent View + AI + Not Cloud | No |
| `/host` | Switch cloud agent host | Agent View + AI + Cloud V2 | No |
| `/harness` | Switch cloud agent harness | Agent View + AI + Cloud V2 | No |
| `/environment` | Switch cloud environment | Agent View + AI + Cloud V2 | No |
| `/plan` | Research and create a plan | AI | `<describe your task>` |
| `/orchestrate` | Break task into parallel subtasks | Local + AI | `<describe your task>` |
| `/fork` | Fork conversation in new pane/tab | Agent + Active Conv + No LRC + AI | Optional |
| `/fork-from` | Fork from a specific query | Agent + No LRC + AI + Not Cloud | No |
| `/fork-and-compact` | Fork and compact | Agent + Active Conv + No LRC + AI | Optional |
| `/continue-locally` | Continue cloud conv locally | Agent + Active Conv + AI | Optional |
| `/compact` | Summarize convo history | Agent + Active Conv + No LRC + AI | Optional instructions |
| `/compact-and` | Compact then send follow-up | Agent + Active Conv + No LRC + AI | Optional prompt |
| `/queue` | Queue prompt after agent finishes | Agent + Active Conv + No LRC + AI | Required prompt |
| `/rewind` | Rewind to previous checkpoint | Agent + AI + Not Cloud | No |
| `/skills` | Invoke a skill | AI | No |
| `/open-skill` | Open skill markdown file | AI | No |
| `/prompts` | Search saved prompts | AI | No |
| `/add-prompt` | Add new agent prompt | AI | No |
| `/add-rule` | Add global agent rule | AI | No |
| `/open-rules` | View all rules | AI | No |
| `/open-project-rules` | Open AGENTS.md | Repository + AI | No |
| `/add-mcp` | Add new MCP server | AI | No |
| `/open-mcp-servers` | Open MCP servers panel | AI | No |
| `/index` | Index this codebase | Repository + Codebase + AI | No |
| `/init` | Index + generate AGENTS.md | Repository + Agent + AI | No |
| `/open-repo` | Switch to another repository | Local + AI | No |
| `/open-file` | Open file in code editor | Local | `<path[:line[:col]]>` |
| `/open-code-review` | Open code review | Repository | No |
| `/pr-comments` | Pull GitHub PR comments | Repository + AI | No |
| `/conversations` | Open conversation history | AI | No |
| `/cost` | Toggle credit usage details | Agent + AI + Not Cloud | No |
| `/usage` | Open billing settings | AI | No |
| `/export-to-clipboard` | Export convo to clipboard | Agent + AI + Not Cloud | No |
| `/export-to-file` | Export convo to file | Agent + AI + Not Cloud | Optional filename |
| `/create-environment` | Create Docker env via guided setup | AI | Optional paths |
| `/docker-sandbox` | Create Docker sandbox session | Local + AI | No |
| `/create-new-project` | Walk through creating new project | Local + AI | Required description |
| `/rename-tab` | Rename current tab | Always | Required name |
| `/set-tab-color` | Set tab color | Always | Required color |
| `/feedback` | Send feedback | Always | Optional |
| `/changelog` | Open latest changelog | Always | No |
| `/remote-control` | Start remote control | AI + Not Cloud | No |

---

## 3. Context Menu (`@`)

### 3.1 Architecture

Typing `@` opens the **AI Context Menu** — a navigable palette for attaching context to prompts.

```rust
pub struct AIContextMenu {
    mixer: ModelHandle<AIContextMenuMixer>,          // Multi-source data mixer
    search_bar: ViewHandle<SearchBar<...>>,           // Reusable search bar
    search_bar_state: ModelHandle<SearchBarState<...>>,
    code_symbol_cache: ModelHandle<CodeSymbolCache>,   // Code symbol indexing
    state: AIContextMenuState,
    search_debounce_tx: Sender<String>,               // 60ms debounce
}

struct AIContextMenuState {
    navigation_state: NavigationState,
    selected_category_index: usize,
    main_menu_query: String,
    is_ai_or_autodetect_mode: bool,
    is_shared_session_viewer: bool,
    is_in_ambient_agent: bool,
    is_cli_agent_input: bool,
    // ... scroll, hover states
}

enum NavigationState {
    MainMenu,              // Shows category grid
    Category(Category),    // Shows items in one category
    AllCategories,         // Shows combined search results
}
```

### 3.2 Categories (19 types)

```rust
pub enum AIContextMenuCategory {
    CurrentFolderFiles,  // Files in cwd
    RepoFiles,           // Files in git repo
    Commands,            // Shell commands
    Blocks,              // Terminal blocks
    Workflows,           // Saved workflows (Warp Drive)
    Notebooks,           // Notebooks
    Plans,               // Agent plans
    Diffs,               // Git diffs
    Docs,                // Documentation
    Tasks,               // Past agent tasks
    Rules,               // Global/project rules
    Servers,             // MCP servers + integrations
    Terminal,            // Terminal context
    Web,                 // Web URLs
    RecentDiff,          // Most recent diff
    RecentBlock,         // Most recent block
    Code,                // Code symbols (functions, classes)
    DiffSet,             // Diff sets
    Conversations,       // Past conversations
    Skills,              // Agent skills
}
```

Each category has an **icon** and a **name**:
```rust
// Example category icons:
CurrentFolderFiles => "bundled/svg/folder.svg"
Commands           => "bundled/svg/terminal.svg"
Code               => "bundled/svg/code-02.svg"
Rules              => "bundled/svg/book-open.svg"
Conversations      => "bundled/svg/conversation.svg"
Skills             => "bundled/svg/stars-01.svg"
```

### 3.3 Category Availability by Mode

Categories shown depend on input mode and session type:

| Category | AI Mode | Terminal Mode | Ambient Agent | CLI Agent | Shared Viewer |
|----------|:-------:|:---:|:---:|:---:|:---:|
| Files | ✅ | ✅ | ❌ | ✅ | ❌ |
| Commands | ✅ | ❌ | ❌ | ❌ | ❌ |
| Blocks | ✅ | ❌ | ❌ | ❌ | ❌ |
| Code | ✅ | ✅ | ❌ | ✅ | ❌ |
| Workflows | ✅ | ❌ | ✅ | ❌ | ❌ |
| Notebooks | ✅ | ❌ | ✅ | ❌ | ❌ |
| Plans | ✅ | ❌ | ✅ | ❌ | ❌ |
| DiffSet | ✅ | ❌ | ❌ | ❌ | ❌ |
| Conversations | ✅ | ❌ | ❌ | ❌ | ❌ |
| Rules | ✅ | ❌ | ✅ | ❌ | ❌ |
| Skills | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.4 Navigation Flow

```
User types "@" → Context Menu opens
       │
       ▼
┌─────────────────────────┐
│ Main Menu (categories)  │
│ [📁 Files and folders]  │  ← ↑/↓ navigate
│ [💻 Commands]           │  ← Enter to drill in
│ [📦 Blocks]             │  ← Typing filters categories
│ [📝 Code]               │
│ [⚙️ Rules]              │
│ [⭐ Skills]             │
└─────────────────────────┘
         │ Enter / Click
         ▼
┌─────────────────────────┐
│ Category: Files         │
│ [🔍 Search files...]    │  ← 60ms debounce
│ ├── src/main.rs         │  ← fuzzy match
│ ├── src/lib.rs          │
│ └── Cargo.toml          │
│                         │
│ Max 250 results         │
│ Max 8 visible           │
└─────────────────────────┘
         │ Enter / Click
         ▼
  Item inserted into prompt as context
  e.g. "@src/main.rs"
```

### 3.5 Constants

```rust
const DEFAULT_PALETTE_WIDTH: f32 = 320.0;
const MAX_DISPLAYED_RESULT_COUNT: usize = 8;
const MAX_SEARCH_RESULTS: usize = 250;
const PALETTE_HEIGHT: f32 = 423.0;
const SEARCH_DEBOUNCE_PERIOD: Duration = Duration::from_millis(60);
const CORNER_RADIUS: f32 = 8.0;
const PADDING: f32 = 10.0;
```

### 3.6 Menu Position

```rust
pub enum AIContextMenuPosition {
    AtButton,  // User clicked the @ button in the toolbar
    AtCursor,  // User typed @ in the editor (no search input shown)
}
```

---

## 4. Fuzzy Matching

```rust
// From slash_command_menu/fuzzy_match.rs
// Prefix-based for slash commands:
fn matches_filter(&self, filter_text: &str) -> bool {
    self.name[1..].starts_with(&filter_text.to_lowercase())
}

// For context menu: uses full fuzzy substring matching via
// the SearchBar<T> component with debounced queries (60ms)
```

---

## 5. Input Suggestions (Prompt History)

When cursor is on the first row and user presses `↑`:

```rust
enum InputSuggestionsMode {
    Open { origin_buffer_text: String },  // Remembers what user typed
    Closed,
}

// MAX_INPUT_SUGGESTIONS_HEIGHT = 200px
// Fuzzy substring search over all past prompts
// Selecting replaces editor content
// Escape restores original text
```

---

## 6. Octomus Adaptation

### 6.1 Slash Command System (React + Rust)

```rust
// src-tauri/src/spotlight/commands.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommand {
    pub name: &'static str,
    pub description: &'static str,
    pub icon: &'static str,           // Lucide icon name
    pub category: CommandCategory,
    pub requires_arg: bool,
    pub arg_hint: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommandCategory {
    Conversation,   // /new, /fork, /compact, /queue
    Navigation,     // /open-file, /open-repo
    Configuration,  // /model, /profile, /add-rule
    Context,        // /index, /init
    Export,          // /export-to-clipboard, /export-to-file
    System,         // /feedback, /changelog, /usage
}

pub fn builtin_commands() -> Vec<SlashCommand> {
    vec![
        SlashCommand {
            name: "/new",
            description: "Start a new conversation",
            icon: "message-square-plus",
            category: CommandCategory::Conversation,
            requires_arg: false,
            arg_hint: None,
        },
        SlashCommand {
            name: "/model",
            description: "Switch LLM model",
            icon: "cpu",
            category: CommandCategory::Configuration,
            requires_arg: false,
            arg_hint: None,
        },
        SlashCommand {
            name: "/compact",
            description: "Summarize conversation to free context",
            icon: "minimize-2",
            category: CommandCategory::Conversation,
            requires_arg: false,
            arg_hint: Some("<optional instructions>"),
        },
        SlashCommand {
            name: "/fork",
            description: "Fork conversation into new tab",
            icon: "git-branch",
            category: CommandCategory::Conversation,
            requires_arg: false,
            arg_hint: Some("<optional prompt>"),
        },
        SlashCommand {
            name: "/open",
            description: "Open file in editor",
            icon: "file-code",
            category: CommandCategory::Navigation,
            requires_arg: true,
            arg_hint: Some("<path[:line[:col]]>"),
        },
        SlashCommand {
            name: "/plan",
            description: "Research and create a task plan",
            icon: "clipboard-list",
            category: CommandCategory::Conversation,
            requires_arg: true,
            arg_hint: Some("<describe your task>"),
        },
        SlashCommand {
            name: "/export",
            description: "Export conversation to clipboard",
            icon: "copy",
            category: CommandCategory::Export,
            requires_arg: false,
            arg_hint: None,
        },
        // ... more commands
    ]
}
```

### 6.2 Context Menu (React)

```tsx
// src/components/ContextMenu.tsx

interface ContextCategory {
  id: string;
  name: string;
  icon: string;  // Lucide icon
  items: ContextItem[];
}

interface ContextItem {
  id: string;
  label: string;
  detail?: string;      // File path, symbol type, etc.
  category: string;
  insertText: string;   // What gets inserted into prompt
}

// Categories for Octomus:
const CATEGORIES: ContextCategory[] = [
  { id: 'files',     name: 'Files',         icon: 'folder' },
  { id: 'code',      name: 'Code Symbols',  icon: 'code' },
  { id: 'terminal',  name: 'Terminal',       icon: 'terminal' },
  { id: 'history',   name: 'Conversations',  icon: 'message-circle' },
  { id: 'rules',     name: 'Rules',          icon: 'book-open' },
  { id: 'web',       name: 'Web',            icon: 'globe' },
];
```

### 6.3 Slash Command Menu Component (React)

```tsx
// src/components/SlashMenu.tsx

interface SlashMenuProps {
  query: string;           // Text after "/"
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

function SlashMenu({ query, commands, selectedIndex, onSelect }: SlashMenuProps) {
  const filtered = commands.filter(cmd =>
    cmd.name.slice(1).toLowerCase().startsWith(query.toLowerCase())
  );

  return (
    <div className="slash-menu">
      {filtered.map((cmd, i) => (
        <div
          key={cmd.name}
          className={`slash-item ${i === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(cmd)}
        >
          <Icon name={cmd.icon} size={16} />
          <span className="name">{cmd.name}</span>
          <span className="description">{cmd.description}</span>
          {cmd.arg_hint && (
            <span className="hint">{cmd.arg_hint}</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 6.4 Input Component with Menu Detection

```tsx
// src/components/SpotlightInput.tsx

function SpotlightInput() {
  const [text, setText] = useState('');
  const [menuState, setMenuState] = useState<'none' | 'slash' | 'context'>('none');

  const handleChange = (value: string) => {
    setText(value);

    // Detect menu triggers
    if (value.startsWith('/')) {
      setMenuState('slash');
    } else if (value.includes('@') && !value.endsWith(' ')) {
      setMenuState('context');
    } else {
      setMenuState('none');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (menuState !== 'none') {
        // Select current menu item
      } else {
        submitPrompt(text);
      }
    }
    if (e.key === 'ArrowUp' && menuState !== 'none') {
      e.preventDefault(); // Navigate menu up
    }
    if (e.key === 'ArrowDown' && menuState !== 'none') {
      e.preventDefault(); // Navigate menu down
    }
    if (e.key === 'Escape') {
      setMenuState('none');
    }
  };

  return (
    <div className="spotlight-input">
      {menuState === 'slash' && (
        <SlashMenu query={text.slice(1)} ... />
      )}
      {menuState === 'context' && (
        <ContextMenu query={extractAtQuery(text)} ... />
      )}
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question..."
      />
      <div className="input-toolbar">
        <button onClick={() => setMenuState('context')}>@ Context</button>
        <button onClick={() => { setText('/'); setMenuState('slash'); }}>/ Commands</button>
        <button className="submit" onClick={() => submitPrompt(text)}>
          Submit ▶
        </button>
      </div>
    </div>
  );
}
```

### 6.5 Tauri Commands for Context Data

```rust
// src-tauri/src/spotlight/context.rs

#[tauri::command]
async fn list_files(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<FileItem>, String> {
    // Fuzzy search files in cwd/repo
}

#[tauri::command]
async fn list_code_symbols(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<CodeSymbol>, String> {
    // Search functions, classes, etc. via tree-sitter or LSP
}

#[tauri::command]
fn get_slash_commands() -> Vec<SlashCommand> {
    builtin_commands()
}

#[tauri::command]
async fn execute_slash_command(
    state: State<'_, AppState>,
    command: String,
    args: Option<String>,
) -> Result<SlashCommandResult, String> {
    match command.as_str() {
        "/new" => { /* start new conversation */ }
        "/model" => { /* open model picker */ }
        "/compact" => { /* summarize conversation */ }
        "/open" => { /* open file in editor */ }
        _ => Err(format!("Unknown command: {command}")),
    }
}
```
