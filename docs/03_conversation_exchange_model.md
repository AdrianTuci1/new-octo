# Conversation & Exchange Model: Modelul de Date Persistent

> **Context:** Documentație extrasă din `warp/app/src/ai/agent/` pentru implementarea în Octomus Launcher.  
> **Data:** 2026-05-02

---

## 1. Modelul Conceptual Warp

Warp organizează datele într-o ierarhie de 4 nivele:

```
AIConversation (1 per sesiune de chat)
  │
  ├── TaskStore
  │     ├── Task (root) ← Single task în cazul simplu
  │     │     ├── Exchange 1 (user query → AI response)
  │     │     ├── Exchange 2 (action result → AI response)
  │     │     └── Exchange 3 (follow-up → AI response)
  │     │
  │     ├── Task (subtask - CLI subagent)
  │     │     ├── Exchange 1
  │     │     └── Exchange 2
  │     │
  │     └── Task (subtask - Research subagent)
  │           └── Exchange 1
  │
  ├── TodoLists: Vec<AIAgentTodoList>
  ├── Artifacts: Vec<Artifact>
  ├── Status: ConversationStatus
  └── UsageMetadata
```

---

## 2. Structurile de Date Cheie

### 2.1 AIConversation

**Fișier:** `warp/app/src/ai/agent/conversation.rs`

```rust
pub struct AIConversation {
    // ═══ IDENTITATE ═══
    pub id: AIConversationId,                    // UUID local
    server_conversation_token: Option<ServerConversationToken>,  // ID server
    task_id: Option<AmbientAgentTaskId>,         // Task ID cloud
    
    // ═══ STARE ═══
    status: ConversationStatus,
    autoexecute_override: Option<AIConversationAutoexecuteMode>,
    
    // ═══ DATE ═══
    task_store: TaskStore,                       // Arbore de task-uri + exchange-uri
    todo_lists: Vec<AIAgentTodoList>,            // Todo-uri generate de AI
    artifacts: Vec<Artifact>,                     // PR-uri, documente, etc.
    
    // ═══ METADATA ═══
    total_request_cost: RequestCost,
    total_token_usage_by_model: HashMap<String, TokenUsage>,
    conversation_usage_metadata: ConversationUsageMetadata,
    
    // ═══ STREAMING STATE ═══
    added_exchanges_by_response: HashMap<ResponseStreamId, Vec1<AddedExchange>>,
    transaction: Option<TransactionCheckpoint>,   // Pentru rollback
    
    // ═══ MULTI-AGENT ═══
    parent_conversation_id: Option<AIConversationId>,
    parent_agent_id: Option<String>,
    is_remote_child: bool,
    
    // ═══ PERSISTENȚĂ ═══
    last_event_sequence: Option<i64>,            // Pentru SSE reconciliation
}
```

### 2.2 ConversationStatus

```rust
pub enum ConversationStatus {
    InProgress,     // Agentul procesează
    Success,        // Terminat cu succes (nu mai sunt acțiuni)
    Cancelled,      // Anulat de user
    Error,          // Eroare
}

impl ConversationStatus {
    pub fn is_in_progress(&self) -> bool { matches!(self, Self::InProgress) }
    pub fn is_finished(&self) -> bool { !self.is_in_progress() }
}
```

### 2.3 AIAgentExchange — Unitatea Atomică de Comunicare

```rust
pub struct AIAgentExchange {
    // ═══ IDENTITATE ═══
    pub id: AIAgentExchangeId,                   // UUID

    // ═══ INPUT ═══
    pub input: Vec<AIAgentInput>,                // Ce a trimis user-ul/agentul

    // ═══ OUTPUT ═══
    pub output_status: AIAgentOutputStatus,       // Streaming sau finalizat

    // ═══ TIMING ═══
    pub start_time: DateTime<Local>,
    pub finish_time: Option<DateTime<Local>>,
    pub time_to_first_token_ms: Option<u32>,

    // ═══ CONTEXT ═══
    pub working_directory: Option<String>,
    pub model_id: Option<LLMId>,
    pub request_cost: Option<RequestCost>,
    
    // ═══ TRACKING ═══
    pub added_message_ids: HashSet<MessageId>,    // Mesaje adăugate în acest exchange
}
```

### 2.4 AIAgentOutputStatus — Starea Output-ului

