# Agent SDK & Harness System — Warp Reference & Octomus Adaptation

> Reverse-engineered din Warp codebase (~500K bytes, Agent SDK module).
> Adaptat pentru Octomus: Tauri v2 + Rust backend + React frontend.

---

## 1. Warp Agent SDK — Overview

Agent SDK-ul este **CLI-ul `oz`** (Warp's agent runner). Permite rularea agenților AI din linia de comandă sau programatic, cu suport pentru multiple **harnașe** (execution backends). Este probabil cel mai sofisticat agent orchestrator open-source.

### 1.1 Structura Modulului

```
warp/app/src/ai/agent_sdk/
├── mod.rs                 # CLI entry point — 1512 linii
│                          # Subcommands: run, run-cloud, profile, model,
│                          # environment, mcp, schedule, secret, etc.
├── driver.rs              # AgentDriver — execution engine — 2387 linii
│                          # Core: configures headless terminal + executes AI
├── driver/
│   ├── harness/           # Harness implementations
│   │   ├── mod.rs         # HarnessKind, HarnessRunner trait, SavePoint
│   │   ├── third_party.rs # ThirdPartyHarness implementation
│   │   └── ...
│   ├── terminal.rs        # TerminalDriver for headless sessions
│   ├── environment.rs     # Environment setup — 48K
│   ├── snapshot.rs        # End-of-run snapshot upload
│   ├── cloud_provider.rs  # Cloud provider env vars
│   ├── output.rs          # Output formatting (Pretty, JSON, NDJSON, Text)
│   └── attachments.rs     # File attachments handling
├── harness_support.rs     # Bridge: 3rd-party harness → Warp platform
├── ambient.rs             # Cloud agent spawning — 47K
├── agent_config.rs        # Config file resolution
├── config_file.rs         # YAML/JSON config parsing
├── mcp_config.rs          # MCP server config
├── secret.rs              # Managed secrets — 28K
├── artifact.rs            # Artifact management
├── artifact_upload.rs     # Upload artifacts to server
├── environment.rs         # Cloud environments — 48K
├── schedule.rs            # Cron-scheduled agents — 25K
├── common.rs              # Shared utilities
└── telemetry.rs           # CLI telemetry — 20K
```

---

## 2. AgentDriver — The Execution Engine

### 2.1 Data Model

```rust
/// Core execution engine that drives an agent run to completion.
/// Creates a headless terminal session and executes AI queries within it.
pub struct AgentDriver {
    // ═══ Terminal ═══
    terminal_driver: ModelHandle<TerminalDriver>,
    working_dir: PathBuf,

    // ═══ Security ═══
    secrets: Arc<HashMap<String, ManagedSecretValue>>,

    // ═══ Execution ═══
    output_format: OutputFormat,           // Pretty | JSON | NDJSON | Text
    task_id: Option<AmbientAgentTaskId>,
    harness: Option<Arc<dyn HarnessRunner>>,  // Set when 3rd-party harness starts
    idle_on_complete: Option<Duration>,

    // ═══ Conversation ═══
    restored_conversation_id: Option<AIConversationId>,
    run_conversation_id: Option<AIConversationId>,
    parent_run_id: Option<String>,         // For child agent orchestration

    // ═══ Environment ═══
    cloud_providers: Vec<Box<dyn CloudProvider>>,
    environment: Option<AmbientAgentEnvironment>,

    // ═══ Resume ═══
    resume_payload: Option<ResumePayload>, // For 3rd-party harness resume

    // ═══ Snapshot ═══
    snapshot_disabled: bool,
    snapshot_upload_timeout: Duration,      // Default: varies
    snapshot_script_timeout: Duration,      // Default: varies
}
```

### 2.2 AgentDriverOptions

```rust
pub struct AgentDriverOptions {
    pub working_dir: PathBuf,
    pub secrets: HashMap<String, ManagedSecretValue>,
    pub task_id: Option<AmbientAgentTaskId>,
    pub parent_run_id: Option<String>,
    pub should_share: bool,
    pub idle_on_complete: Option<Duration>,
    pub resume: Option<ResumeOptions>,
    pub cloud_providers: Vec<Box<dyn CloudProvider>>,
    pub environment: Option<AmbientAgentEnvironment>,
    pub selected_harness: Harness,
    pub snapshot_disabled: Option<bool>,
    pub snapshot_upload_timeout: Option<Duration>,
    pub snapshot_script_timeout: Option<Duration>,
}

pub enum ResumeOptions {
    Oz(Box<ConversationRestorationInNewPaneType>),  // Full transcript restore
    ThirdParty(Box<ResumePayload>),                  // Harness-specific blob
}
```

### 2.3 Managed Secrets

```rust
pub enum ManagedSecretValue {
    RawValue {
        value: String,
    },
    AnthropicApiKey {
        api_key: String,
    },
    AnthropicBedrockAccessKey {
        aws_access_key_id: String,
        aws_secret_access_key: String,
        aws_session_token: Option<String>,
        aws_region: String,
    },
    AnthropicBedrockApiKey {
        aws_bearer_token_bedrock: String,
        aws_region: String,
    },
}
```

**Secret injection rules:**
- Secrets → environment variables la sesiunea terminal
- Secrets → MCP servers la spawn
- **NU suprascrie** env vars deja setate (worker-injected creds au prioritate)

---

## 3. Harness System

### 3.1 Harness Types

```rust
pub enum Harness {
    Oz,          // Warp's native agent
    Claude,      // Claude Code (Anthropic)
    OpenCode,    // OpenCode CLI
    Gemini,      // Google Gemini CLI
    Codex,       // OpenAI Codex CLI
    Unknown,     // Future-proof fallback
}

pub enum HarnessKind {
    Oz,                                          // Native execution
    ThirdParty(Arc<dyn HarnessRunner>),          // External CLI tool
    Unsupported(String),                         // Known but not runnable
}
```

### 3.2 HarnessRunner Trait (Abstraction)

```rust
/// Interface for third-party harness execution backends.
pub trait HarnessRunner: Send + Sync {
    /// Validate that the harness CLI is installed and authenticated.
    fn validate(&self) -> Result<(), AgentDriverError>;

    /// Start executing the agent with the given prompt.
    fn start(&self, prompt: &str, env_vars: &HashMap<String, String>)
        -> Result<(), AgentDriverError>;

    /// Save a checkpoint/savepoint for later resume.
    fn save(&self) -> Result<SavePoint, AgentDriverError>;

    /// Resume execution from a previously saved checkpoint.
    fn resume(&self, payload: &ResumePayload) -> Result<(), AgentDriverError>;

    /// Gracefully stop the running harness.
    fn stop(&self) -> Result<(), AgentDriverError>;
}

pub struct SavePoint {
    pub harness: String,       // Which harness created this
    pub payload: Vec<u8>,      // Opaque harness-specific data
}
```

### 3.3 Harness Lifecycle

```
┌──────────────────────────────────────────────────────┐
│ 1. Validate                                          │
│    ├── Check CLI installed (e.g., `claude --version`)│
│    └── Check authentication                          │
│                         │                            │
│ 2. Start                ▼                            │
│    ├── Inject env vars (secrets, task context)       │
│    ├── Launch CLI process in terminal                │
│    └── Monitor stdout/stderr                         │
│                         │                            │
│ 3. Run Loop             ▼                            │
│    ├── Auto-save every 30 seconds                    │
│    ├── Handle output events                          │
│    └── React to status changes                       │
│                         │                            │
│ 4. Complete             ▼                            │
│    ├── Save final snapshot                           │
│    ├── Report status to server                       │
│    └── Cleanup                                       │
└──────────────────────────────────────────────────────┘
```

### 3.4 Harness Support Bridge

Third-party harnașe comunică înapoi cu platforma Warp prin CLI subcommands:

```
Third-Party Harness (e.g., Claude Code)
    │
    ├── oz harness-support ping --run-id <id>
    │   └── Fetches task info, prints status
    │
    ├── oz harness-support report-artifact pr --url <url> --branch <branch>
    │   └── Reports PR artifact back to platform
    │
    ├── oz harness-support notify-user --message "Building feature X..."
    │   └── Sends progress notification to originating platform
    │
    └── oz harness-support finish-task --status success --summary "Done"
        └── Reports task completion/failure
```

```rust
// harness_support.rs
struct HarnessSupportRunner;  // Singleton model for async ops

// Commands available:
enum HarnessSupportCommand {
    Ping,                                    // Health check + task info
    ReportArtifact(ReportArtifactArgs),      // Report PR, screenshot, etc.
    NotifyUser(NotifyUserArgs),              // Progress notification
    FinishTask(FinishTaskArgs),              // Complete/fail task
}

pub enum TaskStatus {
    Success,
    Failure,
}
```

---

## 4. Task Configuration

### 4.1 Task Structure

```rust
#[derive(Debug)]
pub struct Task {
    pub prompt: AgentRunPrompt,
    pub model: Option<LLMId>,
    pub profile: Option<String>,
    pub mcp_specs: Vec<MCPSpec>,
    pub harness: HarnessKind,
}

#[derive(Debug, Clone)]
pub enum AgentRunPrompt {
    /// Prompt provided directly (plain string).
    Local(String),

    /// Server resolves prompt from task metadata.
    ServerSide {
        skill: Option<ParsedSkill>,
        attachments_dir: Option<String>,
    },
}
```

### 4.2 Agent Config Snapshot

```rust
/// Runtime configuration — merged from file + CLI + skill.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AgentConfigSnapshot {
    pub name: Option<String>,
    pub environment_id: Option<String>,
    pub model_id: Option<String>,
    pub base_prompt: Option<String>,
    pub mcp_servers: Option<Map<String, Value>>,  // MCP server definitions
    pub profile_id: Option<String>,
    pub worker_host: Option<String>,              // "warp" | self-hosted worker ID
    pub skill_spec: Option<String>,               // "skill_name" | "repo:skill"
    pub computer_use_enabled: Option<bool>,
    pub harness: Option<HarnessConfig>,
    pub harness_auth_secrets: Option<HarnessAuthSecretsConfig>,
}
```

### 4.3 Config Merge Hierarchy

```
Precedence (low → high):

1. Config File (YAML/JSON)
   └── ~/.config/oz/config.yaml
       ├── model_id: "claude-sonnet-4"
       ├── environment_id: "env-123"
       └── mcp_servers: { ... }

2. CLI Arguments
   └── oz agent run --model claude-opus-4 --harness claude

3. Skill Instructions
   └── Resolved at runtime, can override model/prompt
```

---

## 5. MCP Server Integration

### 5.1 MCP Spec Types

```rust
pub enum MCPSpec {
    Uuid(uuid::Uuid),    // Reference existing installed server
    Json(String),         // Inline JSON definition (ephemeral)
}
```

### 5.2 MCP Startup Flow

```
1. Resolve specs → (existing_uuids, ephemeral_installations)
2. For existing servers:
   a. Check if already active/pending → skip
   b. Check if installed → add to start set
   c. Not found → MCPServerNotFound error
3. For ephemeral servers:
   a. Parse JSON → TemplatableMCPServerInstallation
   b. Inject secrets → installation.apply_secrets(&secrets)
4. Subscribe to TemplatableMCPServerManager state changes
5. Spawn inactive servers
6. Wait for all servers → Running state
7. Timeout after 60 seconds → MCPStartupFailed
```

### 5.3 MCP Server States

```rust
pub enum MCPServerState {
    Pending,
    Running,          // ← Target state for startup
    FailedToStart,    // ← Error state
    Stopped,
}
```

---

## 6. Execution Flow — Complete

```
oz agent run --prompt "Fix the login bug" --model claude-sonnet --harness oz

1. CLI Parse
   └── RunAgentArgs { prompt, model, harness, conversation, task_id, ... }

2. Pre-flight Checks
   ├── Ensure logged in (AuthStateProvider)
   ├── Refresh team metadata (with timeout)
   └── Sync Warp Drive (for saved prompts, environments)

3. Config Resolution
   ├── Load config file (if --config)
   ├── Resolve skill (if --skill)
   └── Merge: file < CLI args < skill

4. Build Task
   └── Task { prompt, model, mcp_specs, harness }

5. AgentDriver::new(options)
   ├── Validate auth state
   ├── Build env vars from secrets (with override protection)
   ├── Inject cloud provider env vars
   ├── Inject task env vars (WARP_TASK_ID, WARP_RUN_ID, etc.)
   ├── Detect sandbox → set IS_SANDBOX=1
   ├── Create TerminalDriver (headless terminal)
   └── Register streamer consumer (if resume)

6. AgentDriver::run(task)  ← async
   ├── Mark task IN_PROGRESS on server
   │
   ├── execute_run():
   │   ├── Check working directory exists
   │   ├── Prepare environment (if cloud environment)
   │   ├── Start profile MCP servers
   │   ├── Start CLI MCP servers
   │   ├── Start ephemeral MCP servers
   │   ├── Prepare harness (validate, configure)
   │   ├── Execute AI query OR start harness
   │   └── Wait for completion / idle timeout
   │
   ├── Unregister streamer consumer
   ├── Upload snapshot (if enabled)
   ├── Send result to caller
   └── Cleanup (cloud providers, temp files)

7. Error Reporting
   └── If driver error → report to server
       (ConversationError, MCPStartupFailed, BootstrapFailed, etc.)
```

---

## 7. Idle Timeout System

```rust
/// Generation-based timer cancellation system.
/// Avoids storing/cancelling timer handles.
struct IdleTimeoutSender<T> {
    tx_cell: Arc<Mutex<Option<oneshot::Sender<T>>>>,
    generation: Arc<AtomicUsize>,
}

impl<T> IdleTimeoutSender<T> {
    fn end_run_now(&self, value: T);              // Immediate completion
    fn end_run_after(&self, timeout: Duration, value: T);  // Delayed completion
    fn cancel_idle_timeout(&self);                // Cancel pending timer
}
```

**How it works:**
- Each `end_run_after` call increments `generation`
- Timer checks if its generation still matches
- If not → timer was "cancelled" by newer activity
- No need for actual timer handle cancellation

---

## 8. Error Taxonomy

```rust
pub enum AgentDriverError {
    // ═══ Environment ═══
    TerminalUnavailable,
    InvalidRuntimeState,
    InvalidWorkingDirectory { path, source },
    EnvironmentNotFound(String),
    EnvironmentSetupFailed(String),
    CloudProviderSetupFailed(CloudProviderSetupError),

    // ═══ Auth ═══
    NotLoggedIn,
    TeamMetadataRefreshTimeout,

    // ═══ MCP ═══
    MCPServerNotFound(Uuid),
    MCPStartupFailed,
    MCPJsonParseError(String),
    MCPMissingVariables,

    // ═══ Profile ═══
    ProfileError(String),
    AIWorkflowNotFound(String),

    // ═══ Conversation ═══
    ConversationError { error: RenderableAIError },
    ConversationCancelled { reason: CancellationReason },
    ConversationBlocked { blocked_action: String },
    ConversationLoadFailed(String),
    ConversationHarnessMismatch { conversation_id, expected, got },
    ConversationResumeStateMissing { harness, conversation_id },

    // ═══ Harness ═══
    HarnessCommandFailed { exit_code: i32 },
    HarnessSetupFailed { harness, reason },
    HarnessConfigSetupFailed { harness, error },
    TaskHarnessMismatch { task_id, expected, got },

    // ═══ Bootstrap ═══
    BootstrapFailed,
    ShareSessionFailed { error },
    WarpDriveSyncFailed,

    // ═══ Config ═══
    SkillResolutionFailed(String),
    ConfigBuildFailed(anyhow::Error),
    PromptResolutionFailed(anyhow::Error),
    SecretsFetchFailed(anyhow::Error),

    // ═══ AWS ═══
    AwsBedrockCredentialsFailed(String),
}
```

---

## 9. Constants & Timeouts

```rust
const MCP_SERVER_STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const HARNESS_SAVE_INTERVAL: Duration = Duration::from_secs(30);
const WARP_DRIVE_SYNC_TIMEOUT: Duration = Duration::from_secs(60);
const SETUP_FAILED_IDLE_TIMEOUT: Duration = Duration::from_secs(120);
const AUTO_RESUME_TIMEOUT: Duration = Duration::from_secs(120);
```

---

## 10. Octomus Adaptation

### 10.1 Simplified Harness for Octomus

```rust
// src-tauri/src/ai/harness.rs

/// Simplified harness trait for Octomus.
/// Unlike Warp's HarnessRunner (which manages CLI tools),
/// Octomus harnesses are API-based LLM backends.
pub trait AgentBackend: Send + Sync {
    /// Human-readable name (e.g., "OpenAI GPT-4o").
    fn name(&self) -> &str;

    /// Send a prompt and receive a streaming response.
    async fn execute(
        &self,
        prompt: &str,
        context: &AgentContext,
    ) -> Result<impl Stream<Item = AgentChunk>, AgentError>;

    /// Cancel an in-flight request.
    async fn cancel(&self) -> Result<(), AgentError>;
}

pub enum AgentChunk {
    Text(String),           // Streaming text
    ToolCall(ToolCall),     // Function/tool call
    Done(AgentResult),      // Completion
    Error(AgentError),      // Error
}
```

### 10.2 Agent Config for Octomus

```rust
// src-tauri/src/ai/config.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub model_id: String,                          // "gpt-4o", "claude-sonnet"
    pub provider: ProviderType,                     // OpenAI | Anthropic | Gemini
    pub api_key: Option<String>,                    // Or from env
    pub base_prompt: Option<String>,                // System prompt
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub tools: Vec<ToolDefinition>,                // Available tools
    pub mcp_servers: Vec<McpServerConfig>,          // MCP integrations
}

pub enum ProviderType {
    OpenAI,
    Anthropic,
    Google,
    Custom { base_url: String },
}
```

### 10.3 Simplified Driver for Octomus

```rust
// src-tauri/src/ai/driver.rs

/// Octomus agent driver — manages the AI execution lifecycle.
/// Simpler than Warp's AgentDriver because we don't need:
/// - Headless terminal sessions
/// - Cloud sandbox orchestration
/// - Session sharing
/// - Snapshot uploads
pub struct AgentDriver {
    config: AgentConfig,
    backend: Box<dyn AgentBackend>,
    conversation: Conversation,
    working_dir: PathBuf,
    status: DriverStatus,
}

pub enum DriverStatus {
    Idle,
    Preparing,
    Running { cancel_token: CancellationToken },
    Completed { result: AgentResult },
    Error { error: AgentError },
}
```
