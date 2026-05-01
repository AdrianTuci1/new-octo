# Ambient Agents — Warp Reference & Octomus Adaptation

> Reverse-engineered din Warp codebase (~55K bytes, Ambient Agents module).
> Adaptat pentru Octomus: Tauri v2 + Rust backend + React frontend.

---

## 1. Overview

**Ambient Agents** sunt agenți AI care rulează **în background** — fie local, fie în cloud. Pot fi declanșați de:

| Sursă | Enum | Server Value |
|-------|------|--------------|
| Linear | `AgentSource::Linear` | `"LINEAR"` |
| API/Webhook | `AgentSource::AgentWebhook` | `"API"` |
| Slack | `AgentSource::Slack` | `"SLACK"` |
| CLI | `AgentSource::Cli` | `"CLI"` |
| Scheduled | `AgentSource::ScheduledAgent` | `"SCHEDULED_AGENT"` |
| Local Interactive | `AgentSource::Interactive` | `"LOCAL"` |
| Web App | `AgentSource::WebApp` | `"WEB_APP"` |
| GitHub Action | `AgentSource::GitHubAction` | `"GITHUB_ACTION"` |
| Cloud Mode | `AgentSource::CloudMode` | `"CLOUD_MODE"` |

### Module Structure

```
warp/app/src/ai/ambient_agents/
├── mod.rs                  # Types + conversation status derivation (98 linii)
├── task.rs                 # AmbientAgentTask — primary data model (510 linii)
├── spawn.rs                # Stream-based spawn + poll (177 linii)
├── scheduled.rs            # Cron-scheduled agents (471 linii)
├── telemetry.rs            # Telemetry events (7945 bytes)
├── github_auth_notifier.rs # GitHub auth notification
└── spawn_tests.rs          # Tests for spawn flow
```

---

## 2. Task Data Model

### 2.1 AmbientAgentTask

```rust
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct AmbientAgentTask {
    pub task_id: AmbientAgentTaskId,
    pub parent_run_id: Option<String>,          // Parent agent (for orchestration)
    pub title: String,
    pub state: AmbientAgentTaskState,
    pub prompt: String,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub status_message: Option<TaskStatusMessage>,
    pub source: Option<AgentSource>,
    pub session_id: Option<String>,
    pub session_link: Option<String>,
    pub creator: Option<TaskCreatorInfo>,
    pub conversation_id: Option<String>,
    pub request_usage: Option<RequestUsage>,
    pub is_sandbox_running: bool,
    pub agent_config_snapshot: Option<AgentConfigSnapshot>,
    pub artifacts: Vec<Artifact>,
    pub last_event_sequence: Option<i64>,        // For event delivery resume
    pub children: Vec<String>,                    // Child agent run_ids
}
```

### 2.2 Helpful Methods

```rust
impl AmbientAgentTask {
    /// Total credits used (inference + compute).
    pub fn credits_used(&self) -> Option<f32> {
        self.request_usage
            .map(|u| (u.inference_cost.unwrap_or(0.0) + u.compute_cost.unwrap_or(0.0)) as f32)
    }

    /// Duration from started_at to updated_at.
    pub fn run_time(&self) -> Option<chrono::Duration> {
        let started = self.started_at?;
        let duration = self.updated_at.signed_duration_since(started);
        (duration.num_seconds() >= 0).then_some(duration)
    }

    /// Returns true if the session is no longer running.
    pub fn is_no_longer_running(&self) -> bool {
        !self.is_sandbox_running && !self.state.is_working()
    }
}
```

---

## 3. Task State Machine

### 3.1 States

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum AmbientAgentTaskState {
    Queued,         // Task created, waiting for worker
    Pending,        // Worker assigned, setting up
    Claimed,        // Worker claimed task
    InProgress,     // Agent is actively running
    Succeeded,      // Agent completed successfully
    Failed,         // Agent failed
    Error,          // System error
    Blocked,        // Agent blocked on user action
    Cancelled,      // Cancelled by user
    Unknown,        // Deserialization fallback
}
```

### 3.2 State Transition Diagram

```
                    ┌─────────┐
                    │ Queued  │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │ Pending │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │ Claimed │
                    └────┬────┘
                         │
                 ┌───────▼───────┐
                 │  InProgress   │
                 └───┬───┬───┬───┘
                     │   │   │
        ┌────────────┘   │   └────────────┐
        │                │                │
   ┌────▼─────┐    ┌─────▼────┐    ┌──────▼──────┐
   │Succeeded │    │  Failed  │    │  Cancelled  │
   └──────────┘    │  Error   │    └─────────────┘
                   │  Blocked │
                   └──────────┘

   ── Any working state can → Cancelled
