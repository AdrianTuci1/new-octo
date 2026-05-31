use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde_json::{json, Map, Value};
use std::error::Error as _;

use crate::ai::agent::types::AgentUsage;
use crate::ai::agent::{OpenAiCompatibleConfig, OpenAiCompatibleProvider};

#[derive(Debug, Clone)]
pub struct ProviderCompletionRequest {
    pub model: String,
    pub messages: Vec<Value>,
    pub tools: Option<Value>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub response_mime_type: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ProviderFunctionCall {
    pub id: Option<String>,
    pub name: String,
    pub arguments: Value,
    pub thought_signature: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ProviderCompletionResponse {
    pub text: String,
    pub function_calls: Vec<ProviderFunctionCall>,
    pub usage: Option<AgentUsage>,
}

pub fn normalize_tool_call_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Some((_, suffix)) = trimmed.split_once(':') {
        let normalized_suffix = suffix.trim();
        if !normalized_suffix.is_empty() {
            return normalized_suffix.to_string();
        }
    }

    trimmed.to_string()
}

fn normalize_tool_call_arguments(value: Option<&Value>) -> Value {
    let Some(value) = value else {
        return json!({});
    };

    match value {
        Value::Null => json!({}),
        Value::String(raw) => serde_json::from_str::<Value>(raw).unwrap_or_else(|_| json!({})),
        Value::Object(_) | Value::Array(_) | Value::Bool(_) | Value::Number(_) => value.clone(),
    }
}

pub async fn generate_completion(
    client: &reqwest::Client,
    config: &OpenAiCompatibleConfig,
    request: ProviderCompletionRequest,
) -> Result<ProviderCompletionResponse, String> {
    match config.provider {
        OpenAiCompatibleProvider::Google => {
            generate_google_completion(client, config, request).await
        }
        OpenAiCompatibleProvider::OpenAi
        | OpenAiCompatibleProvider::OpenRouter
        | OpenAiCompatibleProvider::Custom => {
            generate_openai_compatible_completion(client, config, request).await
        }
    }
}

fn openai_text_from_message(message: &Value) -> String {
    let Some(content) = message.get("content") else {
        return String::new();
    };

    if let Some(text) = content.as_str() {
        return text.to_string();
    }

    content
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|part| {
            part.get("text").and_then(Value::as_str).or_else(|| {
                part.get("type")
                    .and_then(Value::as_str)
                    .filter(|kind| *kind == "text")
                    .and_then(|_| part.get("text").and_then(Value::as_str))
            })
        })
        .collect::<Vec<_>>()
        .join("")
}

fn parse_openai_tool_calls(message: &Value) -> Vec<ProviderFunctionCall> {
    message
        .get("tool_calls")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tool_call| {
            let function = tool_call.get("function")?;
            let name = normalize_tool_call_name(function.get("name")?.as_str()?);
            let arguments = normalize_tool_call_arguments(function.get("arguments"));

            Some(ProviderFunctionCall {
                id: tool_call
                    .get("id")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string()),
                name,
                arguments,
                thought_signature: tool_call
                    .get("extra_content")
                    .and_then(|value| value.get("google"))
                    .and_then(|value| value.get("thought_signature"))
                    .and_then(Value::as_str)
                    .map(|value| value.to_string()),
            })
        })
        .collect()
}

fn parse_openai_usage(value: &Value) -> Option<AgentUsage> {
    let usage = value.get("usage")?;
    Some(AgentUsage {
        prompt_tokens: usage
            .get("prompt_tokens")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32,
        completion_tokens: usage
            .get("completion_tokens")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32,
        total_tokens: usage
            .get("total_tokens")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32,
    })
}

async fn generate_openai_compatible_completion(
    client: &reqwest::Client,
    config: &OpenAiCompatibleConfig,
    request: ProviderCompletionRequest,
) -> Result<ProviderCompletionResponse, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if matches!(config.provider, OpenAiCompatibleProvider::OpenRouter) {
        headers.insert("X-Title", HeaderValue::from_static("Octomus"));
        if let Ok(referer) = std::env::var("OCTOMUS_AI_HTTP_REFERER") {
            if let Ok(value) = HeaderValue::from_str(&referer) {
                headers.insert("HTTP-Referer", value);
            }
        }
    }

    let endpoint = if config.base_url.ends_with("/chat/completions")
        || config.base_url.ends_with("/responses")
    {
        config.base_url.clone()
    } else {
        format!("{}/chat/completions", config.base_url.trim_end_matches('/'))
    };

    let mut body = json!({
        "model": request.model,
        "messages": request.messages,
    });

    if let Some(tools) = request.tools {
        body["tools"] = tools;
        body["tool_choice"] = json!("auto");
    }
    if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature);
    }
    if let Some(max_tokens) = request.max_tokens {
        body["max_tokens"] = json!(max_tokens);
    }

    let response = client
        .post(endpoint)
        .bearer_auth(&config.api_key)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("provider request failed: {error}"))?;

    let status = response.status();
    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("failed to parse provider response: {error}"))?;

    if !status.is_success() {
        return Err(format!(
            "provider returned HTTP {status}: {}",
            trim_error_value(&value)
        ));
    }

    let message = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .cloned()
        .unwrap_or_else(|| json!({}));

    Ok(ProviderCompletionResponse {
        text: openai_text_from_message(&message),
        function_calls: parse_openai_tool_calls(&message),
        usage: parse_openai_usage(&value),
    })
}

