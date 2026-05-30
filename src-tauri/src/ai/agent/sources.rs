use std::process::Command;

use super::types::{
    AgentModelSourceConnectRequest, AgentModelSourceStatus, AgentSourceModel,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentModelSourceKind {
    OpenAiCompatible,
    Codex,
    Claude,
}

impl AgentModelSourceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenAiCompatible => "openai-compatible",
            Self::Codex => "codex",
            Self::Claude => "claude",
        }
    }

    pub fn from_model_id(model_id: &str) -> Option<Self> {
        if model_id.starts_with("codex:") {
            return Some(Self::Codex);
        }
        if model_id.starts_with("claude:") {
            return Some(Self::Claude);
        }
        None
    }
}

pub fn list_model_sources() -> Vec<AgentModelSourceStatus> {
    vec![codex_status(), claude_status()]
}

pub fn connect_model_source(request: AgentModelSourceConnectRequest) -> Result<AgentModelSourceStatus, String> {
    match request.kind.trim() {
        "codex" => {
            let status = codex_status();
            if !status.available {
                return Err(
                    "Codex CLI was not found on this machine. Install or open Codex first, then try again."
                        .to_string(),
                );
            }
            if !status.connected {
                return Err(
                    "Codex is installed but not authenticated. Run `codex login` and try again."
                        .to_string(),
                );
            }
            Ok(status)
        }
        "claude" => {
            let status = claude_status();
            if !status.available {
                return Err(
                    "Claude Code CLI was not found on this machine. Install it, run `claude auth login`, then try again."
                        .to_string(),
                );
            }
            if !status.connected {
                return Err(
                    "Claude Code is installed but not authenticated. Run `claude auth login` or export `CLAUDE_CODE_OAUTH_TOKEN`, then try again."
                        .to_string(),
                );
            }
            Ok(status)
        }
        other => Err(format!("unsupported model source: {other}")),
    }
}

pub fn parse_source_model(model_id: &str) -> Option<(AgentModelSourceKind, String)> {
    let kind = AgentModelSourceKind::from_model_id(model_id)?;
    let (_, raw_model_id) = model_id.split_once(':')?;
    let normalized = raw_model_id.trim();
    if normalized.is_empty() {
        return None;
    }
    Some((kind, normalized.to_string()))
}

fn codex_status() -> AgentModelSourceStatus {
    let binary_path = resolve_binary("codex");
    let Some(path) = binary_path.clone() else {
        return AgentModelSourceStatus {
            kind: "codex".to_string(),
            label: "Codex".to_string(),
            available: false,
            connected: false,
            binary_path: None,
            auth_source: None,
            message: Some("Codex CLI is not installed.".to_string()),
            models: Vec::new(),
        };
    };

    let output = Command::new(&path).args(["login", "status"]).output();
    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let connected = output.status.success()
                && stdout.to_ascii_lowercase().contains("logged in");
            AgentModelSourceStatus {
                kind: "codex".to_string(),
                label: "Codex".to_string(),
                available: true,
                connected,
                binary_path: Some(path),
                auth_source: connected.then(|| "local-cli".to_string()),
                message: if connected {
                    Some(stdout)
                } else {
                    Some("Codex CLI is installed but not logged in.".to_string())
                },
                models: if connected {
                    vec![AgentSourceModel {
                        id: "codex:default".to_string(),
                        source_kind: "codex".to_string(),
                        label: "Codex Default".to_string(),
                        provider: "Codex".to_string(),
                        provider_id: "custom".to_string(),
                        model_id: "codex:default".to_string(),
                        note: "Uses the local Codex account and its default model routing.".to_string(),
                        supports_attachments: true,
                    }]
                } else {
                    Vec::new()
                },
            }
        }
        Err(error) => AgentModelSourceStatus {
            kind: "codex".to_string(),
            label: "Codex".to_string(),
            available: true,
            connected: false,
            binary_path: Some(path),
            auth_source: None,
            message: Some(format!("Failed to query Codex auth status: {error}")),
            models: Vec::new(),
        },
    }
}

fn claude_status() -> AgentModelSourceStatus {
    let binary_path = resolve_binary("claude");
    let Some(path) = binary_path.clone() else {
        return AgentModelSourceStatus {
            kind: "claude".to_string(),
            label: "Claude Code".to_string(),
            available: false,
            connected: false,
            binary_path: None,
            auth_source: None,
            message: Some("Claude Code CLI is not installed.".to_string()),
            models: Vec::new(),
        };
    };

    let output = Command::new(&path).args(["auth", "status"]).output();
    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let connected = output.status.success();
            AgentModelSourceStatus {
                kind: "claude".to_string(),
                label: "Claude Code".to_string(),
                available: true,
                connected,
                binary_path: Some(path),
                auth_source: connected.then(|| "local-cli".to_string()),
                message: if connected {
                    Some(stdout)
                } else if !stderr.is_empty() {
                    Some(stderr)
                } else {
                    Some("Claude Code CLI is installed but not authenticated.".to_string())
                },
                models: if connected {
                    vec![
                        AgentSourceModel {
                            id: "claude:default".to_string(),
                            source_kind: "claude".to_string(),
                            label: "Claude Default".to_string(),
                            provider: "Claude Code".to_string(),
                            provider_id: "custom".to_string(),
                            model_id: "claude:default".to_string(),
                            note: "Uses the subscription-backed default model routing from Claude Code.".to_string(),
                            supports_attachments: true,
                        },
                        AgentSourceModel {
                            id: "claude:sonnet".to_string(),
                            source_kind: "claude".to_string(),
                            label: "Claude Sonnet".to_string(),
                            provider: "Claude Code".to_string(),
                            provider_id: "custom".to_string(),
                            model_id: "claude:sonnet".to_string(),
                            note: "Pins Claude Code to the latest Sonnet alias.".to_string(),
                            supports_attachments: true,
                        },
                        AgentSourceModel {
                            id: "claude:opus".to_string(),
                            source_kind: "claude".to_string(),
                            label: "Claude Opus".to_string(),
                            provider: "Claude Code".to_string(),
                            provider_id: "custom".to_string(),
                            model_id: "claude:opus".to_string(),
                            note: "Pins Claude Code to the latest Opus alias.".to_string(),
                            supports_attachments: true,
                        },
                    ]
                } else {
                    Vec::new()
                },
            }
        }
        Err(error) => AgentModelSourceStatus {
            kind: "claude".to_string(),
            label: "Claude Code".to_string(),
            available: true,
            connected: false,
            binary_path: Some(path),
            auth_source: None,
            message: Some(format!("Failed to query Claude auth status: {error}")),
            models: Vec::new(),
        },
    }
}

fn resolve_binary(binary: &str) -> Option<String> {
    if let Ok(output) = Command::new("which").arg(binary).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    None
}