```

### 3.3 State Properties Matrix

| State | `is_working` | `is_cancellable` | `is_terminal` | `is_failure_like` |
|-------|:---:|:---:|:---:|:---:|
| **Queued** | ✅ | ✅ | ❌ | ❌ |
| **Pending** | ✅ | ✅ | ❌ | ❌ |
| **Claimed** | ✅ | ✅ | ❌ | ❌ |
| **InProgress** | ✅ | ✅ | ❌ | ❌ |
| **Succeeded** | ❌ | ❌ | ✅ | ❌ |
| **Failed** | ❌ | ❌ | ✅ | ✅ |
| **Error** | ❌ | ❌ | ✅ | ✅ |
| **Blocked** | ❌ | ❌ | ✅ | ✅ |
| **Cancelled** | ❌ | ❌ | ✅ | ❌ |
| **Unknown** | ❌ | ❌ | ✅ | ✅ |

### 3.4 Display Names & Icons

```rust
impl std::fmt::Display for AmbientAgentTaskState {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Queued     => write!(f, "Queued"),
            Pending    => write!(f, "Pending"),
            Claimed    => write!(f, "Claimed"),
            InProgress => write!(f, "In progress"),
            Succeeded  => write!(f, "Done"),
            Failed     => write!(f, "Failed"),
            Error      => write!(f, "Error"),
            Blocked    => write!(f, "Blocked"),
            Cancelled  => write!(f, "Cancelled"),
            Unknown    => write!(f, "Failed"),  // Treated as failure
        }
    }
}

// Icon + color mapping (from task.rs)
match state {
    Working states     => (ClockLoader, magenta)
    Succeeded          => (Check, green)
    Failed/Error       => (Triangle, red)
    Blocked            => (StopFilled, yellow)
    Cancelled          => (Cancelled, disabled_text_color)
}
```

---

## 4. Spawn Flow

### 4.1 spawn_task() — Stream-based API

```rust
/// Spawns an ambient agent task and monitors its state.
/// Returns a stream of lifecycle events.
pub fn spawn_task(
    request: SpawnAgentRequest,
    ai_client: Arc<dyn AIClient>,
    timeout: Option<Duration>,
) -> impl Stream<Item = Result<AmbientAgentEvent, anyhow::Error>>
```

### 4.2 Event Types

```rust
pub enum AmbientAgentEvent {
    /// Task created on server — contains IDs.
    TaskSpawned {
        task_id: AmbientAgentTaskId,
        run_id: String,
    },

    /// Task state changed (emitted only on actual change).
    StateChanged {
        state: AmbientAgentTaskState,
        status_message: Option<TaskStatusMessage>,
    },

    /// Session started — contains join info for real-time view.
    SessionStarted {
        session_join_info: SessionJoinInfo,
    },

    /// Polling timed out (default 80 seconds).
    TimedOut,

    /// Server reports capacity limit reached.
    AtCapacity,
}
```

### 4.3 Spawn Sequence

```
1. POST /agent/run (SpawnAgentRequest)
   ├── Success → yield TaskSpawned { task_id, run_id }
   │             if at_capacity → yield AtCapacity
   └── Error → yield Err, return

2. Poll Loop (every 1 second, timeout 80s)
   │
   ├── GET /agent/tasks/{task_id}
   │   ├── State changed? → yield StateChanged
   │   ├── State is terminal? → return (stream ends)
   │   ├── State is InProgress?
   │   │   ├── Has session_link? → yield SessionStarted, return
   │   │   └── No link yet → continue polling
   │   └── Other state → continue polling
   │
   └── Timeout reached → yield TimedOut, return
```

### 4.4 Session Join Info

```rust
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionJoinInfo {
    pub session_id: Option<SessionId>,
    pub session_link: String,
}

