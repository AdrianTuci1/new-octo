# Search, Recomandare & Terminal Command Autodetection

> Reverse-engineered din Warp: `search/mixer.rs` (25K), `search/data_source.rs` (19K),
> `search/command_search/` (90K), `ai/blocklist/input_model.rs` (33K), `input_classifier` crate.
> Adaptat pentru Octomus: Tauri v2 + Rust + React.

---

## 1. SearchMixer — Motorul Universal de Căutare

Warp are un **SearchMixer** generic care combină rezultate din surse multiple (sync + async),
le sortează, le deduplicare și le servește UI-ului într-o singură listă ordonată.

### 1.1 Arhitectura Mixer

```
                           ┌─────────────────────────┐
   User types query ──────▶│     SearchMixer<T>       │
                           │                         │
                           │  ┌── SyncSource (hist) ─┼──▶ results[] immediately
                           │  ├── SyncSource (warp) ─┼──▶ results[] immediately
                           │  ├── AsyncSource (AI)  ─┼──▶ debounce 50ms → future → results[]
                           │  └── AsyncSource (cloud)┼──▶ debounce 50ms → future → results[]
                           │                         │
                           │  Sort by: (tier, score,  │
                           │           source_order)  │
                           │  Dedup: key-based        │
                           │  Timeout: 500ms          │
                           └─────────┬───────────────┘
                                     │
                                     ▼
                            Sorted Vec<QueryResult<T>>
```

### 1.2 Core Structs

```rust
// SearchMixer — Combines multiple data sources
pub struct SearchMixer<T: Action + Clone> {
    sources: HashMap<DataSourceId, RegisteredDataSource<T>>,
    results: Vec<QueryResult<T>>,
    query: Option<Query>,
    finished_sources: HashSet<DataSourceId>,
    dedupe_strategy: DedupeStrategy,        // AllowDuplicates | HighestScore
    query_generation: u64,                  // Stale query detection
    pending_results: Option<Vec<QueryResult<T>>>,  // Buffer during load
    initial_results_emitted: bool,
}

// A query with optional filters
pub struct Query {
    pub filters: HashSet<QueryFilter>,
    pub text: String,
}

// A search result with metadata
pub struct QueryResult<T> {
    item: Arc<dyn SearchItem<Action = T>>,
    source_order: usize,  // Tiebreaker (earlier source → higher rank)
}

// Data source registration
struct RegisteredDataSource<T> {
    source: DataSource<T>,             // Sync or Async
    filters: HashSet<QueryFilter>,     // Which filters activate this source
    latest_run_error: Option<Error>,
}
```

### 1.3 Data Source Traits

```rust
// Sync — runs inline, blocks caller briefly
pub trait SyncDataSource: 'static {
    type Action: Action + Clone;
    fn run_query(&self, query: &Query, app: &AppContext)
        -> Result<Vec<QueryResult<Self::Action>>, Error>;
}

// Async — runs in background, results arrive later
pub trait AsyncDataSource: 'static + Send + Sync {
    type Action: Action + Clone;
    fn run_query(&self, query: &Query, app: &AppContext)
        -> BoxFuture<'static, Result<Vec<QueryResult<Self::Action>>, Error>>;
    fn on_query_finished(&self, _ctx: &mut AppContext) {}
}
```

### 1.4 Result Buffering & Timeout

```rust
const INITIAL_RESULTS_TIMEOUT: Duration = Duration::from_millis(500);

// Flow:
// 1. run_query() → buffer results in pending_results
// 2. Sync sources finish instantly → results buffered
// 3. Timer starts (500ms)
// 4. If all sources finish before timer → commit immediately
// 5. If timer fires first → commit what we have, late results appended
// 6. Sort by (priority_tier, score, source_order)
```

---

## 2. QueryFilter — Sistemul de Filtre

### 2.1 Enum complet (25 filtre)