```rust
pub enum AIAgentOutputStatus {
    /// Output-ul încă se streamează
    Streaming {
        output: Option<Shared<AIAgentOutput>>,   // Poate fi None inițial
    },
    
    /// Output-ul e finalizat
    Finished {
        finished_output: FinishedAIAgentOutput,
    },
}

pub enum FinishedAIAgentOutput {
    /// Succes — output complet
    Success {
        output: SharedOwned<AIAgentOutput>,
    },
    
    /// Anulat — output parțial (dacă există)
    Cancelled {
        output: Option<SharedOwned<AIAgentOutput>>,
        reason: CancellationReason,
    },
    
    /// Eroare — output parțial (dacă există)
    Error {
        output: Option<SharedOwned<AIAgentOutput>>,
        error: RenderableAIError,
    },
}
```

### 2.5 AIAgentOutput — Conținutul Răspunsului

```rust
pub struct AIAgentOutput {
    /// Mesajele acumulate (text, acțiuni, reasoning, etc.)
    pub messages: Vec<AIAgentOutputMessage>,
    
    /// ID-ul output-ului pe server
    pub server_output_id: Option<ServerOutputId>,
    
    /// Sugestii generate
    pub suggestions: Option<Suggestions>,
    
    /// Info despre modelul folosit
    pub model_info: Option<OutputModelInfo>,
    
    /// Costul cererii
    pub request_cost: Option<RequestCost>,
}

impl AIAgentOutput {
    /// Returnează doar acțiunile din mesaje
    pub fn actions(&self) -> impl Iterator<Item = &AIAgentAction> {
        self.messages.iter().filter_map(|msg| {
            match &msg.message {
                AIAgentOutputMessageType::Action(action) => Some(action),
                _ => None,
            }
        })
    }
}
```

---

## 3. Flow-ul de Date: De la Request la Persistare

### 3.1 Crearea unui Exchange

```
1. User trimite query
   │
   ├─→ update_for_new_request_input()
   │     - Creează AIAgentExchange { status: Streaming { output: None } }
   │     - Adaugă în TaskStore (root task)
   │     - Mapează ResponseStreamId → exchange_id
   │     - Emit event: AppendedExchange
   │
2. Server trimite StreamInit
   │
   ├─→ initialize_output_for_response_stream()
   │     - Creează AIAgentOutput gol
   │     - Setează server_output_id
   │     - Emit event: UpdatedStreamingExchange
   │
3. Server streamează mesaje
   │
   ├─→ apply_client_action(AddMessagesToTask)
   │     - task.add_messages() — acumulează mesaje în output
   │     - Emit event: UpdatedStreamingExchange (la fiecare mesaj)
   │
4. Server termină stream-ul
   │
   ├─→ mark_request_completed()
   │     - output_status → Finished { Success { output } }
   │     - Verifică has_new_actions
   │       - DA → status rămâne InProgress
   │       - NU → update_status(ConversationStatus::Success)
   │     - write_updated_conversation_state() → persistare
   │     - Emit event: UpdatedStreamingExchange + UpdatedConversationStatus
```

### 3.2 Tranzacții (Rollback Support)

Warp suportă **tranzacții** pe conversație — serverul poate face rollback:

```rust
// Server trimite BeginTransaction → se creează checkpoint
self.begin_transaction();

// Server trimite RollbackTransaction → restaurează starea
self.rollback_transaction(&response_stream_id);

// Server trimite CommitTransaction → confirmă modificările
self.commit_transaction();
```

Asta permite serverului să facă "speculative execution" și să anuleze dacă ceva nu merge.

---

## 4. Task & TaskStore

### 4.1 Task — Container de Exchange-uri

**Fișier:** `warp/app/src/ai/agent/task.rs`

```rust
pub struct Task {
    // Poate fi "optimistic" (creat local) sau "server-backed" (creat de server)
    inner: TaskInner,
}

enum TaskInner {
    /// Creat local, înainte de confirmarea serverului
    Optimistic {
        id: TaskId,
        exchanges: Vec<AIAgentExchange>,
        description: String,
    },
    
    /// Confirmat de server — conține mesajele complete
    ServerCreated {
        task: warp_multi_agent_api::Task,
        exchanges: Vec<AIAgentExchange>,
    },
}
```

### 4.2 TaskStore — Arbore de Task-uri

