# Sesiuni, Background Execution & Cloud vs Local Agents

> Reverse-engineered din Warp: `terminal/model/session.rs` (65K), `ai/agent_sdk/` (63K),
> `ai/agent_sdk/driver/harness/` (17K), `crates/ai/src/agent/action/mod.rs` (30K).
> Adaptat pentru Octomus: Tauri v2 + Rust + React.

---

## 1. Session Management — Ciclul de Viață al Sesiunii

### 1.1 Modelul Sessions (Warp)

Warp gestionează multiple sesiuni terminale simultan. Fiecare tab/pane are propria sesiune,
iar subshell-urile (ssh, nix-shell, docker exec) creează sesiuni copil.

```
                    ┌──────────────────────────────────┐
                    │          Sessions (Model)         │
                    │                                  │
                    │  sessions: HashMap<SessionId, Session>
                    │  pending_session_start_times: HashMap<SessionId, Instant>
                    │  executor_command_tx: Sender<ExecutorCommandEvent>
                    │  env_vars: HashMap<SessionId, HashMap<String, String>>
                    │  remote_server_setup_states: HashMap<SessionId, RemoteServerSetupState>
                    └──────────┬───────────────────────┘
                               │
            ┌──────────────────┼──────────────────────┐
            ▼                  ▼                      ▼
     Session A            Session B              Session C
     (local bash)         (ssh remote)           (docker exec)
```

### 1.2 SessionId

```rust
// UUID-based, globally unique per session
pub use warp_core::SessionId;  // Re-export from warp_core
```

### 1.3 Session Lifecycle Events

```rust
pub enum SessionsEvent {
    /// Session registered but not yet bootstrapped (pending)
    SessionInitialized { session_id: SessionId },

    /// Shell hooks installed, env read, history loaded — fully operational
    SessionBootstrapped(Box<SessionBootstrappedEvent>),

    /// Environment variables changed (PATH, etc.)
    EnvironmentVariablesUpdated { session_id: SessionId },
}

pub struct SessionBootstrappedEvent {
    pub session_id: SessionId,
    pub spawning_command: String,    // e.g. "bash", "ssh user@host"
    pub shell: Shell,                // Shell type + version
    pub subshell_info: Option<SubshellInitializationInfo>,
    pub session_type: BootstrapSessionType,
}
```

### 1.4 Session Types

```rust
// At bootstrap time (hostname comparison)
pub enum BootstrapSessionType {
    Local,              // Same host as Warp
    WarpifiedRemote,    // Different host (SSH, etc.)
}

// After full connection (with host_id)
pub enum SessionType {
    Local,
    WarpifiedRemote {
        host_id: Option<warp_core::HostId>,  // Filled after handshake
    },
}
```

### 1.5 Session State Machine

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  [User opens tab] ──▶ register_pending_session()             │
│       │                  → SessionInitialized event          │
│       │                  → pending_session_start_times[id]   │
│       ▼                                                      │
│  [Shell boots + Warp hooks install] ──▶ create_pending()     │
│       │  InitShell DCS received                              │
│       │  SessionInfo partially populated                     │
│       ▼                                                      │
│  [Bootstrap DCS received] ──▶ merge_from_bootstrapped_value()│
│       │  SessionInfo fully populated with:                   │
│       │    - shell type, version, plugins                    │
│       │    - aliases, functions, builtins                    │
│       │    - env vars, PATH, home dir                        │
│       │    - histfile location                               │
│       ▼                                                      │
│  initialize_bootstrapped_session()                           │
│       │  → Session created with CommandExecutor              │
│       │  → History initialized                               │
│       │  → SessionBootstrapped event emitted                 │
│       │  → Telemetry sent                                    │
│       ▼                                                      │
│  [Session Active] ──▶ commands execute via CommandExecutor   │
│       │                                                      │
│       ├── [SSH detected] ──▶ Child session spawns            │
│       │     → WarpifiedRemote type                           │
│       │     → spawning_session_id = parent                   │
│       │                                                      │
│       └── [Exit/Close] ──▶ session removed from map          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.6 SessionInfo — Date Colectate la Bootstrap

