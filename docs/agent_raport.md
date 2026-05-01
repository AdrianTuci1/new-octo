# Raport de Extracție: Warp Agent Logic → Octomus

> **Data:** 2026-05-02  
> **Scop:** Maparea completă a funcționalităților din `warp/app/src/ai` și `warp/app/src/ai_assistant` care pot fi preluate/adaptate pentru sistemul de agenți din Octomus Launcher.

---

## 1. Rezumat Executiv

Warp implementează un sistem de agenți sofisticat, compus din:
- **Agent SDK** (CLI driver) — orchestrare headless, harness-uri externe (Oz, Claude Code)
- **Agent Core** — tipuri de date, conversații, task-uri, exchange-uri, output streaming
- **Agent Events** — event-driven SSE reconnecting driver
- **MCP** (Model Context Protocol) — integrare servere externe de tools
- **Skills** — sistem de plugin-uri declarative (SKILL.md)
- **LLM Preferences** — model catalog dinamic cu fallback/override per pane
- **AI Assistant** (legacy side-panel) — transcript simplu Q&A

Din perspectiva Octomus, ne interesează **5 axe principale** de preluare, descrise în detaliu mai jos.

---

## 2. Inventar Complet al Modulelor Warp

### 2.1 `app/src/ai/` — Modulul Principal AI

| Submodul | Fișiere principale | Dimensiune | Relevanță Octomus |
|---|---|---|---|
| `agent/mod.rs` | Tipuri de date ale agentului | 104KB | ⭐⭐⭐ CRITICE |
| `agent/conversation.rs` | Model de conversație | 152KB | ⭐⭐⭐ CRITICE |
| `agent/task.rs` | Task model (tree de subagenti) | 36KB | ⭐⭐ UTIL |
| `agent/api/` | Conversia API ↔ client types | 300KB+ | ⭐ LOW |
| `agent/conversation_yaml.rs` | YAML persistence | 47KB | ⭐ LOW |
| `agent/redaction.rs` | Redactare date sensibile | 18KB | ⭐⭐ UTIL |
| `agent/linearization.rs` | Linearizare task tree | 4KB | ⭐ LOW |
| `agent_sdk/mod.rs` | CLI entry point | 62KB | ⭐⭐ UTIL |
| `agent_sdk/driver.rs` | Agent Driver orchestration | 102KB | ⭐⭐⭐ CRITICE |
| `agent_sdk/output.rs` | Output formatting (JSON/table/jq) | 11KB | ⭐⭐ UTIL |
| `agent_sdk/retry.rs` | Retry cu exponential backoff | 2.5KB | ⭐⭐⭐ DIRECT COPIABIL |
| `agent_events/driver.rs` | SSE reconnecting event stream | 13KB | ⭐⭐⭐ DIRECT COPIABIL |
| `agent_events/message_hydrator.rs` | Hydratare mesaje agent | 4KB | ⭐⭐ UTIL |
| `llms.rs` | LLM catalog + preferences | 40KB | ⭐⭐⭐ CRITICE |
| `mcp/` | Model Context Protocol (18 fișiere) | ~180KB | ⭐⭐ UTIL |
| `skills/` | Skill manager + resolution | ~100KB | ⭐⭐ UTIL (viitor) |
| `execution_profiles/` | Profile de execuție AI | ~90KB | ⭐ LOW |
| `ambient_agents/` | Background/scheduled agents | ~100KB | ⭐ LOW |
| `artifacts/` | Artifact management (PR, plan) | ~25KB | ⭐ LOW |
| `facts/` | Knowledge/facts manager | ~6KB | ⭐ LOW |
| `cloud_agent_config/` | Remote agent config | varies | ⭐ LOW |
| `cloud_environments/` | Sandboxed environments | varies | ⭐ LOW |

### 2.2 `app/src/ai_assistant/` — Legacy Side-Panel

| Fișier | Dimensiune | Relevanță |
|---|---|---|
| `mod.rs` | 6KB | ⭐ LOW — tipuri vechi |
| `execution_context.rs` | 1.3KB | ⭐⭐⭐ DIRECT COPIABIL |
| `requests.rs` | 18KB | ⭐⭐ UTIL — request lifecycle |
| `transcript.rs` | 36KB | ⭐⭐ UTIL — model transcript |
| `utils.rs` | 16KB | ⭐⭐ UTIL — markdown parsing |
| `panel.rs` | 45KB | ⭐ LOW — UI-specific |

