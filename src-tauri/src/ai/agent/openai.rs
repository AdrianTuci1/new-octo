use std::time::Duration;

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde_json::{json, Value};
use uuid::Uuid;

mod prompt;
mod tools;

use super::{
    harness::{
        AgentCancellation, AgentEventSink, AgentHarness, AgentHarnessContext, AgentHarnessError,
        AgentHarnessOutcome,
    },
    types::{AgentInputMessage, AgentRunStatus, AgentToolCall, AgentUsage},
};

const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_MODEL_ID: &str = "gpt-4o-mini";
const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1";

#[derive(Debug, Clone)]
pub struct OpenAiCompatibleConfig {
    pub api_key: String,
    pub base_url: String,
    pub model_id: String,
    pub source: String,
    pub secret_id: String,
}

impl OpenAiCompatibleConfig {
    pub fn from_env() -> Option<Self> {
        let api_key = std::env::var("OCTOMUS_AI_API_KEY")
            .or_else(|_| std::env::var("OPENAI_API_KEY"))
            .ok()?;
        let base_url = std::env::var("OCTOMUS_AI_BASE_URL")
            .or_else(|_| std::env::var("OPENAI_BASE_URL"))
            .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        let model_id = std::env::var("OCTOMUS_AI_MODEL")
            .or_else(|_| std::env::var("OPENAI_MODEL"))
            .unwrap_or_else(|_| DEFAULT_MODEL_ID.to_string());

        Some(Self::new(
            api_key,
            Some(base_url),
            Some(model_id),
            "environment".to_string(),
        ))
    }

    pub fn new(
        api_key: String,
        base_url: Option<String>,
        model_id: Option<String>,
        source: String,
    ) -> Self {
        Self {
            api_key,
            base_url: normalize_base_url(base_url.as_deref().unwrap_or(DEFAULT_BASE_URL)),
            model_id: model_id
                .filter(|model| !model.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_MODEL_ID.to_string()),
            source,
            secret_id: format!("provider-{}", Uuid::new_v4()),
        }
    }

    pub fn with_secret_id(mut self, secret_id: Option<String>) -> Self {
        if let Some(secret_id) = secret_id.filter(|value| !value.trim().is_empty()) {
            self.secret_id = secret_id;
        }

        self
    }

    pub fn redacted_status(&self) -> (String, String, String, bool, String) {
        (
            "openai-compatible".to_string(),
            self.base_url.clone(),
            self.model_id.clone(),
            !self.api_key.trim().is_empty(),
            self.source.clone(),
        )
    }

    pub fn to_persisted_value(&self) -> Value {
        json!({
            "base_url": self.base_url,
            "model_id": self.model_id,
            "source": self.source,
            "secret_id": self.secret_id,
        })
    }

    pub fn from_persisted_value(value: &Value) -> Option<Self> {
        let api_key = value
            .get("api_key")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let base_url = value
            .get("base_url")
            .and_then(Value::as_str)
            .map(|value| value.to_string());
        let model_id = value
            .get("model_id")
            .and_then(Value::as_str)
            .map(|value| value.to_string());
        let source = value
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or("persisted")
            .to_string();
        let secret_id = value
            .get("secret_id")
            .and_then(Value::as_str)
            .map(|value| value.to_string())
            .unwrap_or_else(|| format!("provider-{}", Uuid::new_v4()));

        Some(Self::new(api_key, base_url, model_id, source).with_secret_id(Some(secret_id)))
    }
}

pub struct OpenAiCompatibleHarness {
    config: OpenAiCompatibleConfig,
}

impl OpenAiCompatibleHarness {
    pub fn new(config: OpenAiCompatibleConfig) -> Self {
        Self { config }
    }
}

impl AgentHarness for OpenAiCompatibleHarness {
    fn kind(&self) -> &'static str {
        "openai-compatible"
    }

    fn validate(&self) -> Result<(), AgentHarnessError> {
        if self.config.api_key.trim().is_empty() {
            return Err(AgentHarnessError::new(
                "OpenAI-compatible API key is empty.",
            ));
        }

        Ok(())
    }

    fn run_async(
        &self,
        context: AgentHarnessContext,
        sink: AgentEventSink,
        cancellation: AgentCancellation,
    ) -> impl std::future::Future<Output = Result<AgentHarnessOutcome, AgentHarnessError>> + Send
    {
        stream_chat_completion(self.config.clone(), context, sink, cancellation)
    }
}