```rust
pub struct SessionInfo {
    pub session_id: SessionId,
    pub shell: Shell,                          // Bash/Zsh/Fish/PowerShell + version
    pub launch_data: Option<ShellLaunchData>,  // WSL, MSYS2, etc.
    pub histfile: Option<String>,              // Path to history file
    pub user: String,                          // Username
    pub hostname: String,                      // Machine hostname
    pub path: Option<String>,                  // $PATH
    pub home_dir: Option<String>,              // $HOME
    pub editor: Option<String>,                // $EDITOR
    pub aliases: HashMap<SmolStr, String>,      // Shell aliases
    pub abbreviations: HashMap<SmolStr, String>,// Fish abbreviations
    pub function_names: HashSet<SmolStr>,       // Shell functions
    pub builtins: HashSet<SmolStr>,             // Shell builtins
    pub environment_variable_names: HashSet<SmolStr>,
    pub keywords: Vec<SmolStr>,                // Shell keywords
    pub session_type: BootstrapSessionType,
    pub is_legacy_ssh_session: IsLegacySSHSession,
    pub host_info: HostInfo,                   // OS category, distro
    pub subshell_info: Option<SubshellInitializationInfo>,
    pub spawning_session_id: Option<SessionId>, // Parent session
    pub tmux_control_mode: bool,
    pub wsl_name: Option<String>,
}
```

### 1.7 Session Struct — Runtime State

```rust
pub struct Session {
    info: SessionInfo,
    external_commands: Arc<OnceCell<HashSet<SmolStr>>>,  // Lazy-loaded from PATH
    command_executor: RwLock<Arc<dyn CommandExecutor>>,    // Swappable (reconnect)
    session_type: Mutex<SessionType>,                     // Updated after handshake
    command_case_sensitivity: TopLevelCommandCaseSensitivity,
}

// Key methods:
impl Session {
    fn id(&self) -> SessionId;
    fn shell(&self) -> &Shell;
    fn hostname(&self) -> &str;
    fn session_type(&self) -> SessionType;
    fn is_local(&self) -> bool;
    fn is_legacy_ssh_session(&self) -> bool;
    fn alias_names(&self) -> impl Iterator<Item = &str>;
    fn executable_names(&self) -> impl Iterator<Item = &str>;
    fn set_remote_host_id(&self, host_id: Option<HostId>);  // After SSH handshake
    fn set_command_executor(&self, new_executor: Arc<dyn CommandExecutor>);  // After reconnect
}
```

### 1.8 CommandExecutor — Executarea Comenzilor

```rust
// Trait for executing commands in a session's context
pub trait CommandExecutor: Send + Sync {
    fn execute_command(
        &self,
        command: &str,
        timeout: Duration,
    ) -> BoxFuture<Result<CommandOutput>>;
}

// Implementations:
// 1. InBandCommandExecutor — executes through the same PTY (in-band)
// 2. RemoteServerCommandExecutor — executes via remote server (SSH sessions)
// 3. TestCommandExecutor — mock for tests
```

---

## 2. Cloud Agent vs Local Agent

### 2.1 StartAgentExecutionMode

Aceasta este distincția fundamentală în Warp:

```rust
pub enum StartAgentExecutionMode {
    /// Agent runs on the user's local machine
    Local {
        /// None = legacy embedded Oz agent
        /// Some("claude-code") = third-party CLI harness
        harness_type: Option<String>,
    },

    /// Agent runs on cloud infrastructure (Warp's servers)
    Remote {
        environment_id: String,              // Cloud env identifier
        skill_references: Vec<SkillReference>, // Skills to load
        model_id: String,                    // LLM to use
        computer_use_enabled: bool,          // Screen control access
        worker_host: String,                 // Cloud worker URL
        harness_type: String,                // Which harness runs
        title: String,                       // Display name
    },
}

// Convenience constructors:
StartAgentExecutionMode::local_with_defaults()  // Local { harness_type: None }
StartAgentExecutionMode::local_harness("claude-code".to_string())
StartAgentExecutionMode::remote_with_defaults("env-123".to_string())
```

