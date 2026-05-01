use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRequest {
    pub run_id: Option<String>,
    pub conversation_id: Option<String>,
    pub assistant_message_id: Option<String>,
    pub prompt: String,
    pub cwd: Option<String>,
    pub model_id: Option<String>,
    #[serde(default)]
    pub messages: Vec<AgentInputMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInputMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderConfigRequest {
    pub api_key: String,
    pub base_url: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderStatus {
    pub provider: String,
    pub base_url: String,
    pub model_id: String,
    pub has_api_key: bool,
    pub source: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunLookupRequest {
    pub run_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStartResponse {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub status: AgentRunStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentRunStatus {
    Queued,
    Preparing,
    Running,
    WaitingForTool,
    Completed,
    Cancelled,
    Failed,
}

impl AgentRunStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            AgentRunStatus::Completed | AgentRunStatus::Cancelled | AgentRunStatus::Failed
        )
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunSnapshot {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub prompt: String,
    pub status: AgentRunStatus,
    pub status_message: Option<String>,
    pub model_id: String,
    pub cwd: Option<String>,
    pub error: Option<String>,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunStatusEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub status: AgentRunStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTokenEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolCall {
    pub id: String,
    pub name: String,
    pub args: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolCallEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub tool_call: AgentToolCall,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolResultEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub tool_call_id: String,
    pub result: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

impl AgentUsage {
    pub fn approximate(prompt: &str, completion: &str) -> Self {
        let prompt_tokens = approximate_tokens(prompt);
        let completion_tokens = approximate_tokens(completion);

        Self {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDoneEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub status: AgentRunStatus,
    pub usage: AgentUsage,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentErrorEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub error: String,
}

fn approximate_tokens(text: &str) -> u32 {
    let words = text.split_whitespace().count() as u32;
    words.max((text.chars().count() as u32 / 4).max(1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_approximation_reports_totals() {
        let usage = AgentUsage::approximate("hello world", "this is the response");

        assert!(usage.prompt_tokens > 0);
        assert!(usage.completion_tokens > 0);
        assert_eq!(
            usage.total_tokens,
            usage.prompt_tokens + usage.completion_tokens
        );
    }
}
