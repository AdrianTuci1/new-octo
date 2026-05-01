use std::time::Duration;

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde_json::{json, Value};

use super::{
    harness::{
        AgentCancellation, AgentEventSink, AgentHarness, AgentHarnessContext, AgentHarnessError,
        AgentHarnessOutcome,
    },
    types::{AgentInputMessage, AgentRunStatus, AgentUsage, AgentToolCall},
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
        }
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
            "api_key": self.api_key,
            "base_url": self.base_url,
            "model_id": self.model_id,
            "source": self.source,
        })
    }

    pub fn from_persisted_value(value: &Value) -> Option<Self> {
        let api_key = value.get("api_key")?.as_str()?.to_string();
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

        Some(Self::new(api_key, base_url, model_id, source))
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
    ) -> impl std::future::Future<Output = Result<AgentHarnessOutcome, AgentHarnessError>> + Send {
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

    let endpoint = format!("{}", config.base_url);
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


    let tools = json!([
        {
            "type": "function",
            "function": {
                "name": "propose_terminal_command",
                "description": "Propose a terminal command to the user for approval and execution.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The shell command to propose (e.g. 'ls -la', 'git status')."
                        },
                        "requiresApproval": {
                            "type": "boolean",
                            "description": "Whether the user must approve the command before running (always true for safety)."
                        },
                        "reason": {
                            "type": "string",
                            "description": "A short Romanian sentence that explains why access is being requested, for example: 'Am cerut accesul pentru verificarea statusului repository-ului.'"
                        }
                    },
                    "required": ["command"]
                }
            }
        }
    ]);

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
                    return Ok(done_outcome(&context.prompt, &streamed, usage));
                }

                match handle_stream_payload(data, &sink, &mut streamed, &mut usage) {
                    Ok(Some(delta_tool_call)) => {
                        // Handle tool call delta
                        if let Some(id) = delta_tool_call.id {
                            current_tool_call_id = Some(id);
                        }
                        if let Some(name) = delta_tool_call.name {
                            current_tool_name.push_str(&name);
                        }
                        if let Some(args) = delta_tool_call.arguments {
                            current_tool_args.push_str(&args);
                        }
                    }
                    Ok(None) => {}
                    Err(e) => {
                        println!("[AI] Failed to handle payload: {}. Data: {}", e.message, data);
                    }
                }
            } else if line.starts_with('{') && line.ends_with('}') {
                // Try parsing it as raw JSON if it doesn't have the data: prefix
                let _ = handle_stream_payload(&line, &sink, &mut streamed, &mut usage);
            }
        }

        // Check if a tool call just finished (OpenAI usually sends an empty delta or finish_reason)
        if current_tool_call_id.is_some() && !current_tool_args.is_empty() {
            if let Ok(args_value) = serde_json::from_str::<Value>(&current_tool_args) {
                println!("[AI] Emitting tool call: {} with args: {}", current_tool_name, args_value);
                sink.tool_call(AgentToolCall {
                    id: current_tool_call_id.take().unwrap(),
                    name: current_tool_name.clone(),
                    args: args_value,
                });
                current_tool_name.clear();
                current_tool_args.clear();
            }
        }
    }

    // Process any remaining content in the buffer
    let remaining = sse_buffer.trim();
    if !remaining.is_empty() {
        let data = remaining.strip_prefix("data:").unwrap_or(remaining).trim();
        if data != "[DONE]" {
            let _ = handle_stream_payload(data, &sink, &mut streamed, &mut usage);
        }
    }

    Ok(done_outcome(&context.prompt, &streamed, usage))
}

struct DeltaToolCall {
    id: Option<String>,
    name: Option<String>,
    arguments: Option<String>,
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
    
    // Handle content
    if let Some(content) = delta.and_then(|d| d.get("content")).and_then(Value::as_str) {
        if !content.is_empty() {
            streamed.push_str(content);
            sink.token(content);
        }
    }