### 2.2 HarnessKind — Dispatch System

```rust
pub(crate) enum HarnessKind {
    Oz,                                  // Warp's built-in agent (Oz)
    ThirdParty(Box<dyn ThirdPartyHarness>),  // Claude, Gemini, Codex
    Unsupported(Harness),                // Known but not supported
}

// Build from CLI --harness flag:
fn harness_kind(harness: Harness) -> Result<HarnessKind> {
    match harness {
        Harness::Oz      => Ok(HarnessKind::Oz),
        Harness::Claude  => Ok(HarnessKind::ThirdParty(Box::new(ClaudeHarness))),
        Harness::Gemini  => Ok(HarnessKind::ThirdParty(Box::new(GeminiHarness))),
        Harness::Codex   => Ok(HarnessKind::ThirdParty(Box::new(CodexHarness))),
        Harness::OpenCode => Ok(HarnessKind::Unsupported(Harness::OpenCode)),
        Harness::Unknown => Err(AgentDriverError::InvalidRuntimeState),
    }
}
```

### 2.3 ThirdPartyHarness Trait

```rust
#[async_trait]
pub(crate) trait ThirdPartyHarness: Send + Sync {
    /// Which harness enum value this is (Claude, Gemini, etc.)
    fn harness(&self) -> Harness;

    /// CLI agent type for session tracking
    fn cli_agent(&self) -> CLIAgent;

    /// URL to install docs (shown if CLI not found)
    fn install_docs_url(&self) -> Option<&'static str>;

    /// Validate CLI is installed on PATH
    fn validate(&self) -> Result<(), AgentDriverError>;

    /// Prepare env config (API keys, config files) before launch
    fn prepare_environment_config(
        &self,
        working_dir: &Path,
        system_prompt: Option<&str>,
        secrets: &HashMap<String, ManagedSecretValue>,
    ) -> Result<(), AgentDriverError>;

    /// Fetch resume state from server for an existing conversation
    async fn fetch_resume_payload(
        &self,
        conversation_id: &AIConversationId,
        client: Arc<dyn HarnessSupportClient>,
    ) -> Result<Option<ResumePayload>, AgentDriverError>;

    /// Build a runner for this harness with the given prompt
    fn build_runner(
        &self,
        prompt: &str,
        system_prompt: Option<&str>,
        resumption_prompt: Option<&str>,
        working_dir: &Path,
        task_id: Option<AmbientAgentTaskId>,
        server_api: Arc<ServerApi>,
        terminal_driver: ModelHandle<TerminalDriver>,
        resume: Option<ResumePayload>,
    ) -> Result<Box<dyn HarnessRunner>, AgentDriverError>;
}
```

### 2.4 HarnessRunner Trait — Runtime Lifecycle

```rust
#[async_trait]
pub(crate) trait HarnessRunner: Send + Sync {
    /// Create conversation on server + start CLI command in terminal
    async fn start(
        &self,
        foreground: &ModelSpawner<AgentDriver>,
    ) -> Result<CommandHandle, AgentDriverError>;

    /// Save conversation state (transcript upload)
    async fn save_conversation(
        &self,
        save_point: SavePoint,     // Periodic | Final | PostTurn
        foreground: &ModelSpawner<AgentDriver>,
    ) -> Result<()>;

    /// Gracefully ask harness to exit
    async fn exit(&self, foreground: &ModelSpawner<AgentDriver>) -> Result<()>;

    /// Handle CLI session update (prompt submit, tool complete)
    async fn handle_session_update(&self, foreground: &ModelSpawner<AgentDriver>) -> Result<()>;

    /// Clean up after harness exits
    async fn cleanup(&self, foreground: &ModelSpawner<AgentDriver>) -> Result<()>;
}

pub(crate) enum SavePoint {
    Periodic,   // Auto-save to minimize data loss
    Final,      // After harness completed
    PostTurn,   // After agent turn finished
}
```

