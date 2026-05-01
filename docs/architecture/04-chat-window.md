# Chat Window & Advanced Features — Warp Reference & Octomus Adaptation

> Reverse-engineered din Warp AI Assistant (~130K bytes across 9 files).
> Adaptat pentru Octomus: Tauri v2 + Rust backend + React frontend.

---

## 1. Chat Window Architecture

Warp's chat window este compus din **4 componente principale** orchestrate de `AIAssistantPanelView`:

```
┌─────────────────────────────────────────┐
│ Header                                  │
│ [Warp AI Logo] [Reset] [Copy] [Close]   │
├─────────────────────────────────────────┤
│                                         │
│ Transcript (scrollable)                 │
│ ┌─────────────────────────────────────┐ │
│ │ 👤 User: How do I undo commits?    │ │
│ │ [surface_1 background]              │ │
│ ├─────────────────────────────────────┤ │
│ │ 🤖 Assistant: You can use...       │ │
│ │ ┌─────────────────────────┐        │ │
│ │ │ ```bash                 │        │ │
│ │ │ git reset --soft HEAD~1 │        │ │
│ │ │ ``` [Copy] [▶ Run] [💾] │        │ │
│ │ └─────────────────────────┘        │ │
│ │ [surface_2 background]    [📋Copy] │ │
│ ├─────────────────────────────────────┤ │
│ │ [What should I do next?]           │ │
│ │ [Show examples] [How do I fix?]    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ⚠️ AI responses can be inaccurate.      │
│ ⚠️ Warp AI might forget earlier answers │
├─────────────────────────────────────────┤
│ Editor (input, autogrow, max 300px)     │
│ [ Ask a question...                   ] │
│ Credits: 5 / 100  ·  2 hours refresh   │
├─────────────────────────────────────────┤
│ Input Suggestions (max 200px)           │
│ [Previous prompt 1]                     │
│ [Previous prompt 2]                     │
└─────────────────────────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 AIAssistantPanelView (Orchestrator)

```rust
pub struct AIAssistantPanelView {
    editor: ViewHandle<EditorView>,              // Text input
    transcript_view: ViewHandle<Transcript>,      // Chat history
    input_suggestions_view: ViewHandle<InputSuggestions>,  // Prompt autocomplete
    input_suggestions_mode: InputSuggestionsMode, // Open { origin } | Closed
    requests_model: ModelHandle<Requests>,         // Request lifecycle
    focus_state: PanelFocusState,                  // Editor | Transcript
    resizable_state_handle: ResizableStateHandle,  // Panel width
    mouse_state_handles: MouseStateHandles,        // UI hover states
}
```

**Constants:**
```rust
const MIN_PANEL_WIDTH: f32 = 300.;
const MIN_REMAINING_WINDOW_SIZE: f32 = 200.;
const MAX_EDITOR_HEIGHT: f32 = 300.;
const MAX_INPUT_SUGGESTIONS_HEIGHT: f32 = 200.;
const BODY_FONT_SIZE: f32 = 13.;
const TITLE_FONT_SIZE: f32 = 16.;
const PROMPT_CHARACTER_LIMIT: usize = 1000;  // ~250 tokens
```

**Actions:**
```rust
pub enum AIAssistantAction {
    ClosePanel,
    ResetContext,              // Ctrl+L or Cmd+Shift+K
    CopyTranscript,
    PreparedPrompt(&'static str),
    ClickedUrl(HyperlinkUrl),
    CopyAnswerToClipboard(Arc<String>),
    FocusTerminalInput,        // Cmd+Shift+L
    FocusEditor,
}
```

### 2.2 Transcript (Chat History Renderer)

```rust
pub struct Transcript {
    requests_model: ModelHandle<Requests>,
    selected_code_block: Option<CodeBlockIndex>,  // Keyboard-navigable
    clipped_scroll_state: ClippedScrollStateHandle,
}
```

**Keyboard Navigation for Code Blocks:**
| Key | Action |
|-----|--------|
| `↓` | Select next code block |
| `↑` | Select previous code block |
| `Cmd+↓` | Deselect, scroll to bottom, focus editor |
| `Cmd+C` | Copy selected code block |
| `Cmd+Enter` | Paste code into terminal input |
| `Cmd+S` | Save as workflow |
| `Escape` | Deselect, focus editor |

**Code Block Actions (per block):**
```
┌──────────────────────────────────────────┐
│ git reset --soft HEAD~1                  │
│                                          │
│              [📋 Copy] [▶ Run] [💾 Save] │
└──────────────────────────────────────────┘
```

- **Copy** — copies code to clipboard
- **Run** — pastes into terminal input (only for `sh`/`bash`/`zsh` blocks)
- **Save as Workflow** — opens workflow modal (only for shell blocks)

### 2.3 Requests (State Machine)

```rust
pub struct Requests {
    server_api: Arc<ServerApi>,
    ai_client: Arc<dyn AIClient>,
    request_status: RequestStatus,
    request_limit_info: RequestLimitInfo,
    current_transcript: Vec<TranscriptPart>,
    current_transcript_summarized: bool,
    old_transcript_parts: Vec<TranscriptPart>,  // Kept after Reset
    ai_execution_context: Option<WarpAiExecutionContext>,
}

pub enum RequestStatus {
    NotInFlight,
    InFlight {
        request: FormattedTranscriptMessage,
        abort_handle: AbortHandle,
    },
}
```

**Request Lifecycle:**
```
1. User types prompt, presses Enter
2. Validate: not empty, not over 1000 chars
3. Parse prompt → markdown segments
4. Set RequestStatus::InFlight { request, abort_handle }
5. Async: server_api.generate_dialogue_answer(transcript, prompt, context)
6. On response:
   a. Success → parse markdown → push TranscriptPart
   b. Rate limited → show upgrade link
   c. Error → show generic error message
7. Cache updated RequestLimitInfo
8. Set RequestStatus::NotInFlight
9. Emit Event::RequestFinished
```

### 2.4 TranscriptPart (Message Pair)

```rust
/// Every question MUST have an answer — enforced by structure.
pub struct TranscriptPart {
    pub user: FormattedTranscriptMessage,
    pub assistant: AssistantTranscriptPart,
}

pub struct AssistantTranscriptPart {
    pub is_error: bool,
    pub formatted_message: FormattedTranscriptMessage,
    pub copy_all_tooltip_and_button_mouse_handles: Option<(MouseStateHandle, MouseStateHandle)>,
}

pub struct FormattedTranscriptMessage {
    pub markdown: Option<Vec<MarkdownSegment>>,  // Parsed markdown
    pub raw: String,                              // Fallback plain text
}
```

### 2.5 Markdown Parsing Pipeline

```rust
pub enum MarkdownSegment {
    CodeBlock {
        index: CodeBlockIndex,           // Unique ID for navigation
        code: CodeBlockText,             // { code, lang }
        mouse_state_handles: CodeBlockMouseStateHandles,
    },
    Other {
        formatted_text: FormattedText,   // Rich text (bold, italic, links)
        highlighted_hyperlink: HighlightedHyperlink,
    },
}

pub struct CodeBlockIndex {
    transcript_part_index: usize,        // Which Q&A pair
    transcript_part_type: TranscriptPartSubType,  // Question | Answer
    code_block_index: usize,             // Which code block within
}
```

**Parsing Flow:**
```
Raw text → parse_markdown() → FormattedText { lines: Vec<FormattedTextLine> }
                                    │
                                    ▼
                    translate_formatted_text_into_markdown_segments()
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                    CodeBlock             Non-code text
                    (extracted)           (contiguous chunks)
```

---

## 3. AskAI Entry Points

Warp permite deschiderea AI-ului din multiple contexte:

```rust
pub enum AskAIType {
    FromTextSelection {           // Ctrl+Shift+Space on selected text
        text: Arc<String>,
        populate_input_box: bool, // Auto-fills "Explain the following:\n```"
    },
    FromBlock {                   // Right-click on command block
        input: Arc<String>,       // The command
        output: Arc<String>,      // The output
        exit_code: ExitCode,      // Success → "What next?" / Fail → "How to fix?"
        block_index: BlockIndex,
    },
    FromBlocks {                  // Multiple blocks selected
        block_indices: HashSet<BlockIndex>,
    },
    FromAICommandSearch {         // Natural language → command
        query: Arc<String>,
    },
}
```

**Smart truncation:**
- Input > 1000 chars → truncate with `...`
- Block input > 100 chars → truncate input, keep more output
- Output truncated from **beginning** (last output is most relevant)

---

## 4. Execution Context

Every AI request includes terminal context:

```rust
pub struct WarpAiExecutionContext {
    pub os: WarpAiOsContext,         // { category, distribution }
    pub shell_name: String,          // "zsh", "bash", "fish"
    pub shell_version: Option<String>,
}
```

---

## 5. Agent Mode — Advanced Output Types

Beyond simple Q&A chat, Warp's agent mode supports rich output:

```rust
pub enum AIAgentOutputMessageType {
    Text(AIAgentText),                              // Markdown text
    Reasoning { text, finished_duration },           // Chain-of-thought
    Summarization { text, duration, type, tokens },  // Context compression
    Action(AIAgentAction),                           // Tool calls
    TodoOperation(TodoOperation),                    // Task list updates
    WebSearch(WebSearchStatus),                      // Web search results
    WebFetch(WebFetchStatus),                        // URL content fetch
    Subagent(SubagentCall),                          // Child agent spawn
    CommentsAddressed { comments },                  // Code review
    ArtifactCreated(ArtifactCreatedData),            // PR, screenshot, file
    SkillInvoked(InvokedSkill),                      // Skill execution
    MessagesReceivedFromAgents { messages },         // Multi-agent comms
    EventsFromAgents { event_ids },                  // Agent lifecycle events
    DebugOutput { text },                            // Dev-only debug
}
```

### 5.1 Tool Actions

```rust
pub struct AIAgentAction {
    pub id: AIAgentActionId,
    pub task_id: TaskId,
    pub action: AIAgentActionType,
    pub requires_result: bool,  // Must send result back to AI
}

// Key action types (extracted from codebase):
// - RequestCommandOutput { command, wait_until_completion }
// - RequestFileEdits { file_path, edits }
// - ReadFiles { file_paths }
// - SearchCodebase { query }
// - Grep { pattern, path }
// - FileGlob { pattern }
// - WriteToLongRunningShellCommand { command_id, input }
// - ReadShellCommandOutput { command_id }
// - UploadArtifact { filepath, mime_type }
// - ReadDocuments / EditDocuments / CreateDocuments
// - ReadMCPResource / CallMCPTool
// - SuggestNewConversation / SuggestPrompt
```

### 5.2 Action Results

Every action produces a result sent back to the LLM:

```rust
pub struct AIAgentActionResult {
    pub id: AIAgentActionId,
    pub task_id: TaskId,
    pub result: AIAgentActionResultType,
}

// Result types include: Success, Cancelled, Error variants for each action
```

### 5.3 Exchange Model (Agent Mode)

```rust
pub struct AIAgentExchange {
    pub id: AIAgentExchangeId,
    pub input: Vec<AIAgentInput>,
    pub output_status: AIAgentOutputStatus,
    pub added_message_ids: HashSet<MessageId>,
    pub start_time: DateTime<Local>,
    pub finish_time: Option<DateTime<Local>>,
    pub time_to_first_token_ms: Option<i64>,
    pub working_directory: Option<String>,
    pub model_id: LLMId,
    pub request_cost: Option<RequestCost>,
    pub coding_model_id: LLMId,
    pub cli_agent_model_id: LLMId,
    pub computer_use_model_id: LLMId,
    pub response_initiator: Option<ParticipantId>,
}

pub enum FinishedAIAgentOutput {
    Success { output: Shared<AIAgentOutput> },
    Error { output: Option<...>, error: RenderableAIError },
    Cancelled { output: Option<...>, reason: CancellationReason },
}
```

### 5.4 Cancellation Reasons

```rust
pub enum CancellationReason {
    ManuallyCancelled,
    FollowUpSubmitted { is_for_same_conversation: bool },
    UserCommandExecuted,
    Reverted,
    Deleted,
    OptimisticCLISubagentCompletion,  // LRC finished while streaming
}
```

---

## 6. Prepared Responses (Quick Actions)

After each AI response, Warp shows contextual follow-up buttons:

```rust
const HOW_DO_I_FIX_PROMPT: &str = "How do I fix this?";
const SHOW_EXAMPLES_PROMPT: &str = "Show examples.";
const WHAT_TO_DO_NEXT_PROMPT: &str = "What should I do next?";
```

These are rendered as pill buttons with accent-colored borders that fill on hover.

---

## 7. Rate Limiting & Credits

```rust
pub struct RequestLimitInfo {
    pub is_unlimited: bool,
    pub limit: usize,
    pub num_requests_used_since_refresh: usize,
    pub next_refresh_time: DateTime<Utc>,
    pub request_limit_refresh_duration: RequestLimitRefreshDuration,
    // Voice, codebase indexing limits...
}

pub enum RequestLimitRefreshDuration {
    Monthly,
    Weekly,
    EveryTwoWeeks,
}
```

**Display logic:**
- Show "Credits used: X / Y" always
- Show ⚠️ warning icon when ≤ 10 remaining
- Show 🔺 error icon when 0 remaining
- Show "Z hours until refresh" when applicable
- Rate limit info cached in UserDefaults between sessions

---

## 8. Input Suggestions (Prompt History)

When cursor is on first row and user presses `↑`:

```rust
enum InputSuggestionsMode {
    Open { origin_buffer_text: String },  // Remembers what user typed
    Closed,
}
```

- Fuzzy substring search over all past prompts (current + old transcripts)
- Max height: 200px
- Selecting a suggestion replaces editor content
- Pressing Escape restores original text

---

## 9. Zero State (Empty Chat)

When no transcript exists, Warp shows example prompts:

```rust
const SCRIPT_ZERO_STATE_PROMPT: &str = "Write a script to connect to an AWS EC2 instance.";
const GIT_ZERO_STATE_PROMPT: &str = "How do I undo the most recent commits in git?";
const FILES_ZERO_STATE_PROMPT: &str = "How do I find all files containing specific text?";
const ZERO_STATE_HELP_TEXT: &str = "Shift + ctrl + space a block or text selection to ask Warp AI.";
```

---

## 10. Interesting Features for Octomus

### 10.1 Features to Implement (High Value)

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Code Block Actions** | Copy / Run in terminal / Save as workflow per code block | Medium |
| **Keyboard Code Navigation** | ↑/↓ between code blocks, Cmd+Enter to execute | Medium |
| **Execution Context** | Auto-inject OS/shell/cwd into every prompt | Low |
| **Smart Truncation** | Intelligent prompt truncation (keep end of output) | Low |
| **Prepared Responses** | Contextual follow-up buttons | Low |
| **Input History** | Fuzzy search over past prompts with ↑ arrow | Medium |
| **Markdown Rendering** | Split text/code, syntax highlight, clickable links | Medium |
| **Zero State** | Example prompts for empty chat | Low |
| **Rate Limiting UI** | Credits display, refresh countdown, upgrade prompt | Low |
| **Streaming Responses** | Token-by-token rendering with abort capability | High |

### 10.2 Advanced Features (Phase 2+)

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Tool Calling** | Agent executes commands, reads/edits files | High |
| **Web Search** | Search + fetch web content inline | Medium |
| **Reasoning Display** | Show chain-of-thought with duration timer | Medium |
| **Summarization** | Auto-compress long conversations | High |
| **Multi-model** | Different models for coding/CLI/general | Medium |
| **Code Review** | PR comment addressing workflow | High |
| **Subagent Spawning** | Child agents for parallel tasks | Very High |
| **Multi-agent Messaging** | Agents communicate with each other | Very High |
| **Todo Lists** | Agent-managed task lists in conversation | Medium |
| **Artifacts** | PR creation, file upload, screenshots | High |

### 10.3 Unique Octomus Opportunities

| Feature | Warp Doesn't Have | Why Valuable |
|---------|-------------------|-------------|
| **Inline Terminal** | Warp AI is a side panel; terminal is separate | Octomus can embed terminal output directly in chat |
| **Code Editor Integration** | Warp edits via file diffs | Octomus can show Monaco diffs inline |
| **Multi-provider** | Warp is server-proxied | Direct API calls = user's own keys |
| **Plugin System** | Warp has MCP | Octomus can add custom tools via Tauri plugins |
| **Offline Mode** | Warp requires server | Local LLM support via Ollama |

---

## 11. Octomus Implementation

### 11.1 React Components

```tsx
// src/components/ChatWindow.tsx — Main orchestrator
interface ChatWindowProps {
  isVisible: boolean;
  onClose: () => void;
}

interface ChatState {
  messages: Message[];
  status: 'idle' | 'streaming' | 'error';
  selectedCodeBlock: CodeBlockId | null;
  inputHistory: string[];
  historyIndex: number;
}

// src/components/Transcript.tsx — Message list
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;            // Raw markdown
  segments: MarkdownSegment[];  // Parsed
  isError: boolean;
  timestamp: Date;
  modelId?: string;
  cost?: number;
}