impl SessionJoinInfo {
    pub fn from_task(task: &AmbientAgentTask) -> Option<Self> {
        // Priority:
        // 1. Server-provided session_link (better signal)
        // 2. Constructed from session_id (fallback)
    }
}
```

### 4.5 Constants

```rust
pub const TASK_STATUS_POLLING_DURATION: Duration = Duration::from_secs(80);

#[cfg(not(test))]
const TASK_STATUS_POLL_INTERVAL: Duration = Duration::from_secs(1);

#[cfg(test)]
const TASK_STATUS_POLL_INTERVAL: Duration = Duration::from_millis(1);  // Fast tests!
```

---

## 5. Conversation Status Derivation

```rust
pub enum AmbientConversationStatus {
    Success,
    Error { error: RenderableAIError },
    Cancelled { reason: CancellationReason },
    Blocked { blocked_action: String },
}

/// Derives the final task status from the conversation state.
pub fn conversation_output_status_from_conversation(
    conversation: &AIConversation,
) -> SDKConversationOutputStatus {
    // 1. Check conversation.status() for Blocked
    // 2. Get last exchange's output_status
    // 3. Map FinishedAIAgentOutput to SDKConversationOutputStatus
}
```

---

## 6. Scheduled Agents

### 6.1 Data Model

```rust
/// Configuration for agents that run on a cron schedule.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScheduledAmbientAgent {
    pub name: String,
    pub cron_schedule: String,           // Cron expression (e.g., "0 9 * * 1-5")
    pub enabled: bool,
    pub prompt: String,
    pub last_spawn_error: Option<String>,
    pub agent_config: AgentConfigSnapshot,  // Full agent config
}
```

### 6.2 ScheduledAgentManager

```rust
pub struct ScheduledAgentManager {
    pending_deletes: HashMap<SyncId, oneshot::Sender<Result<()>>>,
}

impl ScheduledAgentManager {
    // ═══ CRUD Operations ═══
    pub fn list_schedules(&self, app: &AppContext) -> Vec<CloudScheduledAmbientAgent>;

    pub fn create_schedule(
        &mut self, config: ScheduledAmbientAgent, owner: Owner, ctx: &mut ModelContext<Self>
    ) -> impl Future<Output = Result<SyncId>>;

    pub fn update_schedule(
        &mut self, schedule_id: SyncId, params: UpdateScheduleParams, ctx: &mut ModelContext<Self>
    ) -> impl Future<Output = Result<()>>;

    pub fn pause_schedule(&mut self, schedule_id: SyncId, ctx: ...) -> impl Future<...>;
    pub fn unpause_schedule(&mut self, schedule_id: SyncId, ctx: ...) -> impl Future<...>;
    pub fn delete_schedule(&mut self, schedule_id: SyncId, ctx: ...) -> impl Future<...>;

    pub fn fetch_schedule_history(
        &self, schedule_id: SyncId, app: &AppContext
    ) -> impl Future<Output = Result<Option<ScheduledAgentHistory>>>;
}
```

### 6.3 Update Parameters

```rust
pub struct UpdateScheduleParams {
    pub name: Option<String>,
    pub cron: Option<String>,
    pub model_id: Option<String>,
    pub environment_id: Option<Option<String>>,    // Some(None) = remove
    pub base_prompt: Option<String>,
    pub prompt: Option<String>,
    pub mcp_servers_upsert: Option<Map<String, Value>>,  // Merge by key
    pub remove_mcp_server_names: Vec<String>,
    pub skill_spec: Option<Option<String>>,        // Some(None) = remove
    pub worker_host: Option<String>,
}
```

### 6.4 Cloud Object Persistence

Scheduled agents sunt persistați ca **Cloud Objects** — obiecte sincronizate cu serverul:

```
CloudScheduledAmbientAgent
├── metadata: { revision, sync_id, pending_changes }
└── model: ScheduledAmbientAgent { name, cron, prompt, ... }
```

**Sync Rules:**
- Create → `UpdateManager::create_scheduled_ambient_agent_online()`
- Update → `UpdateManager::update_scheduled_ambient_agent_online()`
- Delete → `UpdateManager::delete_object_by_user()`
- Revision-based conflict detection (optimistic locking)
- Cannot delete while pending changes exist

---

## 7. Request Usage & Billing

```rust
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct RequestUsage {
    pub inference_cost: Option<f64>,    // LLM token cost
    pub compute_cost: Option<f64>,      // Sandbox compute cost
}