### 2.5 AgentRunPrompt — Local vs ServerSide

```rust
pub enum AgentRunPrompt {
    /// Prompt resolved locally (user typed it or merged from skill)
    Local(String),

    /// Prompt lives on server — task_id set, no local prompt
    ServerSide {
        skill: Option<ParsedSkill>,
        attachments_dir: Option<PathBuf>,
    },
}
```

### 2.6 Task — What Gets Executed

```rust
pub struct Task {
    pub prompt: AgentRunPrompt,        // Local or ServerSide
    pub model: Option<LLMId>,          // Optional model override
    pub profile: Option<String>,       // Agent profile
    pub mcp_specs: Vec<MCPSpec>,       // MCP servers to connect
    pub harness: HarnessKind,          // Which harness to use
}
```

### 2.7 Cloud Architecture Flow

```
                         ┌──────────────────────┐
                         │     User Prompt       │
                         └───────────┬──────────┘
                                     │
              ┌──────────────────────┼───────────────────────┐
              ▼                      │                       ▼
    ┌─────────────────┐              │             ┌─────────────────────┐
    │  LOCAL AGENT    │              │             │  CLOUD/REMOTE AGENT │
    │                 │              │             │                     │
    │  build_merged_  │              │             │  build_server_side_ │
    │  config_and_    │              │             │  task()             │
    │  task()         │              │             │                     │
    │                 │              │             │  AgentRunPrompt::   │
    │  AgentRunPrompt │              │             │  ServerSide         │
    │  ::Local(str)   │              │             │                     │
    │                 │              │             │  task_id set         │
    │  No task_id     │              │             │  Config on server   │
    └────────┬────────┘              │             └────────┬────────────┘
             │                       │                      │
             ▼                       │                      ▼
    ┌─────────────────┐              │             ┌─────────────────────┐
    │  HarnessKind    │              │             │  HarnessKind        │
    │                 │              │             │                     │
    │  Oz: embedded   │              │             │  ThirdParty: Claude │
    │    agent, runs  │              │             │    CLI runs in      │
    │    in-process   │              │             │    cloud worker     │
    │                 │              │             │                     │
    │  ThirdParty:    │              │             │  environment_id     │
    │    Claude CLI   │              │             │  worker_host        │
    │    runs locally │              │             │  skill_references   │
    └────────┬────────┘              │             └────────┬────────────┘
             │                       │                      │
             ▼                       │                      ▼
    ┌─────────────────┐              │             ┌─────────────────────┐
    │  PTY Terminal   │              │             │  Cloud Worker VM    │
    │  (user machine) │              │             │  (Warp servers)     │
    │                 │              │             │                     │
    │  Claude Code    │              │             │  Docker container   │
    │  process runs   │              │             │  with agent CLI     │
    │  in a PTY block │              │             │  + MCP servers      │
    │                 │              │             │                     │
    │  Transcript     │              │             │  Transcript         │
    │  saved locally  │              │             │  uploaded to server │
    └─────────────────┘              │             └─────────────────────┘
                                     │
                         ┌───────────┴──────────┐
                         │ Both paths emit same │
                         │ AIAgentActionType     │
                         │ events to the UI     │
                         └──────────────────────┘
```

---

## 3. Background Execution — Ambient Agents

### 3.1 Env Vars Propagate to Child Harnesses

```rust
fn task_env_vars(
    task_id: Option<&AmbientAgentTaskId>,
    parent_run_id: Option<&str>,
    selected_harness: Harness,
) -> HashMap<OsString, OsString> {
    // OZ_RUN_ID       — current task ID
    // OZ_PARENT_RUN_ID — parent task (for child orchestration)
    // OZ_CLI          — path to oz CLI binary
    // OZ_HARNESS      — harness name for telemetry
    // OZ_MESSAGE_LISTENER_* — inter-process messaging (Claude)
    // SERVER_ROOT_URL_OVERRIDE — server URL (dev only)
}
```