async fn stream_chat_completion(
    config: OpenAiCompatibleConfig,
    context: AgentHarnessContext,
    sink: AgentEventSink,
    cancellation: AgentCancellation,
) -> Result<AgentHarnessOutcome, AgentHarnessError> {
    sink.status(
        AgentRunStatus::Preparing,
        Some(format!(
            "Connecting to {} with {}.",
            config.base_url, config.model_id
        )),
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| {
            AgentHarnessError::new(format!("Failed to create HTTP client: {error}"))
        })?;

    let endpoint = resolve_chat_endpoint(&config.base_url);
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if config.base_url == OPENROUTER_URL {
        headers.insert("X-Title", HeaderValue::from_static("Octomus"));
        if let Ok(referer) = std::env::var("OCTOMUS_AI_HTTP_REFERER") {
            if let Ok(value) = HeaderValue::from_str(&referer) {
                headers.insert("HTTP-Referer", value);
            }
        }
    }

    let tools = tools::build_tool_definitions();

    let request = json!({
        "model": context.model_id,
        "messages": build_chat_messages(&context),
        "stream": true,
        "tools": tools,
        "tool_choice": "auto"
    });

    if cancellation.is_cancelled() {
        return Ok(cancelled_outcome(&context.prompt, ""));
    }

    println!("[AI] Sending request to {}", endpoint);
    let response = client
        .post(&endpoint)
        .bearer_auth(config.api_key)
        .headers(headers)
        .json(&request)
        .send()
        .await
        .map_err(|error| AgentHarnessError::new(format!("Provider request failed: {error}")))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "Provider returned an unreadable error body.".to_string());
        return Err(AgentHarnessError::new(format!(
            "Provider returned HTTP {status}: {}",
            trim_error_body(&body)
        )));
    }

    sink.status(
        AgentRunStatus::Running,
        Some("Streaming model response.".to_string()),
    );

    let mut streamed = String::new();
    let mut streamed_reasoning = String::new();
    let mut current_tool_call_id: Option<String> = None;
    let mut current_tool_name = String::new();
    let mut current_tool_args = String::new();
    let mut usage = None;
    let mut sse_buffer = String::new();
    let mut byte_stream = response.bytes_stream();

    while let Some(next_chunk) = byte_stream.next().await {
        if cancellation.is_cancelled() {
            return Ok(cancelled_outcome(&context.prompt, &streamed));
        }

        let bytes = next_chunk
            .map_err(|error| AgentHarnessError::new(format!("Stream interrupted: {error}")))?;

        let text = String::from_utf8_lossy(&bytes);
        println!("[AI] Received chunk ({} bytes): {:?}", bytes.len(), text);
        sse_buffer.push_str(&text);

        while let Some(newline_index) = sse_buffer.find('\n') {
            let line = sse_buffer[..newline_index].trim().to_string();
            sse_buffer.drain(..=newline_index);

            if line.is_empty() {
                continue;
            }

            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data == "[DONE]" {
                    println!("[AI] Stream finished via [DONE]");
                    if !streamed_reasoning.trim().is_empty() {
                        sink.reasoning(streamed_reasoning.clone(), true);
                    }
                    return Ok(done_outcome(&context.prompt, &streamed, usage));
                }

                match handle_stream_payload(data, &sink, &mut streamed, &mut usage) {
                    Ok(Some(delta_payload)) => {
                        if let Some(reasoning_delta) = delta_payload.reasoning {
                            streamed_reasoning.push_str(&reasoning_delta);
                            sink.reasoning(streamed_reasoning.clone(), false);
                        }

                        if let Some(id) = delta_payload.id {
                            current_tool_call_id = Some(id);
                        }
                        if let Some(name) = delta_payload.name {
                            current_tool_name.push_str(&name);
                        }
                        if let Some(args) = delta_payload.arguments {
                            current_tool_args.push_str(&args);
                        }
                    }
                    Ok(None) => {}
                    Err(error) => {
                        println!(
                            "[AI] Failed to handle payload: {}. Data: {}",
                            error.message, data
                        );
                    }
                }
            } else if line.starts_with('{') && line.ends_with('}') {
                let _ = handle_stream_payload(&line, &sink, &mut streamed, &mut usage);
            }
        }

        if current_tool_call_id.is_some() && !current_tool_args.is_empty() {
            if let Ok(args_value) = serde_json::from_str::<Value>(&current_tool_args) {
                println!(
                    "[AI] Emitting tool call: {} with args: {}",
                    current_tool_name, args_value
                );
                sink.tool_call(AgentToolCall {
                    id: current_tool_call_id.take().expect("tool id should exist"),
                    name: current_tool_name.clone(),
                    args: args_value,
                });
                current_tool_name.clear();
                current_tool_args.clear();
            }
        }
    }

    let remaining = sse_buffer.trim();
    if !remaining.is_empty() {
        let data = remaining.strip_prefix("data:").unwrap_or(remaining).trim();
        if data != "[DONE]" {
            let _ = handle_stream_payload(data, &sink, &mut streamed, &mut usage);
        }
    }

    if !streamed_reasoning.trim().is_empty() {
        sink.reasoning(streamed_reasoning, true);
    }

    Ok(done_outcome(&context.prompt, &streamed, usage))
}