---

## 3. Ce Avem Deja în Octomus vs. Ce Lipsește

### ✅ Ce Avem

| Funcționalitate | Fișier Octomus | Status |
|---|---|---|
| Harness trait + event sink | `harness.rs` | ✅ Complet |
| OpenAI-compatible streaming | `openai.rs` | ✅ Complet |
| Scripted fallback harness | `scripted.rs` | ✅ Complet |
| Run snapshot + lifecycle | `manager.rs` + `types.rs` | ✅ Complet |
| Tauri IPC commands | `mod.rs` | ✅ Complet |
| Tool calls (propose_terminal_command) | `openai.rs` | ✅ De bază |
| AgentCancellation (atomic flag) | `harness.rs` | ✅ Complet |

### ❌ Ce Lipsește

| Funcționalitate | Sursă Warp | Prioritate | Complexitate |
|---|---|---|---|
| **Retry cu exponential backoff** | `agent_sdk/retry.rs` | P0 | Simplă |
| **Reconnecting event stream** | `agent_events/driver.rs` | P0 | Medie |
| **Conversation model persistent** | `agent/conversation.rs` | P0 | Mare |
| **Exchange-based output streaming** | `agent/mod.rs` | P1 | Medie |
| **LLM Catalog + dynamic model list** | `llms.rs` | P1 | Medie |
| **Execution context (OS/shell)** | `execution_context.rs` | P1 | Simplă |
| **Action types + result types** | `agent/mod.rs` | P1 | Medie |
| **Redaction engine** | `agent/redaction.rs` | P2 | Medie |
| **MCP server integration** | `mcp/` | P2 | Mare |
| **Skills system** | `skills/` | P3 | Mare |
| **Multi-agent orchestration** | `agent_sdk/driver.rs` | P3 | Foarte mare |
| **Task tree + subagent model** | `agent/task.rs` | P3 | Mare |

---

## 4. Fișiere Direct Copiabile (Modulare)

Aceste fișiere pot fi copiate aproape ca atare, cu adaptări minime (înlocuire warpui → tokio/tauri):

### 4.1 `retry.rs` — Bounded Exponential Backoff

**Entry point:** `with_bounded_retry(operation, attempt_fn) -> Result<T>`

```
Config:
  MAX_ATTEMPTS = 3
  INITIAL_BACKOFF = 500ms
  BACKOFF_FACTOR = 2.0
  BACKOFF_JITTER = 0.3
```

**Adaptare necesară:**
- `warpui::r#async::Timer` → `tokio::time::sleep`
- `warpui::duration_with_jitter` → implementare locală (trivială)
- `is_transient_http_error` → mapare pe `reqwest::Error`

### 4.2 `agent_events/driver.rs` — Reconnecting SSE Stream

**Entry point:** `run_agent_event_driver(source, config, consumer) -> Result<()>`

**Arhitectură:**
```
AgentEventSource (trait)
  └── open_stream(run_ids, since_sequence) -> BoxStream<Result<Item>>

AgentEventConsumer (trait)
  ├── on_event(event) -> ControlFlow
  ├── persist_cursor(sequence) -> Result<()>
  └── on_driver_state(state) -> Result<()>

AgentEventDriverConfig
  ├── run_ids: Vec<String>
  ├── since_sequence: i64
  ├── reconnect_backoff_steps: [1, 2, 5, 10] seconds
  ├── proactive_reconnect_after: 14 minutes
  └── failures_before_error_log: 5
```

**Adaptare necesară:**
- `warpui::r#async::Timer` → `tokio::time::sleep`
- Eliminare `cfg(target_family = "wasm")`
- `futures::stream::BoxStream` → rămâne

### 4.3 `execution_context.rs` — Runtime Context

**Entry point:** `WarpAiExecutionContext::new(session) -> Self`

```rust
pub struct WarpAiExecutionContext {
    pub os: WarpAiOsContext,       // { category, distribution }
    pub shell_name: String,
    pub shell_version: Option<String>,
}
```

**Adaptare necesară:**
- Eliminare dependință `Session` → populare directă din `std::env`/`sysinfo`