    // Handle tool calls
    if let Some(tool_calls) = delta.and_then(|d| d.get("tool_calls")).and_then(Value::as_array) {
        if let Some(tool_call) = tool_calls.first() {
            let id = tool_call.get("id").and_then(Value::as_str).map(|s| s.to_string());
            let function = tool_call.get("function");
            let name = function.and_then(|f| f.get("name")).and_then(Value::as_str).map(|s| s.to_string());
            let arguments = function.and_then(|f| f.get("arguments")).and_then(Value::as_str).map(|s| s.to_string());

            return Ok(Some(DeltaToolCall { id, name, arguments }));
        }
    }

    Ok(None)
}

fn build_chat_messages(context: &AgentHarnessContext) -> Vec<Value> {
    let mut messages = Vec::new();

    let cwd = context.cwd.as_deref().unwrap_or("unknown");

    messages.push(json!({
        "role": "system",
        "content": format!(
            "Ești Octomus, un inginer software de elită integrat într-un launcher inteligent. \
            Misiunea ta este să ajuți utilizatorul să navigheze, să înțeleagă și să automatizeze sarcini complexe în terminal. \
            CWD curent: {}. \
            \
            FILOZOFIA TA DE OPERARE: \
            - Nu ești doar un executant, ci un partener. Analizează rezultatele și caută anomalii, oportunități sau soluții mai bune. \
            - IMPORTANT: Utilizatorul vede deja output-ul brut al comenzii într-un bloc de terminal separat. NU repeta niciodată datele brute în răspunsul tău text sub formă de liste lungi sau blocuri de cod. \
            - Oferă direct INTROSPECȚIE: 'Văd că ai 5 erori în fișierul X, vrei să le reparăm?' în loc de 'Iată erorile: ...'. \
            \
            REGULI CRITICE: \
            1. Nu cere permisiune verbal ('Vrei să...?'). Când ai nevoie de o comandă, formulează scurt motivul la persoana I ('Am cerut accesul pentru...') și transmite-l în câmpul `reason` al uneltei `propose_terminal_command`. \
            2. Folosește un ton modern, minimalist și extrem de util. \
            3. După ce utilizatorul rulează o comandă de citire/verificare, confirmă că ai verificat rezultatul și oferă ajutor suplimentar doar dacă utilizatorul vrea să continue, fără să presupui automat modificări precum stage sau commit. \
            4. Analizează contextul și fii cu un pas înaintea utilizatorului.",
            cwd
        )
    }));

    for message in &context.messages {
        let mut msg = json!({
            "role": message.role,
            "content": message.content
        });

        if let Some(ref tool_call_id) = message.tool_call_id {
            if let Some(obj) = msg.as_object_mut() {
                obj.insert("tool_call_id".to_string(), json!(tool_call_id));
            }
        }

        if let Some(ref tool_calls) = message.tool_calls {
            if let Some(obj) = msg.as_object_mut() {
                obj.insert("tool_calls".to_string(), tool_calls.clone());
            }
        }

        messages.push(msg);
    }

    messages.push(json!({
        "role": "user",
        "content": context.prompt
    }));

    messages
}

fn sanitize_message(message: &AgentInputMessage) -> Option<AgentInputMessage> {
    let role = match message.role.as_str() {
        "system" | "user" | "assistant" | "tool" => message.role.clone(),
        _ => return None,
    };
    
    // Assistant messages can have empty content if they have tool_calls
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
    fn parses_usage_chunk() {
        let value = json!({
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15
        });

        let usage = parse_usage(Some(&value)).expect("usage");
        assert_eq!(usage.total_tokens, 15);
    }

    #[test]
    fn builds_messages_with_history_and_current_prompt() {
        let context = AgentHarnessContext {
            run_id: "run_test".to_string(),
            conversation_id: "conv_test".to_string(),
            assistant_message_id: "assistant_test".to_string(),
            prompt: "current".to_string(),
            messages: vec![AgentInputMessage {
                role: "user".to_string(),
                content: "previous".to_string(),
            }],
            cwd: None,
            model_id: "model".to_string(),
        };

        let messages = build_chat_messages(&context);
        assert_eq!(messages.len(), 4);
        assert_eq!(messages[0]["role"], "system");
        assert_eq!(messages[1]["role"], "system");
        assert_eq!(messages[2]["content"], "previous");
        assert_eq!(messages[3]["content"], "current");
    }
}
