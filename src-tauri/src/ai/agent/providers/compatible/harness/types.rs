use crate::ai::agent::types::AgentUsage;
use serde_json::Value;

#[derive(Debug, Clone)]
pub(super) struct CollectedToolCall {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) args: Value,
    pub(super) raw_args: String,
    pub(super) google_thought_signature: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct StageModelResponse {
    pub(super) visible_text: String,
    pub(super) tool_call: Option<CollectedToolCall>,
    pub(super) usage: Option<AgentUsage>,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct StagePassOptions {
    pub(super) emit_visible_tokens: bool,
    pub(super) emit_reasoning_tokens: bool,
}

pub(super) enum ActionStageOutcome {
    Continue,
    Waiting(String),
    Completed(String),
}