```rust
pub enum QueryFilter {
    History,                    // "history:" / "h:"
    Workflows,                 // "workflows:" / "w:"
    AgentModeWorkflows,         // "prompts:" / "p:"
    Notebooks,                 // "notebooks:" / "n:"
    Plans,                     // "plans:"
    NaturalLanguage,           // "#"  ← triggers AI command generation
    Actions,                   // "actions:"
    Sessions,                  // "sessions:"
    Conversations,             // "conversations:"
    HistoricalConversations,
    LaunchConfigurations,      // "launch_configs:"
    Drive,                     // "drive:"
    EnvironmentVariables,      // "env_vars:"
    PromptHistory,             // "ai_history:"
    Files,                     // "files:"
    Commands,                  // "commands:"
    Blocks,                    // "blocks:" / "b:"
    Code,                      // "code:"
    Rules,                     // "rules:" / "r:"
    Repos,                     // "repos:"
    DiffSets,                  // "diffsets:" / "diffs:"
    StaticSlashCommands,       // "slash:"
    Skills,
    BaseModels,
    FullTerminalUseModels,
    CurrentDirectoryConversations,
}
```

### 2.2 FilterAtom — Prefix Typing

```rust
// Typing "history:git checkout" → filter=History, text="git checkout"
// Typing "h:git checkout"       → filter=History, text="git checkout" (alias)
// Typing "#find foo in files"   → filter=NaturalLanguage, text="find foo in files"

pub struct FilterAtom {
    pub primary_text: &'static str,    // "history:"
    pub aliases: Vec<&'static str>,    // ["h:"]
}

fn query_match(&self, query: &str) -> Option<&str> {
    if query.starts_with(self.primary_text) {
        Some(self.primary_text)
    } else {
        self.aliases.iter().find(|alias| query.starts_with(**alias)).copied()
    }
}
```

---

## 3. Command Search — Căutarea Universală

### 3.1 Data Sources (in priority order)

```rust
fn reset_command_search_mixer(&mut self, ...) {
    mixer.reset();

    // 1. Warp AI (sync) — always shows "Translate" or "Open AI" item
    mixer.add_sync_source(WarpAIDataSource, {NaturalLanguage});

    // 2. Warp AI (async) — generates shell commands from NL
    //    Debounce: 50ms, only when #-filtered
    mixer.add_async_source(WarpAIDataSource, {NaturalLanguage},
        debounce: 50ms, zero_state: false, unfiltered: false);

    // 3. Workflows (sync) — local fuzzy match
    mixer.add_sync_source(WorkflowsDataSource, {Workflows});

    // 4. Workflows (async) — cloud workflows
    //    Debounce: 50ms, runs in zero state + unfiltered
    mixer.add_async_source(cloud_workflows, {Workflows, AgentModeWorkflows},
        debounce: 50ms, zero_state: true, unfiltered: true);

    // 5. Notebooks (async) — cloud notebooks
    mixer.add_async_source(notebooks, {Notebooks},
        debounce: 50ms, zero_state: true, unfiltered: true);

    // 6. Env Var Collections (sync) — fast, small dataset
    mixer.add_sync_source(EnvVarCollectionDataSource, {EnvironmentVariables});

    // 7. AI Queries / Prompt history (sync)
    mixer.add_sync_source(AIQueriesDataSource, {PromptHistory});

    // 8. History (async) — command history per session
    //    Debounce: 50ms, runs in zero state + unfiltered
    mixer.add_async_source(history_data_source, {History},
        debounce: 50ms, zero_state: true, unfiltered: true);
}
```

### 3.2 Action Enum

```rust
pub enum CommandSearchItemAction {
    AcceptHistory(AcceptedHistoryItem),      // User accepted a history command
    ExecuteHistory(String),                  // User wants to re-run a command
    AcceptWorkflow(AcceptedWorkflow),        // Selected a workflow
    AcceptNotebook(SyncId),                  // Selected a notebook
    AcceptEnvVarCollection(Box<...>),        // Selected env vars
    AcceptAIQuery(String),                   // Accepted AI-generated query
    RunAIQuery(String),                      // Run AI query immediately
    OpenWarpAI,                              // Open AI assistant
    TranslateUsingWarpAI,                    // Translate NL → shell command
}
```

### 3.3 Zero State (Empty Query)

When the input is empty, a **zero state** panel shows:

```rust
// Filter chips: clickable buttons to activate a filter
let valid_filters = vec![
    QueryFilter::History,           // Always
    QueryFilter::AgentModeWorkflows, // If AI enabled + feature flag
    QueryFilter::PromptHistory,     // If AI enabled
    QueryFilter::Workflows,         // If Warp Drive enabled
    QueryFilter::Notebooks,         // If Warp Drive enabled
    QueryFilter::EnvironmentVariables, // If Warp Drive enabled
];

// Sample queries: clickable example searches
let SAMPLE_QUERIES = {
    "history: git checkout"      → QueryFilter::History,
    "workflows: run dev server"  → QueryFilter::Workflows,
    "# find \"foo\" in files"    → QueryFilter::NaturalLanguage,
    "notebooks: deploy server"   → QueryFilter::Notebooks,
};
```