fn google_native_base_url(config: &OpenAiCompatibleConfig) -> String {
    config
        .base_url
        .trim_end_matches('/')
        .trim_end_matches("/openai")
        .to_string()
}

fn extract_google_usage(value: &Value) -> Option<AgentUsage> {
    let usage = value.get("usageMetadata")?;
    Some(AgentUsage {
        prompt_tokens: usage
            .get("promptTokenCount")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32,
        completion_tokens: usage
            .get("candidatesTokenCount")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32,
        total_tokens: usage
            .get("totalTokenCount")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32,
    })
}

fn extract_google_text_and_calls(value: &Value) -> (String, Vec<ProviderFunctionCall>) {
    let parts = value
        .get("candidates")
        .and_then(Value::as_array)
        .and_then(|candidates| candidates.first())
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut text = String::new();
    let mut function_calls = Vec::new();

    for part in parts {
        if let Some(value) = part.get("text").and_then(Value::as_str) {
            text.push_str(value);
        }

        if let Some(function_call) = part.get("functionCall") {
            let name = normalize_tool_call_name(
                function_call
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            );
            if !name.trim().is_empty() {
                function_calls.push(ProviderFunctionCall {
                    id: function_call
                        .get("id")
                        .and_then(Value::as_str)
                        .map(|value| value.to_string()),
                    name,
                    arguments: normalize_tool_call_arguments(function_call.get("args")),
                    thought_signature: part
                        .get("thoughtSignature")
                        .or_else(|| part.get("thought_signature"))
                        .and_then(Value::as_str)
                        .map(|value| value.to_string()),
                });
            }
        }
    }

    (text, function_calls)
}

fn convert_openai_messages_to_google(messages: &[Value]) -> (Option<Value>, Vec<Value>) {
    let mut system_chunks = Vec::new();
    let mut contents = Vec::new();
    let mut tool_name_by_id: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    for message in messages {
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or("user");

        if role == "system" {
            let content = openai_text_from_message(message);
            if !content.trim().is_empty() {
                system_chunks.push(content);
            }
            continue;
        }

        if role == "assistant" {
            let mut parts = Vec::new();
            let tool_calls = parse_openai_tool_calls(message);
            let text = if tool_calls.is_empty() {
                openai_text_from_message(message)
            } else {
                String::new()
            };
            if !text.trim().is_empty() {
                parts.push(json!({ "text": text }));
            }

            for function_call in tool_calls {
                if let Some(id) = &function_call.id {
                    tool_name_by_id.insert(id.clone(), function_call.name.clone());
                }
                let mut part = json!({
                    "functionCall": {
                        "id": function_call.id,
                        "name": function_call.name,
                        "args": function_call.arguments
                    }
                });
                if let Some(signature) = function_call.thought_signature {
                    if let Some(object) = part.as_object_mut() {
                        object.insert("thoughtSignature".to_string(), json!(signature));
                    }
                }
                parts.push(part);
            }

            if !parts.is_empty() {
                contents.push(json!({
                    "role": "model",
                    "parts": parts
                }));
            }
            continue;
        }

        if role == "tool" {
            let tool_call_id = message
                .get("tool_call_id")
                .and_then(Value::as_str)
                .map(|value| value.to_string());
            let tool_name = tool_call_id
                .as_ref()
                .and_then(|id| tool_name_by_id.get(id))
                .cloned()
                .or_else(|| tool_call_id.clone())
                .unwrap_or_else(|| "tool".to_string());
            let raw_text = openai_text_from_message(message);
            let response_payload = serde_json::from_str::<Value>(&raw_text)
                .unwrap_or_else(|_| json!({ "content": raw_text }));

            contents.push(json!({
                "role": "user",
                "parts": [{
                    "functionResponse": {
                        "id": tool_call_id,
                        "name": tool_name,
                        "response": response_payload
                    }
                }]
            }));
            continue;
        }

        let text = openai_text_from_message(message);
        if !text.trim().is_empty() {
            contents.push(json!({
                "role": "user",
                "parts": [{ "text": text }]
            }));
        }
    }

    let system_instruction = (!system_chunks.is_empty()).then(|| {
        json!({
            "parts": [{
                "text": system_chunks.join("\n\n")
            }]
        })
    });

    (system_instruction, contents)
}

