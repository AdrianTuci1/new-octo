use serde_json::json;

use crate::ai::agent::harness::AgentEventSink;
use crate::ai::agent::types::{AgentInputMessage, AgentToolCall};

use super::context;
use super::types::CollectedToolCall;

pub(super) fn system_message(content: impl Into<String>) -> AgentInputMessage {
    AgentInputMessage {
        role: "system".to_string(),
        content: content.into(),
        tool_call_id: None,
        tool_calls: None,
    }
}

pub(super) fn emit_internal_tool_call(
    sink: &AgentEventSink,
    negotiation_messages: &mut Vec<AgentInputMessage>,
    tool_call: &CollectedToolCall,
) {
    let google_thought_signature = tool_call
        .google_thought_signature
        .clone()
        .unwrap_or_else(|| "skip_thought_signature_validator".to_string());
    sink.tool_call(AgentToolCall {
        id: tool_call.id.clone(),
        name: tool_call.name.clone(),
        args: tool_call.args.clone(),
        extra_content: Some(json!({
            "google": {
                "thought_signature": google_thought_signature,
            }
        })),
    });
    negotiation_messages.push(assistant_tool_call_message(tool_call));
}

pub(super) fn tool_result_message(
    tool_call_id: &str,
    content: impl Into<String>,
) -> AgentInputMessage {
    AgentInputMessage {
        role: "tool".to_string(),
        content: content.into(),
        tool_call_id: Some(tool_call_id.to_string()),
        tool_calls: None,
    }
}

pub(super) fn rejected_tool_result_message(
    tool_call_id: &str,
    reason: impl Into<String>,
) -> AgentInputMessage {
    let reason = reason.into();
    tool_result_message(
        tool_call_id,
        json!({
            "error": reason
        })
        .to_string(),
    )
}

pub(super) fn summarize_internal_tool_result(tool_call: &CollectedToolCall) -> String {
    match tool_call.name.as_str() {
        "propose_plan" | "update_plan" => format!(
            "Plan artifact accepted by the runtime and displayed to the user: {}",
            tool_call.raw_args
        ),
        "plan_execution" => format!(
            "Plan execution update accepted by the runtime and applied locally: {}",
            tool_call.raw_args
        ),
        "suggest_follow_up" => format!(
            "Follow-up suggestion metadata captured by the runtime: {}",
            tool_call.raw_args
        ),
        _ => format!("Internal tool `{}` acknowledged: {}", tool_call.name, tool_call.raw_args),
    }
}

fn assistant_tool_call_message(tool_call: &CollectedToolCall) -> AgentInputMessage {
    AgentInputMessage {
        role: "assistant".to_string(),
        content: String::new(),
        tool_call_id: None,
        tool_calls: Some(context::normalize_outbound_tool_calls(&json!([
            {
                "id": tool_call.id,
                "type": "function",
                "extra_content": {
                    "google": {
                        "thought_signature": tool_call
                            .google_thought_signature
                            .as_ref()
                            .cloned()
                            .unwrap_or_else(|| "skip_thought_signature_validator".to_string()),
                    }
                },
                "function": {
                    "name": tool_call.name,
                    "arguments": tool_call.raw_args,
                }
            }
        ]))),
    }
}