### 3.2 Config Merge Precedence

```
[1] Config file (--file agent.toml)
        ↓ overridden by
[2] CLI arguments (--model, --mcp, --harness)
        ↓ overridden by
[3] Skill instructions (--skill my-skill)

// Except for server-side tasks:
// No config file merge — server has the canonical config
// Only CLI args apply as overrides
```

### 3.3 Resume / Conversation Persistence

```rust
// Each harness can implement resume:
async fn fetch_resume_payload(
    &self,
    conversation_id: &AIConversationId,
    client: Arc<dyn HarnessSupportClient>,
) -> Result<Option<ResumePayload>>;

// ResumePayload carries harness-specific state:
pub(crate) enum ResumePayload {
    Claude(ClaudeResumeInfo),  // Session IDs + transcript
    // Future: Gemini, Codex variants
}

// Conversation state saved at multiple points:
enum SavePoint {
    Periodic,   // Timer-based auto-save
    Final,      // After harness exits
    PostTurn,   // After each agent turn
}
```

---

## 4. Octomus Adaptation

### 4.1 Session Management Simplificat

```rust
// src-tauri/src/terminal/session.rs

use std::collections::HashMap;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

pub type SessionId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OctomusSession {
    pub id: SessionId,
    pub shell: String,           // "bash", "zsh", "fish"
    pub shell_version: Option<String>,
    pub cwd: String,             // Current working directory
    pub user: String,
    pub hostname: String,
    pub env_vars: HashMap<String, String>,
    pub aliases: HashMap<String, String>,
    pub is_alive: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub session_type: OctomusSessionType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OctomusSessionType {
    Local,
    SSH { host: String, user: String },
    Docker { container_id: String },
}

#[derive(Debug)]
pub struct SessionManager {
    sessions: HashMap<SessionId, OctomusSession>,
    active_session_id: Option<SessionId>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self { sessions: HashMap::new(), active_session_id: None }
    }

    pub fn spawn_session(&mut self, shell: &str, cwd: &str) -> Result<SessionId, String> {
        let id = Uuid::new_v4().to_string();
        let session = OctomusSession {
            id: id.clone(),
            shell: shell.to_string(),
            shell_version: None,
            cwd: cwd.to_string(),
            user: whoami::username(),
            hostname: gethostname::gethostname().to_string_lossy().to_string(),
            env_vars: std::env::vars().collect(),
            aliases: HashMap::new(),
            is_alive: true,
            created_at: chrono::Utc::now(),
            session_type: OctomusSessionType::Local,
        };
        self.sessions.insert(id.clone(), session);
        if self.active_session_id.is_none() {
            self.active_session_id = Some(id.clone());
        }
        Ok(id)
    }

    pub fn get(&self, id: &str) -> Option<&OctomusSession> {
        self.sessions.get(id)
    }

    pub fn active_session(&self) -> Option<&OctomusSession> {
        self.active_session_id.as_ref().and_then(|id| self.sessions.get(id))
    }

    pub fn kill_session(&mut self, id: &str) -> bool {
        if let Some(session) = self.sessions.get_mut(id) {
            session.is_alive = false;
            true
        } else {
            false
        }
    }
}
```

### 4.2 Agent Provider — Cloud vs Local

```rust
// src-tauri/src/ai/providers/mod.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentLocation {
    /// Agent runs locally, API called from user's machine
    Local {
        provider: ProviderType,
        api_key: String,
    },
    /// Agent runs on Octomus cloud infrastructure
    Cloud {
        endpoint: String,          // "https://api.octomus.ai/agent/v1"
        auth_token: String,        // JWT token
        model_id: String,
        environment_id: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProviderType {
    OpenAI,
    Anthropic,
    Google,
    Ollama,    // Fully local, no API key needed
    Custom { base_url: String },
}

#[async_trait]
pub trait AgentBackend: Send + Sync {
    /// Where does this agent execute?
    fn location(&self) -> AgentLocation;

    /// Human-readable name
    fn name(&self) -> &str;

    /// Does it support tool use?
    fn supports_tools(&self) -> bool;

    /// Stream a response
    async fn stream_response(
        &self,
        messages: Vec<ChatMessage>,
        config: ModelConfig,
        tx: tokio::sync::mpsc::Sender<StreamEvent>,
    ) -> Result<(), AgentError>;

    /// Cancel in-flight request
    async fn cancel(&self) -> Result<(), AgentError>;
}
```

