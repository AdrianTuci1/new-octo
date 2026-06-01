use serde_json::Value;

use crate::ai::agent::harness::{AgentEventSink, AgentHarnessError};
use crate::ai::agent::types::AgentUsage;

use super::super::utils;
use super::thinking::ThinkingStreamState;

pub(super) struct DeltaToolCall {
    pub(super) id: Option<String>,
    pub(super) name: Option<String>,
    pub(super) arguments: Option<String>,
    pub(super) reasoning: Option<String>,
}

fn delta_tool_call_arguments_fragment(value: Option<&Value>) -> Option<String> {
    let value = value?;

    match value {
        Value::Null => None,
        Value::String(raw) => Some(raw.to_string()),
        Value::Object(_) | Value::Array(_) | Value::Bool(_) | Value::Number(_) => {
            serde_json::to_string(value).ok()
        }
    }
}

pub(super) fn handle_stream_payload(
    payload: &str,
    sink: &AgentEventSink,
    streamed: &mut String,
    streamed_reasoning: &mut String,
    thinking_state: &mut ThinkingStreamState,
    use_synthetic_thinking: bool,
    emit_visible_tokens: bool,
    emit_reasoning_tokens: bool,
    usage: &mut Option<AgentUsage>,
) -> Result<Option<DeltaToolCall>, AgentHarnessError> {
    let value: Value = serde_json::from_str(payload)
        .map_err(|error| AgentHarnessError::new(format!("Invalid stream payload: {error}")))?;

    if let Some(parsed_usage) = utils::parse_usage(value.get("usage")) {
        *usage = Some(parsed_usage);
    }

    let Some(choice) = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
    else {
        return Ok(None);
    };

    let delta = choice.get("delta");
    let message = choice.get("message");

    if let Some(content) = extract_stream_content_text(delta.and_then(|item| item.get("content"))) {
        thinking_state.push_content(
            &content,
            sink,
            streamed,
            streamed_reasoning,
            emit_visible_tokens,
            emit_reasoning_tokens,
        );
    }

    if let Some(content) = extract_stream_content_text(message.and_then(|item| item.get("content")))
    {
        thinking_state.push_content(
            &content,
            sink,
            streamed,
            streamed_reasoning,
            emit_visible_tokens,
            emit_reasoning_tokens,
        );
    }

    if let Some(tool_calls) = delta
        .and_then(|item| item.get("tool_calls"))
        .and_then(Value::as_array)
    {
        if let Some(tool_call) = tool_calls.first() {
            let id = tool_call
                .get("id")
                .and_then(Value::as_str)
                .map(|value| value.to_string());
            let function = tool_call.get("function");
            let name = function
                .and_then(|value| value.get("name"))
                .and_then(Value::as_str)
                .map(|value| value.to_string());
            let arguments = delta_tool_call_arguments_fragment(
                function.and_then(|value| value.get("arguments")),
            );

            return Ok(Some(DeltaToolCall {
                id,
                name,
                arguments,
                reasoning: None,
            }));
        }
    }

    if let Some(tool_calls) = message
        .and_then(|item| item.get("tool_calls"))
        .and_then(Value::as_array)
    {
        if let Some(tool_call) = tool_calls.first() {
            let id = tool_call
                .get("id")
                .and_then(Value::as_str)
                .map(|value| value.to_string());
            let function = tool_call.get("function");
            let name = function
                .and_then(|value| value.get("name"))
                .and_then(Value::as_str)
                .map(|value| value.to_string());
            let arguments = delta_tool_call_arguments_fragment(
                function.and_then(|value| value.get("arguments")),
            );

            return Ok(Some(DeltaToolCall {
                id,
                name,
                arguments,
                reasoning: None,
            }));
        }
    }

    let reasoning = utils::extract_reasoning_delta(delta);
    if reasoning.is_some() && !use_synthetic_thinking {
        return Ok(Some(DeltaToolCall {
            id: None,
            name: None,
            arguments: None,
            reasoning,
        }));
    }

    Ok(None)
}

fn extract_stream_content_text(content: Option<&Value>) -> Option<String> {
    let content = content?;

    if let Some(text) = content.as_str() {
        if !text.is_empty() {
            return Some(text.to_string());
        }
    }

    let parts = content.as_array()?;
    let text = parts
        .iter()
        .filter_map(|part| {
            part.get("text").and_then(Value::as_str).or_else(|| {
                part.get("type")
                    .and_then(Value::as_str)
                    .filter(|kind| *kind == "text")
                    .and_then(|_| part.get("text").and_then(Value::as_str))
            })
        })
        .collect::<Vec<_>>()
        .join("");

    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}
