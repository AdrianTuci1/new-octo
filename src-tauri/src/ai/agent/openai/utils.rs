use serde_json::Value;
use crate::ai::agent::types::AgentUsage;

pub fn normalize_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

pub fn resolve_chat_endpoint(base_url: &str) -> String {
    if base_url.ends_with("/chat/completions") || base_url.ends_with("/responses") {
        return normalize_base_url(base_url);
    }

    format!("{}/chat/completions", normalize_base_url(base_url))
}

pub fn trim_error_body(body: &str) -> String {
    const MAX_CHARS: usize = 600;

    let mut trimmed = body.trim().chars().take(MAX_CHARS).collect::<String>();
    if body.trim().chars().count() > MAX_CHARS {
        trimmed.push_str("...");
    }
    trimmed
}

pub fn parse_usage(value: Option<&Value>) -> Option<AgentUsage> {
    let usage = value?;
    if usage.is_null() {
        return None;
    }

    let prompt_tokens = usage
        .get("prompt_tokens")
        .and_then(Value::as_u64)
        .unwrap_or_default() as u32;
    let completion_tokens = usage
        .get("completion_tokens")
        .and_then(Value::as_u64)
        .unwrap_or_default() as u32;
    let total_tokens = usage
        .get("total_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(prompt_tokens as u64 + completion_tokens as u64) as u32;

    Some(AgentUsage {
        prompt_tokens,
        completion_tokens,
        total_tokens,
    })
}

pub fn extract_reasoning_delta(delta: Option<&Value>) -> Option<String> {
    let delta = delta?;

    if let Some(reasoning) = delta.get("reasoning").and_then(Value::as_str) {
        if !reasoning.is_empty() {
            return Some(reasoning.to_string());
        }
    }

    if let Some(reasoning) = delta.get("reasoning_content").and_then(Value::as_str) {
        if !reasoning.is_empty() {
            return Some(reasoning.to_string());
        }
    }

    let array_value = delta
        .get("reasoning_content")
        .or_else(|| delta.get("reasoning"))
        .and_then(Value::as_array)?;

    let merged = array_value
        .iter()
        .filter_map(|item| {
            item.get("text")
                .and_then(Value::as_str)
                .or_else(|| item.get("content").and_then(Value::as_str))
                .or_else(|| item.as_str())
        })
        .collect::<String>();

    if merged.is_empty() {
        return None;
    }

    Some(merged)
}