### 4.3 Key Differences Table

| Aspect | Local Agent | Cloud Agent |
|--------|-------------|-------------|
| **Execution** | Runs on user's machine | Runs on cloud worker VM |
| **API Keys** | User provides own keys | Managed by Octomus |
| **Latency** | Direct API call | Via Octomus relay |
| **Cost** | User's API credits | Octomus subscription |
| **Privacy** | Data stays local | Data passes through cloud |
| **Tools** | Access to local FS, terminal | Access to cloud sandbox |
| **Models** | Any supported model | Curated model list |
| **Offline** | Ollama supported | Requires internet |
| **Resumption** | State in local SQLite | State on server |
| **MCP** | Local MCP servers | Cloud MCP servers |

### 4.4 Tauri Commands

```rust
// src-tauri/src/terminal/mod.rs

#[tauri::command]
async fn session_list(
    state: State<'_, AppState>,
) -> Result<Vec<OctomusSession>, String>;

#[tauri::command]
async fn session_info(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<OctomusSession, String>;

#[tauri::command]
async fn session_set_active(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String>;

// src-tauri/src/ai/mod.rs

#[tauri::command]
async fn agent_set_provider(
    state: State<'_, AppState>,
    location: AgentLocation,
) -> Result<(), String>;

#[tauri::command]
async fn agent_get_provider(
    state: State<'_, AppState>,
) -> Result<AgentLocation, String>;
```

### 4.5 React Types

```typescript
// src/types/session.ts

export interface OctomusSession {
  id: string;
  shell: string;
  shellVersion?: string;
  cwd: string;
  user: string;
  hostname: string;
  isAlive: boolean;
  createdAt: string;
  sessionType: SessionType;
}

export type SessionType =
  | { type: 'local' }
  | { type: 'ssh'; host: string; user: string }
  | { type: 'docker'; containerId: string };

// src/types/provider.ts

export type AgentLocation =
  | { type: 'local'; provider: ProviderType; apiKey: string }
  | { type: 'cloud'; endpoint: string; authToken: string; modelId: string };

export type ProviderType =
  | 'openai' | 'anthropic' | 'google' | 'ollama'
  | { custom: { baseUrl: string } };
```

### 4.6 Provider Selection UI

```
┌─────────────────────────────────────────────────────┐
│  Agent Provider Settings                             │
│                                                     │
│  ● Local (Your API keys)                            │
│    ┌─────────────────────────────────────┐          │
│    │ Provider: [Anthropic ▾]             │          │
│    │ API Key:  [sk-ant-••••••••••••]     │          │
│    │ Model:    [claude-sonnet-4-20250514 ▾]│        │
│    └─────────────────────────────────────┘          │
│                                                     │
│  ○ Octomus Cloud                                    │
│    ┌─────────────────────────────────────┐          │
│    │ Status: Connected ✓                 │          │
│    │ Credits: 847 / 1000                 │          │
│    │ Model:   [Auto ▾]                   │          │
│    └─────────────────────────────────────┘          │
│                                                     │
│  ○ Ollama (Offline)                                 │
│    ┌─────────────────────────────────────┐          │
│    │ Endpoint: http://localhost:11434     │          │
│    │ Model:    [llama3.1:70b ▾]          │          │
│    │ Status:   Running ✓                 │          │
│    └─────────────────────────────────────┘          │
│                                                     │
│  [Save & Apply]                                     │
└─────────────────────────────────────────────────────┘
```
