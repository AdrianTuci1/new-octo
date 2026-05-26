use serde::{Deserialize, Serialize};

use super::block::TerminalBlock;
use super::session::{TerminalSessionKind, TerminalSessionProvider};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalSessionTargetRequest {
    pub kind: Option<TerminalSessionKind>,
    pub provider: Option<TerminalSessionProvider>,
    pub profile_id: Option<String>,
    pub host: Option<String>,
    pub username: Option<String>,
    pub connection_method: Option<String>,
}

impl CreateTerminalSessionTargetRequest {
    pub fn resolved_kind(&self) -> TerminalSessionKind {
        self.kind.clone().unwrap_or(TerminalSessionKind::Local)
    }

    pub fn resolved_provider(&self) -> TerminalSessionProvider {
        self.provider
            .clone()
            .unwrap_or_else(|| match self.resolved_kind() {
                TerminalSessionKind::Local => TerminalSessionProvider::Local,
                TerminalSessionKind::Cloud => TerminalSessionProvider::CustomVm,
            })
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalSessionRequest {
    pub session_id: Option<String>,
    pub rows: Option<u16>,
    pub cols: Option<u16>,
    pub cwd: Option<String>,
    pub target: Option<CreateTerminalSessionTargetRequest>,
}

impl CreateTerminalSessionRequest {
    pub fn resolved_target(&self) -> CreateTerminalSessionTargetRequest {
        self.target.clone().unwrap_or_default()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeTerminalSessionRequest {
    pub session_id: String,
    pub rows: u16,
    pub cols: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteTerminalSessionRequest {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTerminalCommandRequest {
    pub session_id: String,
    pub command: String,
    #[serde(default)]
    pub wait_for_completion: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalRunCommandResponse {
    pub block: TerminalBlock,
    pub output: String,
    pub pending: Option<bool>,
}