```rust
pub struct TaskStore {
    root_task_id: TaskId,
    tasks: HashMap<TaskId, Task>,
}

impl TaskStore {
    /// Returnează root task
    pub fn root_task(&self) -> Option<&Task> { ... }
    
    /// Toate exchange-urile din toate task-urile, liniarizate
    pub fn all_exchanges(&self) -> impl Iterator<Item = &AIAgentExchange> { ... }
    
    /// Adaugă un exchange la un task specific
    pub fn append_exchange(&mut self, task_id: &TaskId, exchange: AIAgentExchange) -> bool { ... }
}
```

---

## 5. Implementare Propusă pentru Octomus

### 5.1 Model Simplificat (Fără Multi-Agent)

```rust
// src-tauri/src/ai/conversation.rs

use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Status conversație
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConversationStatus {
    InProgress,
    Success,
    Cancelled,
    Error,
}

/// Un exchange = o pereche input → output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exchange {
    pub id: String,
    pub input: ExchangeInput,
    pub output: Option<ExchangeOutput>,
    pub status: ExchangeStatus,
    pub start_time: DateTime<Local>,
    pub finish_time: Option<DateTime<Local>>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExchangeInput {
    UserQuery { query: String },
    ActionResults { results: Vec<AgentActionResult> },
    ResumeConversation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExchangeOutput {
    /// Text acumulat (markdown)
    pub text: String,
    /// Acțiuni (tool calls) primite
    pub actions: Vec<AgentAction>,
    /// Reasoning blocks (dacă modelul suportă)
    pub reasoning: Option<String>,
    /// Token usage
    pub token_usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExchangeStatus {
    Streaming,
    Completed,
    Cancelled,
    Error,
}

/// Conversația completă
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub exchanges: Vec<Exchange>,
    pub status: ConversationStatus,
    pub title: Option<String>,
    pub model_id: String,
    pub created_at: DateTime<Local>,
    pub updated_at: DateTime<Local>,
    pub total_tokens: u32,
}

impl Conversation {
    pub fn new(model_id: String) -> Self {
        let now = Local::now();
        Self {
            id: Uuid::new_v4().to_string(),
            exchanges: Vec::new(),
            status: ConversationStatus::InProgress,
            title: None,
            model_id,
            created_at: now,
            updated_at: now,
            total_tokens: 0,
        }
    }
    
    /// Începe un exchange nou
    pub fn start_exchange(&mut self, input: ExchangeInput) -> &mut Exchange {
        let exchange = Exchange {
            id: Uuid::new_v4().to_string(),
            input,
            output: None,
            status: ExchangeStatus::Streaming,
            start_time: Local::now(),
            finish_time: None,
            model_id: Some(self.model_id.clone()),
        };
        self.exchanges.push(exchange);
        self.status = ConversationStatus::InProgress;
        self.updated_at = Local::now();
        self.exchanges.last_mut().unwrap()
    }
    
    /// Finalizează exchange-ul curent
    pub fn complete_current_exchange(&mut self, output: ExchangeOutput) -> bool {
        let has_actions = !output.actions.is_empty();
        
        if let Some(exchange) = self.exchanges.last_mut() {
            if let Some(usage) = &output.token_usage {
                self.total_tokens += usage.total_tokens;
            }
            exchange.output = Some(output);
            exchange.status = ExchangeStatus::Completed;
            exchange.finish_time = Some(Local::now());
        }
        
        if !has_actions {
            self.status = ConversationStatus::Success;
        }
        // Returnează true dacă agentul trebuie să continue
        has_actions
    }
    
    /// Marchează conversația ca eșuată
    pub fn mark_error(&mut self) {
        self.status = ConversationStatus::Error;
        if let Some(exchange) = self.exchanges.last_mut() {
            exchange.status = ExchangeStatus::Error;
            exchange.finish_time = Some(Local::now());
        }
    }
    
    /// Marchează conversația ca anulată
    pub fn mark_cancelled(&mut self) {
        self.status = ConversationStatus::Cancelled;
        if let Some(exchange) = self.exchanges.last_mut() {
            exchange.status = ExchangeStatus::Cancelled;
            exchange.finish_time = Some(Local::now());
        }
    }
    
    /// Generează istoricul de mesaje pentru API
    pub fn to_api_messages(&self) -> Vec<serde_json::Value> {
        let mut messages = Vec::new();
        
        for exchange in &self.exchanges {
            // Input
            match &exchange.input {
                ExchangeInput::UserQuery { query } => {
                    messages.push(serde_json::json!({
                        "role": "user",
                        "content": query,
                    }));
                }
                ExchangeInput::ActionResults { results } => {
                    for result in results {
                        messages.push(serde_json::json!({
                            "role": "tool",
                            "tool_call_id": result.tool_call_id,
                            "content": result.to_content_string(),
                        }));
                    }
                }
                ExchangeInput::ResumeConversation => {
                    messages.push(serde_json::json!({
                        "role": "user",
                        "content": "Please continue.",
                    }));
                }
            }
            
            // Output (dacă există)
            if let Some(output) = &exchange.output {
                let mut assistant_msg = serde_json::json!({
                    "role": "assistant",
                });
                
                if !output.text.is_empty() && output.actions.is_empty() {
                    assistant_msg["content"] = output.text.clone().into();
                } else if !output.actions.is_empty() {
                    // Dacă sunt tool calls, content poate fi parțial
                    if !output.text.is_empty() {
                        assistant_msg["content"] = output.text.clone().into();
                    }
                    assistant_msg["tool_calls"] = output.actions.iter().map(|a| {
                        a.to_api_tool_call()
                    }).collect();
                }
                
                messages.push(assistant_msg);
            }
        }
        
        messages
    }
    
    /// Primul query al user-ului (pentru titlu)
    pub fn initial_query(&self) -> Option<&str> {
        self.exchanges.first().and_then(|e| match &e.input {
            ExchangeInput::UserQuery { query } => Some(query.as_str()),
            _ => None,
        })
    }
    
    /// Ultimul exchange
    pub fn latest_exchange(&self) -> Option<&Exchange> {
        self.exchanges.last()
    }
    
    /// Este conversația terminată?
    pub fn is_finished(&self) -> bool {
        !matches!(self.status, ConversationStatus::InProgress)
    }
}
```