### 4.4 `message_hydrator.rs` — Message Fetch + Delivery ACK

**Entry point:** `MessageHydrator::hydrate_event_for_recipient(event, run_id)`

**Adaptare necesară:**
- `AIClient` trait → implementare Octomus `reqwest`-based

---

## 5. Funcționalități de Adaptat (Nu Copiabile Direct)

### 5.1 Conversation Model — `conversation.rs`

Warp's `AIConversation` este un model complex cu ~3700 linii. Conceptele cheie de extras:

```
AIConversation
  ├── id: AIConversationId (UUID)
  ├── task_store: TaskStore (arbore de task-uri)
  ├── todo_lists: Vec<AIAgentTodoList>
  ├── status: ConversationStatus
  │   ├── InProgress
  │   ├── Success
  │   ├── Cancelled
  │   └── Error
  ├── server_conversation_token: Option<String>
  ├── autoexecute_override: AIConversationAutoexecuteMode
  ├── artifacts: Vec<Artifact>
  ├── total_request_cost: RequestCost
  └── conversation_usage_metadata: ConversationUsageMetadata
      ├── was_summarized: bool
      ├── context_window_usage: f32
      ├── credits_spent: f32
      └── token_usage: Vec<ModelTokenUsage>
```

**Ce trebuie implementat în Octomus:**
1. Model `OctomusConversation` simplu cu `Vec<Exchange>` + metadata
2. Persistence locală SQLite/JSON
3. Status tracking (InProgress, Completed, Cancelled, Error)

### 5.2 Exchange-Based Streaming — `agent/mod.rs`

Warp modelează outputul ca un flux de exchanges:

```
AIAgentExchange
  ├── id: AIAgentExchangeId
  ├── input: Vec<AIAgentInput>
  ├── output_status: AIAgentOutputStatus
  │   ├── Streaming { output: Option<Shared<AIAgentOutput>> }
  │   └── Finished { finished_output: FinishedAIAgentOutput }
  ├── start_time, finish_time
  ├── model_id: Option<LLMId>
  └── request_cost: Option<RequestCost>

AIAgentOutput
  ├── messages: Vec<AIAgentOutputMessage>
  │   ├── Text(AIAgentText)
  │   ├── Action(AIAgentAction)
  │   ├── Reasoning { text, is_redacted }
  │   ├── WebSearch(url)
  │   ├── SkillInvoked(descriptor)
  │   ├── TodoOperation(op)
  │   ├── Subagent(call)
  │   └── DebugOutput { text }
  ├── citations: Vec<AIAgentCitation>
  ├── server_output_id: Option<ServerOutputId>
  ├── suggestions: Option<Suggestions>
  ├── model_info: Option<OutputModelInfo>
  └── request_cost: Option<RequestCost>
```

**Ce trebuie implementat în Octomus:**
1. Wrapping `AgentTokenEvent` existent într-un Exchange model
2. Output type enum cu Text + Action + Reasoning

### 5.3 Action System — Tool Call Taxonomy

Warp definește un set complet de acțiuni AI:

```
AIAgentActionType
  ├── RequestCommandOutput { command, wait_until_completion }
  ├── RequestFileEdits { file_path, edits }
  ├── ReadFiles { file_paths }
  ├── SearchCodebase { query }
  ├── Grep { pattern, path }
  ├── FileGlob { patterns }
  ├── WriteToLongRunningShellCommand { input, command_id }
  ├── ReadDocuments { document_ids }
  ├── EditDocuments { edits }
  ├── CreateDocuments { documents }
  ├── UploadArtifact { file_path }
  └── ReadShellCommandOutput { command_id }
```

**Ce trebuie implementat în Octomus:**
- Momentan avem doar `propose_terminal_command`
- Extindere cu `RequestFileEdits`, `ReadFiles`, `Grep` minim

### 5.4 LLM Catalog — `llms.rs`

```
LLMPreferences (singleton)
  ├── models_by_feature: ModelsByFeature
  │   ├── agent_mode: AvailableLLMs
  │   ├── coding: AvailableLLMs
  │   ├── cli_agent: Option<AvailableLLMs>
  │   └── computer_use: Option<AvailableLLMs>
  └── base_llm_for_terminal_view: HashMap<ViewId, LLMId>

LLMInfo
  ├── display_name, base_model_name
  ├── id: LLMId
  ├── reasoning_level: Option<String>
  ├── usage_metadata: { request_multiplier, credit_multiplier }
  ├── provider: LLMProvider { OpenAI, Anthropic, Google, Xai }
  ├── host_configs: HashMap<Host, RoutingHostConfig>
  ├── context_window: { min, max, default_max, is_configurable }
  └── disable_reason: Option<DisableReason>
```