### 3.4 AI Command Generation (NL → Shell)

```rust
// When user types "#find foo in files" or selects NaturalLanguage filter:

pub struct WarpAIDataSource {
    ai_client: Arc<dyn AIClient>,
    ai_execution_context: Option<WarpAiExecutionContext>,
}

// Sync result: always shows "Translate into shell command using Warp AI"
// Async result: calls LLM API to generate actual shell commands
//   → Returns Vec<WorkflowSearchItem> (AI-generated workflows)
//   → Each is a complete shell command suggestion

// Error handling:
enum GenerateCommandsFromNaturalLanguageError {
    BadPrompt,       // "No results found"
    AiProviderError, // "Something went wrong"
    RateLimited,     // "Out of AI credits"
    Other,
}
```

---

## 4. Terminal Command Autodetection (NLD)

### 4.1 Overview

Warp's **Natural Language Detection (NLD)** automatically determines if user input is a
shell command or an AI query. This is the "magic" that lets users type in a single input box.

```
User types: "git checkout main"  → Detected as Shell ✅
User types: "how do I rebase?"   → Detected as AI    ✅
User types: "ls -la"             → Detected as Shell ✅
User types: "fix the bug"        → Detected as AI    ✅
```

### 4.2 InputType Enum

```rust
// From input_classifier crate
pub enum InputType {
    Shell,   // Execute in PTY as terminal command
    AI,      // Send to LLM as AI query
}
```

### 4.3 InputConfig State

```rust
pub struct InputConfig {
    pub input_type: InputType,  // Current detected type
    pub is_locked: bool,        // If true, autodetection disabled
}

// Lock means: user explicitly chose a mode (clicked the toggle)
// Unlock means: autodetection will run on each keystroke
```

### 4.4 BlocklistAIInputModel — The Autodetector

```rust
pub struct BlocklistAIInputModel {
    input_config: InputConfig,
    last_ai_autodetection_ts: Option<Instant>,      // When AI was last autodetected
    last_explicit_input_type_set_at: Option<Instant>, // When user manually set mode
    was_lock_set_with_empty_buffer: bool,
    autodetect_abort_handle: Option<AbortHandle>,    // Cancel in-flight detection
    model: Arc<FairMutex<TerminalModel>>,           // Terminal state access
}
```

### 4.5 Detection Algorithm (Step by Step)

```rust
fn detect_and_set_input_type(&mut self, input, completion_context, session_id, ctx) {
    // 1. GUARD: Abort previous in-flight detection
    self.abort_in_progress_detection();

    // 2. GUARD: Skip if locked or autodetection disabled
    if !self.should_run_input_autodetection(ctx) { return; }

    // 3. GUARD: Skip if user just manually set mode (250ms cooldown)
    if recently_manually_set() { return; }

    // 4. GUARD: Skip if buffer is empty
    if first_token.is_none() { return; }

    // 5. DENYLIST: Check if first token is in user's denylist
    //    (e.g. user added "python" to denylist so it's always Shell)
    if denylist.contains(first_token) {
        set_type(Shell);
        return;
    }

    // === ASYNC CLASSIFICATION (spawned as background task) ===

    // 6. STICKY AI: If currently in AI mode and first word is a common
    //    natural language word (e.g. "yes", "no", "ok", "thanks"),
    //    keep AI mode to avoid jarring switches
    if current_type == AI && is_one_off_natural_language_word(first_token) {
        return AI;
    }

    // 7. AI FOLLOW-UP: If the last block was an AI response and input
    //    looks like a follow-up ("yes", "do it", "try again"),
    //    classify as AI
    if is_agent_follow_up && is_agent_follow_up_input(buffer) {
        return AI;
    }

    // 8. HISTORY MATCH: Fuzzy-match against command history
    //    If input is ≥90% similar to a past command → Shell
    if has_any_close_matches(buffer, history_entries, 0.9) {
        return Shell;
    }

    // 9. ALIAS EXPANSION: Expand shell aliases before classification
    let expanded = expand_aliases(input, completion_context);

    // 10. ML CLASSIFIER: Run the input_classifier model
    //     Uses heuristics + optional ML to determine Shell vs AI
    let context = Context { current_input_type, is_agent_follow_up };
    let result = classifier.detect_input_type(expanded, &context);

    return result; // Shell or AI
}
```