// Total credits:
fn credits_used() -> f32 {
    inference_cost.unwrap_or(0.0) + compute_cost.unwrap_or(0.0)
}

// Run time:
fn run_time() -> Option<chrono::Duration> {
    updated_at - started_at  // Only if non-negative
}
```

---

## 8. Cancellation

```rust
/// Cancel a task and show a toast notification with result.
pub fn cancel_task_with_toast(task_id: AmbientAgentTaskId, ctx: &mut ViewContext) {
    let ai_client = ServerApiProvider::handle(ctx).as_ref(ctx).get_ai_client();
    ctx.spawn(
        async move { ai_client.cancel_ambient_agent_task(&task_id).await },
        move |_view, result, ctx| {
            let message = match result {
                Ok(()) => "Task cancelled".to_string(),
                Err(e) => format!("Failed to cancel task: {e}"),
            };
            // Show toast notification
            ToastStack::handle(ctx).update(ctx, |stack, ctx| {
                stack.add_ephemeral_toast(DismissibleToast::default(message), window_id, ctx);
            });
        },
    );
}
```

---

## 9. AIConversation — The Shared Core

### 9.1 Data Model (3742 linii)

```rust
pub struct AIConversation {
    // ═══ Identity ═══
    id: AIConversationId,
    server_conversation_token: Option<ServerConversationToken>,
    task_id: Option<AmbientAgentTaskId>,

    // ═══ Content ═══
    task_store: TaskStore,                         // Tree of tasks + exchanges
    todo_lists: Vec<AIAgentTodoList>,
    code_review: Option<CodeReview>,
    artifacts: Vec<Artifact>,

    // ═══ Status ═══
    status: ConversationStatus,
    status_error_message: Option<String>,

    // ═══ Usage ═══
    conversation_usage_metadata: ConversationUsageMetadata,
    total_request_cost: RequestCost,
    total_token_usage_by_model: HashMap<String, TokenUsage>,

    // ═══ UI State ═══
    autoexecute_override: AIConversationAutoexecuteMode,
    hidden_exchanges: HashSet<AIAgentExchangeId>,
    reverted_action_ids: HashSet<AIAgentActionId>,
    existing_suggestions: Option<Suggestions>,
    dismissed_suggestion_ids: HashSet<SuggestedLoggingId>,

    // ═══ Orchestration ═══
    parent_agent_id: Option<String>,               // Parent agent's ID
    agent_name: Option<String>,                     // "Agent 1", etc.
    parent_conversation_id: Option<AIConversationId>,
    is_remote_child: bool,                          // Executing on remote worker
    last_event_sequence: Option<i64>,               // Event delivery cursor

    // ═══ Session ═══
    is_viewing_shared_session: bool,
    transaction: Option<Transaction>,
    added_exchanges_by_response: HashMap<ResponseStreamId, Vec1<AddedExchange>>,

    // ═══ Fork ═══
    forked_from_server_conversation_token: Option<ServerConversationToken>,

    // ═══ Display ═══
    fallback_display_title: Option<String>,
}
```

### 9.2 Conversation Status

```rust
pub enum ConversationStatus {
    InProgress,
    Success,
    Error,
    Cancelled,
    Blocked { blocked_action: String },
}
```

### 9.3 Task Tree

```
Root Task
├── Exchange 1: [User Query → Agent Response]
├── Exchange 2: [Follow-up → Response with tool use]
│   └── Subtask A (child agent)
│       ├── Exchange A.1
│       └── Exchange A.2
├── Exchange 3: [User approval → Agent continues]
└── Exchange 4
    └── Subtask B (remote child on different worker)
```

### 9.4 Usage Metadata

```rust
pub struct ConversationUsageMetadata {
    pub was_summarized: bool,
    pub context_window_usage: f32,         // 0.0 to 1.0
    pub credits_spent: f32,
    pub credits_spent_for_last_block: Option<f32>,
    pub token_usage: Vec<ModelTokenUsage>,
    pub tool_usage_metadata: ToolUsageMetadata,
}
```

---

## 10. Octomus Adaptation

### 10.1 Simplified Task Model

```rust
// src-tauri/src/ai/task.rs

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