**Ce trebuie implementat în Octomus:**
1. Model `OctomusLLMCatalog` cu lista de modele disponibile
2. Cache local + refresh de la server (sau hardcoded initial)
3. Provider enum: OpenAI, Anthropic, Google, Local

### 5.5 Agent Driver — Orchestration Loop

Warp's `AgentDriver` (102KB) gestionează ciclul complet:

```
AgentDriver::run(task)
  1. Verificare autentificare
  2. Setup MCP servers (timeout 60s)
  3. Setup environment
  4. Bootstrap terminal session
  5. Submit query → stream response
  6. Wait for completion / idle timeout
  7. Snapshot upload
  8. Cleanup
```

**Ce trebuie implementat în Octomus:**
- Echivalent simplificat: `OctomusAgentLoop`
  1. Validate provider config
  2. Build conversation context
  3. Submit → stream via SSE/WebSocket
  4. Handle tool calls → auto-execute or wait approval
  5. Resume loop until done
  6. Persist conversation

---

## 6. Plan de Implementare Recomandat

### Faza 1: Fundații (P0) — ~2-3 zile

| # | Task | Sursa Warp | Fișier Octomus |
|---|---|---|---|
| 1 | Port `retry.rs` | `agent_sdk/retry.rs` | `src-tauri/src/ai/retry.rs` |
| 2 | Port `execution_context.rs` | `ai_assistant/execution_context.rs` | `src-tauri/src/ai/context.rs` |
| 3 | Creare model `Conversation` | `agent/conversation.rs` (simplificat) | `src-tauri/src/ai/conversation.rs` |
| 4 | Extindere `AgentRunStatus` cu `Blocked` | `agent_sdk/driver.rs` | `src-tauri/src/ai/types.rs` |
| 5 | Adăugare `CancellationReason` enum | `agent/mod.rs` | `src-tauri/src/ai/types.rs` |

### Faza 2: Streaming Robust (P1) — ~3-4 zile

| # | Task | Sursa Warp | Fișier Octomus |
|---|---|---|---|
| 6 | Port `AgentEventDriver` (SSE reconnect) | `agent_events/driver.rs` | `src-tauri/src/ai/event_driver.rs` |
| 7 | Implementare Exchange model | `agent/mod.rs` | `src-tauri/src/ai/exchange.rs` |
| 8 | LLM catalog local | `llms.rs` | `src-tauri/src/ai/llm_catalog.rs` |
| 9 | Output type system (Text/Action/Reasoning) | `agent/mod.rs` | `src-tauri/src/ai/output.rs` |
| 10 | Error classification + renderable errors | `agent/mod.rs` | `src-tauri/src/ai/errors.rs` |

### Faza 3: Tool System Extins (P2) — ~5-7 zile

| # | Task | Sursa Warp |
|---|---|---|
| 11 | Action types: ReadFiles, RequestFileEdits, Grep | `agent/mod.rs` |
| 12 | Action result types + rendering | `agent/mod.rs` |
| 13 | Redaction engine (PII/secrets) | `agent/redaction.rs` |
| 14 | MCP protocol basic support | `mcp/mod.rs` |

### Faza 4: Avansate (P3) — viitor

| # | Task |
|---|---|
| 15 | Multi-agent task tree |
| 16 | Skills system |
| 17 | Ambient/scheduled agents |
| 18 | Cloud environments |

---

## 7. Mapare Tip-uri de Date: Warp → Octomus