### 4.6 Key Constants & Heuristics

```rust
const HISTORY_ENTRY_MATCH_CUTOFF: f32 = 0.9;  // 90% similarity → Shell
const AUTODETECTION_DISABLE_DURATION_MS: u64 = 250;  // Cooldown after manual toggle

// Natural language words that keep AI mode "sticky":
// "yes", "no", "ok", "thanks", "sure", "please", "help", etc.
fn is_one_off_natural_language_word(word: &str) -> bool;

// Follow-up patterns that trigger AI mode:
// "yes", "do it", "try again", "go ahead", "sounds good", etc.
fn is_agent_follow_up_input(input: &str) -> bool;
```

### 4.7 Mode Switching Behavior

```
┌─────────────────────────────────────────────────────────┐
│ User types "git che" → classifier runs → Shell detected │
│   Input decoration: syntax highlighting, completions    │
│   Submit: executes in PTY                               │
├─────────────────────────────────────────────────────────┤
│ User types "how do I" → classifier runs → AI detected   │
│   Input decoration: AI icon, no syntax highlighting     │
│   Submit: sends to LLM                                  │
├─────────────────────────────────────────────────────────┤
│ User clicks lock icon → mode locked to current          │
│   No more autodetection until user unlocks or submits   │
├─────────────────────────────────────────────────────────┤
│ User submits → mode unlocked (if autodetection enabled) │
│   Ready for next input with fresh detection             │
└─────────────────────────────────────────────────────────┘
```

### 4.8 Agent View Integration

```rust
// When entering Agent View:
EnteredAgentView => {
    if inline_mode {
        set_config(AI, locked: true);  // Always AI in inline agent
    } else {
        temporarily_disable_autodetection();  // 250ms grace period
        set_config(AI, locked: !autodetection_enabled);
    }
}

// When exiting Agent View:
ExitedAgentView => {
    set_config(Shell, locked: !nld_in_terminal_enabled);
}

// After submitting input:
handle_input_buffer_submitted => {
    if agent_in_control {
        set_config(AI, locked: true);  // Keep AI while agent is working
    } else {
        unlock_if_autodetection_enabled();  // Resume detection
    }
}
```

---

## 5. Octomus Adaptation

### 5.1 Input Classifier (Rust Backend)

```rust
// src-tauri/src/spotlight/classifier.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum InputMode {
    Shell,
    AI,
}

pub struct InputClassifier {
    /// Known shell commands (from PATH scanning)
    known_commands: HashSet<String>,
    /// User's command history
    history: Vec<String>,
    /// User-defined denylist (always Shell)
    denylist: Vec<String>,
}

impl InputClassifier {
    /// Classify input as Shell or AI
    pub fn classify(&self, input: &str) -> InputMode {
        let trimmed = input.trim();
        if trimmed.is_empty() { return InputMode::Shell; }

        let first_token = trimmed.split_whitespace().next().unwrap_or("");

        // 1. Denylist check
        if self.denylist.contains(&first_token.to_string()) {
            return InputMode::Shell;
        }

        // 2. Starts with known command → Shell
        if self.known_commands.contains(first_token) {
            return InputMode::Shell;
        }

        // 3. Starts with common shell patterns → Shell
        if Self::is_shell_pattern(trimmed) {
            return InputMode::Shell;
        }

        // 4. History fuzzy match (>90%) → Shell
        if self.history_match(trimmed) {
            return InputMode::Shell;
        }

        // 5. Contains question words / NL patterns → AI
        if Self::is_natural_language(trimmed) {
            return InputMode::AI;
        }

        // 6. Default: treat as Shell (safe default)
        InputMode::Shell
    }

    fn is_shell_pattern(input: &str) -> bool {
        let patterns = [
            "sudo ", "cd ", "mkdir ", "rm ", "cp ", "mv ", "cat ",
            "echo ", "grep ", "find ", "chmod ", "chown ", "curl ",
            "wget ", "tar ", "zip ", "ssh ", "scp ", "docker ",
            "git ", "npm ", "yarn ", "cargo ", "make ", "python ",
            "./", "/", "|", "&&", ">>", "2>&1",
        ];
        patterns.iter().any(|p| input.starts_with(p) || input.contains(p))
    }

    fn is_natural_language(input: &str) -> bool {
        let lower = input.to_lowercase();
        let nl_markers = [
            "how ", "what ", "why ", "when ", "where ", "which ",
            "can you ", "could you ", "please ", "help me ",
            "explain ", "fix ", "create ", "build ", "write ",
            "show me ", "tell me ", "i want ", "i need ",
            "?",  // Questions almost always NL
        ];
        nl_markers.iter().any(|m| lower.starts_with(m) || lower.contains(m))
    }

    fn history_match(&self, input: &str) -> bool {
        self.history.iter().any(|cmd| {
            strsim::jaro_winkler(input, cmd) > 0.9
        })
    }
}
```