// src/components/CodeBlock.tsx — Interactive code block
interface CodeBlockProps {
  code: string;
  language: string;
  isSelected: boolean;
  onCopy: () => void;
  onRun: () => void;     // Only for shell languages
  onSave: () => void;
}

// src/components/PreparedResponses.tsx — Follow-up buttons
const PREPARED_RESPONSES = [
  "What should I do next?",
  "Show examples.",
  "How do I fix this?",
] as const;
```

### 11.2 Tauri Commands (Rust Backend)

```rust
// src-tauri/src/chat/mod.rs

#[tauri::command]
async fn send_message(
    state: State<'_, AppState>,
    prompt: String,
    context: ExecutionContext,
) -> Result<String, String> {
    // Returns message_id, starts streaming via events
}

#[tauri::command]
async fn cancel_stream(
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Aborts current stream
}

#[tauri::command]
async fn reset_conversation(
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Archives current transcript, starts fresh
}

#[tauri::command]
async fn execute_code_in_terminal(
    state: State<'_, AppState>,
    code: String,
) -> Result<(), String> {
    // Writes code to active PTY session
}

#[tauri::command]
fn get_execution_context(
    state: State<'_, AppState>,
) -> ExecutionContext {
    ExecutionContext {
        os: std::env::consts::OS.to_string(),
        shell: std::env::var("SHELL").unwrap_or_default(),
        cwd: std::env::current_dir().ok().map(|p| p.display().to_string()),
    }
}
```

### 11.3 Streaming Architecture

```
User types prompt
       │
       ▼
React: invoke("send_message", { prompt, context })
       │
       ▼
Rust: spawn async → reqwest SSE stream to LLM API
       │
       ├── Token received → app.emit("chat:chunk", { id, text })
       ├── Tool call → app.emit("chat:tool_call", { id, tool, args })
       ├── Done → app.emit("chat:done", { id, usage })
       └── Error → app.emit("chat:error", { id, error })
       
React: listen("chat:chunk") → append to message, re-parse markdown
React: listen("chat:done") → set status = idle, show prepared responses
```

### 11.4 Markdown Parsing (React)

```tsx
// src/utils/markdown.ts
import { marked } from 'marked';
import hljs from 'highlight.js';

interface ParsedSegment {
  type: 'text' | 'code';
  content: string;
  language?: string;
  id: string;
}

function parseMarkdownSegments(raw: string): ParsedSegment[] {
  // Split markdown into alternating text/code segments
  // Code blocks get unique IDs for keyboard navigation
  // Text blocks get rendered as HTML via marked
}

function isShellLanguage(lang: string): boolean {
  return ['sh', 'bash', 'zsh', 'shell', 'fish'].includes(lang.toLowerCase());
}
```