fn convert_openai_tools_to_google(tools: &Value) -> Vec<Value> {
    let declarations = tools
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|tool| {
            let function = tool.get("function")?;
            Some(json!({
                "name": function.get("name").and_then(Value::as_str).unwrap_or_default(),
                "description": function.get("description").and_then(Value::as_str).unwrap_or_default(),
                "parameters": sanitize_google_schema(
                    &function
                        .get("parameters")
                        .cloned()
                        .unwrap_or_else(|| json!({ "type": "object", "properties": {} }))
                )
            }))
        })
        .collect::<Vec<_>>();

    if declarations.is_empty() {
        Vec::new()
    } else {
        vec![json!({ "functionDeclarations": declarations })]
    }
}

fn sanitize_google_schema(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut sanitized = Map::new();
            for (key, entry) in map {
                if key == "additionalProperties" {
                    continue;
                }
                sanitized.insert(key.clone(), sanitize_google_schema(entry));
            }
            Value::Object(sanitized)
        }
        Value::Array(items) => {
            Value::Array(items.iter().map(sanitize_google_schema).collect::<Vec<_>>())
        }
        _ => value.clone(),
    }
}

async fn generate_google_completion(
    _client: &reqwest::Client,
    config: &OpenAiCompatibleConfig,
    request: ProviderCompletionRequest,
) -> Result<ProviderCompletionResponse, String> {
    let endpoint = format!(
        "{}/models/{}:generateContent?key={}",
        google_native_base_url(config),
        request.model,
        config.api_key
    );

    let (system_instruction, contents) = convert_openai_messages_to_google(&request.messages);
    let mut body = Map::new();
    body.insert("contents".to_string(), Value::Array(contents));

    if let Some(system_instruction) = system_instruction {
        body.insert("system_instruction".to_string(), system_instruction);
    }

    if let Some(tools) = request.tools.as_ref() {
        let google_tools = convert_openai_tools_to_google(tools);
        if !google_tools.is_empty() {
            body.insert("tools".to_string(), Value::Array(google_tools));
            body.insert(
                "tool_config".to_string(),
                json!({
                    "function_calling_config": {
                        "mode": "AUTO"
                    }
                }),
            );
        }
    }

    let mut generation_config = Map::new();
    if let Some(temperature) = request.temperature {
        generation_config.insert("temperature".to_string(), json!(temperature));
    }
    if let Some(max_tokens) = request.max_tokens {
        generation_config.insert("maxOutputTokens".to_string(), json!(max_tokens));
    }
    if let Some(response_mime_type) = request.response_mime_type {
        generation_config.insert("responseMimeType".to_string(), json!(response_mime_type));
    }
    if !generation_config.is_empty() {
        body.insert(
            "generationConfig".to_string(),
            Value::Object(generation_config),
        );
    }

    let debug_google_request = std::env::var("OCTOMUS_DEBUG_GOOGLE_REQUEST")
        .ok()
        .as_deref()
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let mut last_error = None;
    let max_attempts = 5;
    for attempt in 0..max_attempts {
        if debug_google_request {
            eprintln!(
                "[Google] attempt {}/{} payload for model `{}`:\n{}",
                attempt + 1,
                max_attempts,
                request.model,
                serde_json::to_string_pretty(&Value::Object(body.clone()))
                    .unwrap_or_else(|_| Value::Object(body.clone()).to_string())
            );
        }

        let attempt_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()
            .map_err(|error| format!("failed to build Google request client: {error}"))?;

        let response = match attempt_client
            .post(&endpoint)
            .header(CONTENT_TYPE, "application/json")
            .json(&Value::Object(body.clone()))
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                let rendered = format!("provider request failed: {}", render_reqwest_error(&error));
                last_error = Some(rendered.clone());
                if attempt + 1 < max_attempts {
                    let backoff_ms = 500_u64.saturating_mul(1_u64 << attempt);
                    tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
                    continue;
                }
                return Err(rendered);
            }
        };

        let status = response.status();
        let value: Value = response
            .json()
            .await
            .map_err(|error| format!("failed to parse provider response: {error}"))?;

        if status.is_success() {
            let (text, function_calls) = extract_google_text_and_calls(&value);
            return Ok(ProviderCompletionResponse {
                text,
                function_calls,
                usage: extract_google_usage(&value),
            });
        }

        let rendered = format!(
            "provider returned HTTP {status}: {}",
            trim_error_value(&value)
        );
        last_error = Some(rendered.clone());
        if matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504) && attempt + 1 < max_attempts {
            let backoff_ms = 500_u64.saturating_mul(1_u64 << attempt);
            tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
            continue;
        }

        return Err(rendered);
    }

    return Err(last_error.unwrap_or_else(|| "provider request failed".to_string()));
}