### 5.2 Tauri Commands

```rust
// src-tauri/src/spotlight/mod.rs

#[tauri::command]
fn classify_input(
    state: State<'_, AppState>,
    input: String,
) -> InputMode {
    state.classifier.lock().unwrap().classify(&input)
}

#[tauri::command]
async fn search_universal(
    state: State<'_, AppState>,
    query: String,
    filter: Option<String>,  // "history:", "#", "files:", etc.
) -> Result<Vec<SearchResult>, String> {
    state.search_mixer.lock().unwrap().search(&query, filter)
}
```

### 5.3 React Hook

```tsx
// src/hooks/useInputClassifier.ts

function useInputClassifier() {
  const [mode, setMode] = useState<'shell' | 'ai'>('shell');
  const [isLocked, setIsLocked] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const classify = useCallback((input: string) => {
    if (isLocked) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const result = await invoke<'Shell' | 'AI'>('classify_input', { input });
      setMode(result === 'AI' ? 'ai' : 'shell');
    }, 100);  // 100ms debounce
  }, [isLocked]);

  const toggleLock = useCallback(() => {
    setIsLocked(prev => !prev);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'shell' ? 'ai' : 'shell');
    setIsLocked(true);  // Manual toggle locks the mode
  }, []);

  return { mode, isLocked, classify, toggleLock, toggleMode };
}
```

### 5.4 SearchMixer Simplificat (Rust)

```rust
// src-tauri/src/spotlight/search.rs

pub struct OctomusSearchMixer {
    sources: Vec<Box<dyn SearchSource>>,
}

pub trait SearchSource: Send + Sync {
    fn name(&self) -> &str;
    fn search(&self, query: &str) -> Vec<SearchResult>;
    fn filter_key(&self) -> Option<&str>;  // "history:", "files:", etc.
}

#[derive(Serialize)]
pub struct SearchResult {
    pub id: String,
    pub label: String,
    pub detail: Option<String>,
    pub icon: String,
    pub category: String,
    pub score: f64,
    pub action: SearchAction,
}

#[derive(Serialize)]
pub enum SearchAction {
    ExecuteCommand(String),
    InsertText(String),
    OpenFile(String),
    NavigateTo(String),
    SendToAI(String),
}

impl OctomusSearchMixer {
    pub fn search(&self, query: &str, filter: Option<&str>) -> Vec<SearchResult> {
        let mut results: Vec<SearchResult> = self.sources
            .iter()
            .filter(|s| {
                filter.is_none() ||
                s.filter_key() == filter ||
                s.filter_key().is_none()
            })
            .flat_map(|s| s.search(query))
            .collect();

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
        results.dedup_by(|a, b| a.id == b.id);
        results
    }
}

// Built-in sources:
// 1. CommandHistorySource — searches past commands
// 2. FileSearchSource — fuzzy file search in cwd/repo
// 3. SlashCommandSource — matches slash commands
// 4. ConversationSource — searches past AI conversations
```

### 5.5 Input Mode Indicator (React)

```tsx
// Visual feedback for autodetected mode

function ModeIndicator({ mode, isLocked, onToggle, onLock }: Props) {
  return (
    <div className="mode-indicator">
      <button
        className={`mode-pill ${mode}`}
        onClick={onToggle}
        title={isLocked ? 'Mode locked (click to toggle)' : 'Auto-detected'}
      >
        {mode === 'shell' ? (
          <><Terminal size={12} /> Shell</>
        ) : (
          <><Sparkles size={12} /> AI</>
        )}
      </button>
      <button
        className={`lock-btn ${isLocked ? 'locked' : ''}`}
        onClick={onLock}
        title={isLocked ? 'Unlock (enable auto-detection)' : 'Lock current mode'}
      >
        {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
      </button>
    </div>
  );
}
```