pub type TaskId = uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: TaskId,
    pub title: String,
    pub prompt: String,
    pub state: TaskState,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub conversation_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskState {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

impl TaskState {
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Succeeded | Self::Failed | Self::Cancelled)
    }

    pub fn is_active(&self) -> bool {
        matches!(self, Self::Queued | Self::Running)
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Queued => "Queued",
            Self::Running => "Running",
            Self::Succeeded => "Done",
            Self::Failed => "Failed",
            Self::Cancelled => "Cancelled",
        }
    }
}
```

### 10.2 Background Task Runner

```rust
// src-tauri/src/ai/runner.rs

use tokio::sync::{mpsc, watch};
use crate::ai::task::{Task, TaskState};

/// Events emitted by the task runner.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum TaskEvent {
    StateChanged { task_id: TaskId, state: TaskState },
    OutputChunk { task_id: TaskId, text: String },
    ToolCall { task_id: TaskId, tool: String, args: serde_json::Value },
    Completed { task_id: TaskId, result: TaskResult },
    Error { task_id: TaskId, error: String },
}

pub struct TaskRunner {
    tasks: HashMap<TaskId, Task>,
    event_tx: mpsc::UnboundedSender<TaskEvent>,
}

impl TaskRunner {
    pub fn new() -> (Self, mpsc::UnboundedReceiver<TaskEvent>) {
        let (tx, rx) = mpsc::unbounded_channel();
        (Self { tasks: HashMap::new(), event_tx: tx }, rx)
    }

    pub async fn spawn_task(
        &mut self,
        prompt: String,
        config: AgentConfig,
    ) -> TaskId {
        let task = Task::new(prompt);
        let id = task.id;
        self.tasks.insert(id, task);

        // Spawn execution in background
        let tx = self.event_tx.clone();
        tokio::spawn(async move {
            tx.send(TaskEvent::StateChanged {
                task_id: id,
                state: TaskState::Running,
            }).ok();

            // Execute AI call...
            // Stream chunks via tx...

            tx.send(TaskEvent::Completed {
                task_id: id,
                result: TaskResult::Success,
            }).ok();
        });

        id
    }

    pub fn cancel_task(&mut self, id: TaskId) -> bool {
        if let Some(task) = self.tasks.get_mut(&id) {
            if task.state.is_active() {
                task.state = TaskState::Cancelled;
                self.event_tx.send(TaskEvent::StateChanged {
                    task_id: id,
                    state: TaskState::Cancelled,
                }).ok();
                return true;
            }
        }
        false
    }
}
```

### 10.3 Tauri Event Bridge

```rust
// src-tauri/src/main.rs — event bridge to React frontend

#[tauri::command]
async fn submit_prompt(
    state: tauri::State<'_, AppState>,
    prompt: String,
) -> Result<String, String> {
    let task_id = state.runner.lock().await
        .spawn_task(prompt, state.config.clone())
        .await;
    Ok(task_id.to_string())
}

#[tauri::command]
async fn cancel_task(
    state: tauri::State<'_, AppState>,
    task_id: String,
) -> Result<bool, String> {
    let id: TaskId = task_id.parse().map_err(|e| format!("{e}"))?;
    Ok(state.runner.lock().await.cancel_task(id))
}

// Forward TaskEvents to React via Tauri events
async fn event_forwarder(
    app: tauri::AppHandle,
    mut rx: mpsc::UnboundedReceiver<TaskEvent>,
) {
    while let Some(event) = rx.recv().await {
        app.emit("task-event", &event).ok();
    }
}
```

### 10.4 React Event Listener

```tsx
// src/hooks/useTaskEvents.ts
import { listen } from '@tauri-apps/api/event';

export function useTaskEvents(onEvent: (event: TaskEvent) => void) {
    useEffect(() => {
        const unlisten = listen<TaskEvent>('task-event', (e) => {
            onEvent(e.payload);
        });
        return () => { unlisten.then(fn => fn()); };
    }, [onEvent]);
}
```