fn render_reqwest_error(error: &reqwest::Error) -> String {
    let mut details = vec![error.to_string()];
    if error.is_timeout() {
        details.push("timeout=true".to_string());
    }
    if error.is_connect() {
        details.push("connect=true".to_string());
    }
    if error.is_body() {
        details.push("body=true".to_string());
    }
    if error.is_builder() {
        details.push("builder=true".to_string());
    }
    let mut source = error.source();
    let mut depth = 0;
    while let Some(current) = source {
        details.push(format!("source[{depth}]={current}"));
        source = current.source();
        depth += 1;
    }
    details.join(" | ")
}

fn trim_error_value(value: &Value) -> String {
    let rendered = value.to_string();
    const MAX_CHARS: usize = 600;
    let mut trimmed = rendered.chars().take(MAX_CHARS).collect::<String>();
    if rendered.chars().count() > MAX_CHARS {
        trimmed.push_str("...");
    }
    trimmed
}

#[cfg(test)]
mod tests {
    use super::{
        convert_openai_messages_to_google, convert_openai_tools_to_google,
        normalize_tool_call_name, parse_openai_tool_calls, sanitize_google_schema,
    };
    use serde_json::json;

    #[test]
    fn converts_openai_tool_history_to_google_contents() {
        let messages = vec![
            json!({"role":"system","content":"You are helpful."}),
            json!({"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function","extra_content":{"google":{"thought_signature":"sig-1"}},"function":{"name":"lookup_web","arguments":"{\"query\":\"news\"}"}}]}),
            json!({"role":"tool","tool_call_id":"call_1","content":"{\"results\":[]}"}),
            json!({"role":"user","content":"Continue."}),
        ];

        let (system_instruction, contents) = convert_openai_messages_to_google(&messages);
        assert!(system_instruction.is_some());
        assert_eq!(contents.len(), 3);
        assert_eq!(contents[0]["role"], "model");
        assert!(contents[0]["parts"][0]["functionCall"].is_object());
        assert_eq!(contents[0]["parts"][0]["thoughtSignature"], "sig-1");
        assert!(contents[1]["parts"][0]["functionResponse"].is_object());
    }

    #[test]
    fn converts_openai_tools_to_google_function_declarations() {
        let tools = json!([
            {
                "type": "function",
                "function": {
                    "name": "lookup_web",
                    "description": "Search the web",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": { "type": "string" }
                        }
                    }
                }
            }
        ]);

        let converted = convert_openai_tools_to_google(&tools);
        assert_eq!(converted.len(), 1);
        assert_eq!(
            converted[0]["functionDeclarations"][0]["name"],
            "lookup_web"
        );
    }

    #[test]
    fn strips_additional_properties_from_google_schema() {
        let schema = json!({
            "type": "object",
            "properties": {
                "env": {
                    "type": "object",
                    "additionalProperties": { "type": "string" }
                },
                "nested": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": { "type": "number" },
                        "properties": {
                            "name": { "type": "string" }
                        }
                    }
                }
            }
        });

        let sanitized = sanitize_google_schema(&schema);
        assert!(sanitized["properties"]["env"]
            .get("additionalProperties")
            .is_none());
        assert!(sanitized["properties"]["nested"]["items"]
            .get("additionalProperties")
            .is_none());
        assert_eq!(
            sanitized["properties"]["nested"]["items"]["properties"]["name"]["type"],
            "string"
        );
    }

    #[test]
    fn normalizes_namespaced_tool_names() {
        assert_eq!(
            normalize_tool_call_name("octomus:propose_terminal_command"),
            "propose_terminal_command"
        );
    }

    #[test]
    fn parses_namespaced_openai_tool_calls() {
        let message = json!({
            "tool_calls": [
                {
                    "id": "call-1",
                    "type": "function",
                    "function": {
                        "name": "octomus:propose_terminal_command",
                        "arguments": "{\"command\":\"docker ps\"}"
                    }
                }
            ]
        });

        let calls = parse_openai_tool_calls(&message);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "propose_terminal_command");
        assert_eq!(calls[0].arguments["command"], "docker ps");
    }

    #[test]
    fn parses_object_openai_tool_calls() {
        let message = json!({
            "tool_calls": [
                {
                    "id": "call-1",
                    "type": "function",
                    "function": {
                        "name": "propose_terminal_command",
                        "arguments": {
                            "command": "docker ps",
                            "requiresApproval": true
                        }
                    }
                }
            ]
        });

        let calls = parse_openai_tool_calls(&message);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "propose_terminal_command");
        assert_eq!(calls[0].arguments["command"], "docker ps");
        assert_eq!(calls[0].arguments["requiresApproval"], true);
    }
}