```
Warp                              →  Octomus (existent sau nou)
────────────────────────────────────────────────────────────────
AIConversationId                  →  conversation_id: String ✅
AIAgentExchangeId                 →  (NOU) exchange_id: String
AIAgentOutput                     →  (NOU) OctomusAgentOutput
AIAgentOutputMessage              →  AgentTokenEvent ✅ (partial)
AIAgentOutputStatus::Streaming    →  AgentRunStatus::Running ✅
AIAgentOutputStatus::Finished     →  AgentRunStatus::Completed ✅
CancellationReason                →  (NOU) CancellationReason
RenderableAIError                 →  (NOU) AgentError (enum)
AIAgentAction                     →  AgentToolCall ✅ (partial)
AIAgentActionResult               →  AgentToolResultEvent ✅ (partial)
AIAgentActionType                 →  (NOU) enum extins
AIAgentText                       →  text: String ✅ (simplificat)
ProgrammingLanguage               →  (NOU) dacă adăugăm code blocks
LLMId                             →  model_id: String ✅
LLMInfo                           →  (NOU) OctomusModelInfo
LLMProvider                       →  (NOU) enum {OpenAI, Anthropic, etc}
RequestCost                       →  (NOU) f64 wrapper
ServerOutputId                    →  (NOU) server_output_id: String
Shared<T>                         →  Arc<RwLock<T>> ✅ (pattern existent)
AgentHarness (Warp)               →  AgentHarness (Octomus) ✅ IDENTIC
AgentEventSink (Warp)             →  AgentEventSink (Octomus) ✅ IDENTIC
WarpAiExecutionContext            →  (NOU) OctomusExecutionContext
```

---

## 8. Diagrame de Arhitectură

### 8.1 Flow-ul actual Octomus (simplificat)

```
Frontend (React)
    │
    ├── agent_start(prompt) ──→ Tauri Command
    │                              │
    │                              ├── Create AgentRunSnapshot
    │                              ├── Select Harness (OpenAI / Scripted)
    │                              ├── harness.run_async(ctx, sink, cancel)
    │                              │       │
    │                              │       ├── Stream tokens via SSE
    │                              │       ├── Parse tool_calls
    │                              │       └── Emit events via Tauri Window
    │                              │
    │                              └── sink.done() / sink.error()
    │
    ├── agent:token ←── (event listener)
    ├── agent:tool_call ←── (event listener)  
    ├── agent:done ←── (event listener)
    └── agent:error ←── (event listener)
```

### 8.2 Flow-ul țintă Octomus (cu funcționalități Warp)

```
Frontend (React)
    │
    ├── agent_start(prompt, conversation_id?) ──→ Tauri Command
    │                                              │
    │   ┌──────────────────────────────────────────┤
    │   │                                          │
    │   │  ┌─ OctomusAgentLoop ─────────────────┐  │
    │   │  │                                     │  │
    │   │  │  1. Load/Create Conversation        │  │
    │   │  │  2. Build ExecutionContext           │  │
    │   │  │  3. Resolve LLM from Catalog        │  │
    │   │  │  4. Select Harness                  │  │
    │   │  │                                     │  │
    │   │  │  ┌─ Exchange Loop ───────────────┐  │  │
    │   │  │  │                               │  │  │
    │   │  │  │  harness.run_async()          │  │  │
    │   │  │  │      │                        │  │  │
    │   │  │  │      ├─→ Token streaming      │  │  │
    │   │  │  │      ├─→ Tool calls           │  │  │
    │   │  │  │      │    ├─ Auto-execute?    │  │  │
    │   │  │  │      │    └─ Wait approval    │  │  │
    │   │  │  │      ├─→ Reasoning blocks     │  │  │
    │   │  │  │      └─→ Citations            │  │  │
    │   │  │  │                               │  │  │
    │   │  │  │  with_bounded_retry()         │  │  │
    │   │  │  │      on transient failures    │  │  │
    │   │  │  │                               │  │  │
    │   │  │  └───────────────────────────────┘  │  │
    │   │  │                                     │  │
    │   │  │  5. Persist Conversation            │  │
    │   │  │  6. Report usage metrics            │  │
    │   │  └─────────────────────────────────────┘  │
    │   │                                          │
    │   └──────────────────────────────────────────┘
    │
    ├── agent:token ←── (event)
    ├── agent:tool_call ←── (event)
    ├── agent:tool_result ←── (event)
    ├── agent:reasoning ←── (NOU)
    ├── agent:exchange_start ←── (NOU)
    ├── agent:exchange_end ←── (NOU)
    ├── agent:done ←── (event)
    └── agent:error ←── (event)
```

---

## 9. Pattern-uri Cheie de Preluat din Warp

### 9.1 Pattern: Shared<T> (Thread-Safe Mutable State)