struct DeltaToolCall {
    id: Option<String>,
    name: Option<String>,
    arguments: Option<String>,
    reasoning: Option<String>,
}

fn handle_stream_payload(
    payload: &str,
    sink: &AgentEventSink,
    streamed: &mut String,
    usage: &mut Option<AgentUsage>,
) -> Result<Option<DeltaToolCall>, AgentHarnessError> {
    let value: Value = serde_json::from_str(payload)
        .map_err(|error| AgentHarnessError::new(format!("Invalid stream payload: {error}")))?;

    if let Some(parsed_usage) = parse_usage(value.get("usage")) {
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

    if let Some(content) = delta
        .and_then(|item| item.get("content"))
        .and_then(Value::as_str)
    {
        if !content.is_empty() {
            streamed.push_str(content);
            sink.token(content);
        }
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
            let arguments = function
                .and_then(|value| value.get("arguments"))
                .and_then(Value::as_str)
                .map(|value| value.to_string());

            return Ok(Some(DeltaToolCall {
                id,
                name,
                arguments,
                reasoning: None,
            }));
        }
    }

    let reasoning = extract_reasoning_delta(delta);
    if reasoning.is_some() {
        return Ok(Some(DeltaToolCall {
            id: None,
            name: None,
            arguments: None,
            reasoning,
        }));
    }

    Ok(None)
}

fn build_chat_messages(context: &AgentHarnessContext) -> Vec<Value> {
    let mut messages = Vec::new();
    let cwd = context.cwd.as_deref().unwrap_or("unknown");

    messages.push(json!({
        "role": "system",
        "content": prompt::build_system_prompt(cwd)
    }));

    for message in context.messages.iter().filter_map(sanitize_message) {
        let mut api_message = json!({
            "role": message.role,
            "content": message.content,
        });

        if let Some(tool_call_id) = message.tool_call_id {
            if let Some(object) = api_message.as_object_mut() {
                object.insert("tool_call_id".to_string(), json!(tool_call_id));
            }
        }

        if let Some(tool_calls) = message.tool_calls {
            if let Some(object) = api_message.as_object_mut() {
                object.insert("tool_calls".to_string(), tool_calls);
            }
        }

        messages.push(api_message);
    }

    if !context.prompt.trim().is_empty() {
        messages.push(json!({
            "role": "user",
            "content": context.prompt,
        }));
    }

    messages
}

fn sanitize_message(message: &AgentInputMessage) -> Option<AgentInputMessage> {
    let role = match message.role.as_str() {
        "system" | "user" | "assistant" | "tool" => message.role.clone(),
        _ => return None,
    };

    if message.content.trim().is_empty() && message.tool_calls.is_none() && role != "tool" {
        return None;
    }

    Some(AgentInputMessage {
        role,
        content: message.content.to_string(),
        tool_call_id: message.tool_call_id.clone(),
        tool_calls: message.tool_calls.clone(),
    })
}

fn parse_usage(value: Option<&Value>) -> Option<AgentUsage> {
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

fn extract_reasoning_delta(delta: Option<&Value>) -> Option<String> {
    let delta = delta?;

    if let Some(reasoning) = delta.get("reasoning").and_then(Value::as_str) {
        let trimmed = reasoning.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(reasoning) = delta.get("reasoning_content").and_then(Value::as_str) {
        let trimmed = reasoning.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
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

    let trimmed = merged.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

fn done_outcome(prompt: &str, streamed: &str, usage: Option<AgentUsage>) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::Completed,
        usage: usage.unwrap_or_else(|| AgentUsage::approximate(prompt, streamed)),
    }
}

fn cancelled_outcome(prompt: &str, streamed: &str) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::Cancelled,
        usage: AgentUsage::approximate(prompt, streamed),
    }
}

fn normalize_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

fn resolve_chat_endpoint(base_url: &str) -> String {
    if base_url.ends_with("/chat/completions") || base_url.ends_with("/responses") {
        return normalize_base_url(base_url);
    }

    format!("{}/chat/completions", normalize_base_url(base_url))
}

fn trim_error_body(body: &str) -> String {
    const MAX_CHARS: usize = 600;

    let mut trimmed = body.trim().chars().take(MAX_CHARS).collect::<String>();
    if body.trim().chars().count() > MAX_CHARS {
        trimmed.push_str("...");
    }
    trimmed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_base_url() {
        assert_eq!(
            normalize_base_url("https://api.openai.com/v1/"),
            "https://api.openai.com/v1"
        );
    }

    #[test]
    fn resolves_chat_completion_endpoint() {
        assert_eq!(
            resolve_chat_endpoint("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            resolve_chat_endpoint("https://api.openai.com/v1/chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn parses_usage_chunk() {
        let value = json!({
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
        });

        let usage = parse_usage(Some(&value)).expect("usage should parse");
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 5);
        assert_eq!(usage.total_tokens, 15);
    }
}
