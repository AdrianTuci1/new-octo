use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CloudProvider {
    CustomVm,
    Modal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CloudRunStatus {
    Booting,
    PreparingWorkspace,
    RunningHarness,
    PushingChanges,
    CreatingPullRequest,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum HarnessKind {
    Octomus,
    Codex,
    Claude,
    Gemini,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRunGitSpec {
    pub repo: String,
    pub base_branch: String,
    pub work_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRunLlmSpec {
    pub provider_label: String,
    pub base_url: String,
    pub model_id: String,
    pub has_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRunPolicy {
    pub allow_push: bool,
    pub allow_pr_create: bool,
    pub allow_merge: bool,
    pub max_runtime_minutes: Option<u32>,
}

impl Default for CloudRunPolicy {
    fn default() -> Self {
        Self {
            allow_push: false,
            allow_pr_create: false,
            allow_merge: false,
            max_runtime_minutes: Some(60),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRunLaunchSpec {
    pub session_id: String,
    pub provider: CloudProvider,
    pub harness: HarnessKind,
    pub control_url: Option<String>,
    pub workspace: String,
    pub prompt: Option<String>,
    pub git: Option<CloudRunGitSpec>,
    pub llm: Option<CloudRunLlmSpec>,
    pub policy: CloudRunPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRunEvent {
    pub session_id: String,
    pub sequence: u64,
    pub event: CloudRunEventKind,
    pub timestamp_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CloudRunEventKind {
    Status {
        status: CloudRunStatus,
        message: Option<String>,
    },
    TerminalOutput {
        stream: TerminalStream,
        data: String,
    },
    GitStatus {
        branch: Option<String>,
        dirty: bool,
    },
    LlmConfig {
        provider_label: String,
        base_url: String,
        model_id: String,
        has_api_key: bool,
    },
    PullRequestCreated {
        url: String,
    },
    Error {
        message: String,
    },
    Done {
        status: CloudRunStatus,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudCliBootstrapSpec {
    pub install_url: String,
    pub install_dir: String,
    pub binary_name: String,
}

impl Default for CloudCliBootstrapSpec {
    fn default() -> Self {
        Self {
            install_url: "https://get.octomus.dev/linux/octomus-cli".to_string(),
            install_dir: "$HOME/.octomus/bin".to_string(),
            binary_name: "octomus-cli".to_string(),
        }
    }
}