### 5.2 Persistare

```rust
// src-tauri/src/ai/persistence.rs

use std::path::PathBuf;
use super::conversation::Conversation;

pub struct ConversationStore {
    storage_dir: PathBuf,
}

impl ConversationStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let storage_dir = app_data_dir.join("conversations");
        std::fs::create_dir_all(&storage_dir).ok();
        Self { storage_dir }
    }
    
    pub fn save(&self, conversation: &Conversation) -> anyhow::Result<()> {
        let path = self.storage_dir.join(format!("{}.json", conversation.id));
        let data = serde_json::to_string_pretty(conversation)?;
        std::fs::write(path, data)?;
        Ok(())
    }
    
    pub fn load(&self, id: &str) -> anyhow::Result<Conversation> {
        let path = self.storage_dir.join(format!("{id}.json"));
        let data = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str(&data)?)
    }
    
    pub fn list_recent(&self, limit: usize) -> Vec<Conversation> {
        let mut conversations = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&self.storage_dir) {
            for entry in entries.flatten() {
                if let Ok(data) = std::fs::read_to_string(entry.path()) {
                    if let Ok(conv) = serde_json::from_str::<Conversation>(&data) {
                        conversations.push(conv);
                    }
                }
            }
        }
        conversations.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        conversations.truncate(limit);
        conversations
    }
}
```

---

## 6. Diferențe Cheie: Warp vs. Octomus

| Aspect | Warp | Octomus (propus) |
|---|---|---|
| **Ierarhie** | Conversation → TaskStore → Task → Exchange | Conversation → Exchange (flat) |
| **Multi-agent** | Task tree cu parent/child | Un singur task (extensibil) |
| **Persistare** | YAML + SQLite + Server sync | JSON local |
| **Streaming state** | `Shared<T>` (Arc<RwLock>) cu `Streaming/Finished` | Direct pe Exchange struct |
| **Tranzacții** | Begin/Commit/Rollback | Nu e necesar inițial |
| **Exchange input** | 15+ variante de `AIAgentInput` | 3 variante (UserQuery, ActionResults, Resume) |
| **Autoexecute** | Per-conversation override | Global setting |
| **Token tracking** | Per-model, per-category (warp/byok) | Simplu: total tokens |

---

## 7. Fișiere Warp Relevante

| Fișier | Ce conține |
|---|---|
| [`conversation.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/conversation.rs#L1-L200) | `AIConversation` — structura completă |
| [`conversation.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/conversation.rs#L1319-L1393) | `update_for_new_request_input()` — crearea exchange-urilor |
| [`conversation.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/conversation.rs#L1626-L1679) | `mark_request_completed()` — finalizarea |
| [`task.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/task.rs) | `Task`, `TaskStore` |
| [`mod.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/mod.rs#L2396-L2503) | `AIAgentInput` enum |