```rust
// Warp pattern - refolosibil as-is
pub struct Shared<T> {
    value: Arc<RwLock<T>>,
}

impl<T: Clone + Debug> Shared<T> {
    pub fn new(value: T) -> Self { ... }
    pub fn get(&self) -> impl Deref<Target = T> { self.value.read() }
    pub fn get_owned(&self) -> Shared<T> { Self { value: self.value.clone() } }
}
```

### 9.2 Pattern: IdleTimeoutSender (Generation-Based Timer Cancel)

```rust
// Warp pattern - elegant timer cancellation fără stored handles
struct IdleTimeoutSender<T: Send> {
    tx_cell: Arc<Mutex<Option<oneshot::Sender<T>>>>,
    generation: Arc<AtomicUsize>,
}

// Fiecare end_run_after() incrementează generation
// Timer-ul verifică generation la fire — dacă nu match, se ignoră
```

### 9.3 Pattern: AgentEventDriver (Reconnecting SSE)

```rust
// Warp pattern — poate fi portat direct
loop {
    let stream = source.open_stream(&run_ids, since_sequence).await?;
    loop {
        match stream.next().await {
            Event(e) => { consumer.on_event(e).await?; since_sequence = e.seq; }
            Error(_) => { backoff(); break; } // reconnect outer loop
            ProactiveReconnect => break;     // recycle connection
        }
    }
}
```

### 9.4 Pattern: Cancellation (Atomic Flag + Check Points)

```rust
// Identic în Octomus! ✅ Deja implementat.
pub struct AgentCancellation {
    flag: Arc<AtomicBool>,
}
impl AgentCancellation {
    pub fn is_cancelled(&self) -> bool { self.flag.load(Ordering::SeqCst) }
}
```

---

## 10. Dependențe Externe Necesare

| Crate | Folosit de | Deja în Octomus? |
|---|---|---|
| `tokio` | Async runtime | ✅ Da |
| `reqwest` | HTTP client | ✅ Da |
| `reqwest-eventsource` | SSE streaming | ❌ De adăugat |
| `futures` | Stream combinators | ✅ Da |
| `serde` / `serde_json` | Serialization | ✅ Da |
| `chrono` | Timestamps | ✅ Da |
| `uuid` | ID generation | ✅ Da |
| `parking_lot` | Fast RwLock | ❌ De adăugat (opțional) |
| `thiserror` | Error enums | ❌ De adăugat |
| `anyhow` | Error propagation | ❌ De adăugat |
| `log` | Logging | ❌ De adăugat |

---

## 11. Ce NU trebuie preluat

| Modul Warp | Motiv |
|---|---|
| `panel.rs` (ai_assistant) | UI-specific (Warp folosește propriul framework GPUI) |
| `agent_management/` | UI pentru management agenți (views, buttons) |
| `conversation_details_panel.rs` | UI panel |
| `ai_document_view.rs` | UI document view |
| `blocklist/` | UI-specific block list rendering |
| `voice/` | Voice input (nu relevant) |
| `onboarding.rs` | UI onboarding |
| `conversation_navigation/` | UI navigation |
| `agent_tips.rs` | UI tooltips |
| `predict/` | Predictive commands (Warp-specific) |
| `generate_block_title/` | UI-specific |
| `generate_code_review_content/` | Warp code review integration |
| `outline/` | UI outline panel |
| `loading/` | UI loading states |
| `aws_credentials.rs` | AWS Bedrock (nu necesar acum) |
| `cloud_agent_settings.rs` | Warp cloud settings |

---

## 12. Acțiuni Imediate

1. **Copiază** `retry.rs` → `src-tauri/src/ai/retry.rs` (adaptează Timer)
2. **Copiază** `execution_context.rs` → `src-tauri/src/ai/context.rs` (simplifică)
3. **Creează** `src-tauri/src/ai/conversation.rs` cu model simplificat
4. **Creează** `src-tauri/src/ai/errors.rs` cu `RenderableAIError` adaptat
5. **Creează** `src-tauri/src/ai/exchange.rs` cu Exchange model
6. **Extinde** `types.rs` cu noi tipuri (CancellationReason, Blocked status)
7. **Adaugă** `reqwest-eventsource`, `thiserror`, `anyhow` în `Cargo.toml`
