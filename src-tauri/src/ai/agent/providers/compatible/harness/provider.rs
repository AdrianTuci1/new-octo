use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde_json::{json, Value};
use std::time::Duration;
use uuid::Uuid;

use crate::ai::agent::harness::{
    AgentCancellation, AgentEventSink, AgentHarnessContext, AgentHarnessError,
};
use crate::{
    ai::mcp,
    ai::provider_adapter::{generate_completion, ProviderCompletionRequest},
};

use super::super::config::{OpenAiCompatibleConfig, OpenAiCompatibleProvider, OPENROUTER_URL};
use super::super::{tools, utils};
use super::context::build_chat_messages;
use super::parser::handle_stream_payload;
use super::resume::apply_low_reasoning_effort;
use super::thinking::ThinkingStreamState;
use super::types::{CollectedToolCall, StageModelResponse, StagePassOptions};

fn generate_tool_call_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn run_stage_model_pass(
    config: &OpenAiCompatibleConfig,
    context: &AgentHarnessContext,
    sink: &AgentEventSink,
    cancellation: &AgentCancellation,
    negotiation_messages: &[crate::ai::agent::types::AgentInputMessage],
    options: StagePassOptions,
    extra_system_messages: Vec<String>,
) -> Result<StageModelResponse, AgentHarnessError> {
    let use_synthetic_thinking = super::resume::should_use_synthetic_thinking(&context.model_id);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| {
            AgentHarnessError::new(format!("Failed to create HTTP client: {error}"))
        })?;

    let endpoint = utils::resolve_chat_endpoint(&config.base_url);
    let headers = build_headers(config)?;
    let filtered_tools = build_filtered_tools().await;

    let mut stage_messages = context.messages.clone();
    stage_messages.extend_from_slice(negotiation_messages);
    for instruction in extra_system_messages {
        stage_messages.push(crate::ai::agent::types::AgentInputMessage {
            role: "system".to_string(),
            content: instruction,
            tool_call_id: None,
            tool_calls: None,
        });
    }

    let mut updated_context = context.clone();
    updated_context.messages = stage_messages;
    if updated_context
        .messages
        .last()
        .map(|message| message.role == "user" && message.content == context.prompt)
        .unwrap_or(false)
    {
        updated_context.prompt.clear();
    }
    let request_messages = build_chat_messages(&updated_context);
    let tools_for_provider_request = filtered_tools
        .as_array()
        .filter(|items| !items.is_empty())
        .map(|_| filtered_tools.clone());

    if matches!(config.provider, OpenAiCompatibleProvider::Google) {
        return run_google_pass(
            &client,
            config,
            context,
            sink,
            options,
            use_synthetic_thinking,
            request_messages,
            tools_for_provider_request,
        )
        .await;
    }

    run_streaming_pass(
        &client,
        config,
        context,
        sink,
        cancellation,
        options,
        use_synthetic_thinking,
        endpoint,
        headers,
        request_messages,
        tools_for_provider_request,
    )
    .await
}

fn build_headers(config: &OpenAiCompatibleConfig) -> Result<HeaderMap, AgentHarnessError> {
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

    Ok(headers)
}

async fn build_filtered_tools() -> Value {
    // All tools are always allowed. No stage-based filtering.
    let mut all_tools = tools::build_tool_definitions();

    match mcp::mcp_build_openai_tool_definitions().await {
        Ok(mcp_tools) => {
            if let Some(tool_array) = all_tools.as_array_mut() {
                tool_array.extend(mcp_tools);
            }
        }
        Err(error) => {
            eprintln!("[MCP] Failed to build MCP tool definitions: {error}");
        }
    }

    all_tools
}

#[allow(clippy::too_many_arguments)]
async fn run_google_pass(
    client: &reqwest::Client,
    config: &OpenAiCompatibleConfig,
    context: &AgentHarnessContext,
    sink: &AgentEventSink,
    options: StagePassOptions,
    _use_synthetic_thinking: bool,
    request_messages: Vec<Value>,
    tools_for_provider_request: Option<Value>,
) -> Result<StageModelResponse, AgentHarnessError> {
    let mut visible_text = String::new();
    let mut reasoning_text = String::new();
    let mut thinking_state = ThinkingStreamState::default();

    let response = generate_completion(
        client,
        config,
        ProviderCompletionRequest {
            model: context.model_id.clone(),
            messages: request_messages,
            tools: tools_for_provider_request,
            temperature: None,
            max_tokens: None,
            response_mime_type: None,
        },
    )
    .await
    .map_err(AgentHarnessError::new)?;

    if !response.text.is_empty() {
        thinking_state.push_content(
            &response.text,
            sink,
            &mut visible_text,
            &mut reasoning_text,
            options.emit_visible_tokens,
            options.emit_reasoning_tokens,
        );
    }

    thinking_state.finish(
        sink,
        &mut visible_text,
        &mut reasoning_text,
        options.emit_visible_tokens,
        options.emit_reasoning_tokens,
    );

    let tool_call = response
        .function_calls
        .first()
        .map(|function_call| CollectedToolCall {
            id: function_call
                .id
                .clone()
                .unwrap_or_else(|| generate_tool_call_id("google-tool-call")),
            name: function_call.name.clone(),
            args: function_call.arguments.clone(),
            raw_args: serde_json::to_string(&function_call.arguments)
                .unwrap_or_else(|_| "{}".to_string()),
            google_thought_signature: function_call.thought_signature.clone(),
        });

    Ok(StageModelResponse {
        visible_text,
        tool_call,
        usage: response.usage,
    })
}

#[allow(clippy::too_many_arguments)]
async fn run_streaming_pass(
    client: &reqwest::Client,
    config: &OpenAiCompatibleConfig,
    context: &AgentHarnessContext,
    sink: &AgentEventSink,
    cancellation: &AgentCancellation,
    options: StagePassOptions,
    use_synthetic_thinking: bool,
    endpoint: String,
    headers: HeaderMap,
    request_messages: Vec<Value>,
    tools_for_provider_request: Option<Value>,
) -> Result<StageModelResponse, AgentHarnessError> {
    let request_messages_for_retry = request_messages.clone();
    let mut request = json!({
        "model": context.model_id,
        "messages": request_messages,
        "stream": true
    });
    if let Some(request_object) = request.as_object_mut() {
        if let Some(tool_payload) = tools_for_provider_request.as_ref() {
            request_object.insert("tools".to_string(), tool_payload.clone());
            request_object.insert("tool_choice".to_string(), json!("auto"));
        }
    }
    apply_low_reasoning_effort(&mut request, config, &context.model_id);

    let response = client
        .post(&endpoint)
        .bearer_auth(config.api_key.clone())
        .headers(headers.clone())
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
            utils::trim_error_body(&body)
        )));
    }

    let mut pass = StreamingPassState::default();
    let mut sse_buffer = String::new();
    let mut byte_stream = response.bytes_stream();
    let mut saw_done = false;

    while let Some(next_chunk) = byte_stream.next().await {
        if cancellation.is_cancelled() {
            return Err(AgentHarnessError::new(
                "Agent run cancelled during provider stream.",
            ));
        }

        let bytes = next_chunk
            .map_err(|error| AgentHarnessError::new(format!("Stream interrupted: {error}")))?;
        let text = String::from_utf8_lossy(&bytes);
        sse_buffer.push_str(&text);

        if drain_sse_buffer(
            &mut sse_buffer,
            sink,
            &mut pass,
            options,
            use_synthetic_thinking,
        )? {
            saw_done = true;
            break;
        }
    }

    if !saw_done {
        let remaining = sse_buffer.trim();
        if !remaining.is_empty() {
            let data = remaining.strip_prefix("data:").unwrap_or(remaining).trim();
            if data != "[DONE]" {
                let _ = process_payload(data, sink, &mut pass, options, use_synthetic_thinking);
            }
        }
    }

    if pass.visible_text.trim().is_empty()
        && pass.current_tool_call_id.is_none()
        && pass.current_tool_name.trim().is_empty()
        && pass.current_tool_args.trim().is_empty()
    {
        let response = generate_completion(
            client,
            config,
            ProviderCompletionRequest {
                model: context.model_id.clone(),
                messages: request_messages_for_retry,
                tools: tools_for_provider_request,
                temperature: None,
                max_tokens: None,
                response_mime_type: None,
            },
        )
        .await
        .map_err(AgentHarnessError::new)?;

        if let Some(parsed_usage) = response.usage {
            pass.usage = Some(parsed_usage);
        }

        if !response.text.is_empty() {
            pass.thinking_state.push_content(
                &response.text,
                sink,
                &mut pass.visible_text,
                &mut pass.reasoning_text,
                options.emit_visible_tokens,
                options.emit_reasoning_tokens,
            );
        }

        if let Some(function_call) = response.function_calls.first() {
            pass.current_tool_call_id = Some(
                function_call
                    .id
                    .clone()
                    .unwrap_or_else(|| generate_tool_call_id("fallback-tool-call")),
            );
            pass.current_tool_name = function_call.name.clone();
            pass.current_tool_args = serde_json::to_string(&function_call.arguments)
                .unwrap_or_else(|_| "{}".to_string());
        }
    }

    pass.thinking_state.finish(
        sink,
        &mut pass.visible_text,
        &mut pass.reasoning_text,
        options.emit_visible_tokens,
        options.emit_reasoning_tokens,
    );

    Ok(StageModelResponse {
        visible_text: pass.visible_text,
        tool_call: collect_tool_call(
            pass.current_tool_call_id,
            pass.current_tool_name,
            pass.current_tool_args,
        ),
        usage: pass.usage,
    })
}

#[derive(Default)]
struct StreamingPassState {
    visible_text: String,
    reasoning_text: String,
    thinking_state: ThinkingStreamState,
    current_tool_call_id: Option<String>,
    current_tool_name: String,
    current_tool_args: String,
    usage: Option<crate::ai::agent::types::AgentUsage>,
}

fn drain_sse_buffer(
    sse_buffer: &mut String,
    sink: &AgentEventSink,
    pass: &mut StreamingPassState,
    options: StagePassOptions,
    use_synthetic_thinking: bool,
) -> Result<bool, AgentHarnessError> {
    let mut saw_done = false;

    while let Some(newline_index) = sse_buffer.find('\n') {
        let line = sse_buffer[..newline_index].trim().to_string();
        sse_buffer.drain(..=newline_index);

        if line.is_empty() {
            continue;
        }

        if let Some(data) = line.strip_prefix("data:") {
            let data = data.trim();
            if data == "[DONE]" {
                saw_done = true;
                continue;
            }

            let _ = process_payload(data, sink, pass, options, use_synthetic_thinking);
        } else if line.starts_with('{') && line.ends_with('}') {
            let _ = process_payload(&line, sink, pass, options, use_synthetic_thinking);
        }
    }

    Ok(saw_done)
}

fn process_payload(
    data: &str,
    sink: &AgentEventSink,
    pass: &mut StreamingPassState,
    options: StagePassOptions,
    use_synthetic_thinking: bool,
) -> Result<(), AgentHarnessError> {
    if let Some(delta_payload) = handle_stream_payload(
        data,
        sink,
        &mut pass.visible_text,
        &mut pass.reasoning_text,
        &mut pass.thinking_state,
        use_synthetic_thinking,
        options.emit_visible_tokens,
        options.emit_reasoning_tokens,
        &mut pass.usage,
    )? {
        if let Some(reasoning_delta) = delta_payload.reasoning {
            pass.reasoning_text.push_str(&reasoning_delta);
            if options.emit_reasoning_tokens && !use_synthetic_thinking {
                sink.reasoning(pass.reasoning_text.clone(), false);
            }
        }
        if let Some(id) = delta_payload.id {
            pass.current_tool_call_id = Some(id);
        }
        if let Some(name) = delta_payload.name {
            pass.current_tool_name.push_str(&name);
        }
        if let Some(args) = delta_payload.arguments {
            pass.current_tool_args.push_str(&args);
        }
    }

    Ok(())
}

fn collect_tool_call(
    current_tool_call_id: Option<String>,
    current_tool_name: String,
    current_tool_args: String,
) -> Option<CollectedToolCall> {
    if current_tool_name.trim().is_empty() || current_tool_args.trim().is_empty() {
        return None;
    }
    let id = current_tool_call_id.unwrap_or_else(|| generate_tool_call_id("stream-tool-call"));

    serde_json::from_str::<Value>(&current_tool_args)
        .ok()
        .map(|args| CollectedToolCall {
            id,
            name: current_tool_name,
            args,
            raw_args: current_tool_args,
            google_thought_signature: None,
        })
}

#[cfg(test)]
mod tests {
    use super::{collect_tool_call, drain_sse_buffer, StagePassOptions, StreamingPassState};
    use crate::ai::agent::harness::{AgentEventSink, AgentHarnessContext};
    use crate::ai::agent::types::{AgentExecutionState, AgentRunSnapshot, AgentRunStatus};
    use crate::ai::agent_management::AgentHarnessManager;
    use chrono::Utc;
    use serde_json::json;
    use std::sync::{atomic::AtomicBool, Arc};

    #[test]
    fn sse_drain_collects_fragmented_terminal_tool_name_and_args() {
        let (sink, _events) = test_sink("terminal-stream");
        let mut pass = StreamingPassState::default();
        let mut buffer = concat!(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"id\":\"call_docker\",\"function\":{\"name\":\"propose_\",\"arguments\":\"{\\\"command\\\":\\\"docker ps\\\"}\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"function\":{\"name\":\"terminal_command\"}}]}}]}\n\n",
            "data: [DONE]\n\n"
        )
        .to_string();

        let saw_done = drain_sse_buffer(
            &mut buffer,
            &sink,
            &mut pass,
            StagePassOptions {
                emit_visible_tokens: false,
                emit_reasoning_tokens: false,
            },
            false,
        )
        .expect("SSE drain should succeed");

        assert!(saw_done);
        let tool_call = collect_tool_call(
            pass.current_tool_call_id,
            pass.current_tool_name,
            pass.current_tool_args,
        )
        .expect("fragmented terminal tool call should be reconstructed");
        assert_eq!(tool_call.name, "propose_terminal_command");
        assert_eq!(tool_call.args, json!({ "command": "docker ps" }));
    }

    #[test]
    fn sse_drain_collects_fragmented_planning_tool_name() {
        let (sink, _events) = test_sink("planning-stream");
        let mut pass = StreamingPassState::default();
        let mut buffer = concat!(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"id\":\"call_plan\",\"function\":{\"name\":\"propose_\",\"arguments\":\"{\\\"title\\\":\\\"Plan investigatie\\\",\\\"steps\\\":[{\\\"label\\\":\\\"Inspecteaza harness-ul\\\"}]}\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"function\":{\"name\":\"plan\"}}]}}]}\n\n",
            "data: [DONE]\n\n"
        )
        .to_string();

        let saw_done = drain_sse_buffer(
            &mut buffer,
            &sink,
            &mut pass,
            StagePassOptions {
                emit_visible_tokens: false,
                emit_reasoning_tokens: false,
            },
            false,
        )
        .expect("SSE drain should succeed");

        assert!(saw_done);
        let tool_call = collect_tool_call(
            pass.current_tool_call_id,
            pass.current_tool_name,
            pass.current_tool_args,
        )
        .expect("fragmented planning tool call should be reconstructed");
        assert_eq!(tool_call.name, "propose_plan");
        assert_eq!(
            tool_call.args,
            json!({
                "title": "Plan investigatie",
                "steps": [{ "label": "Inspecteaza harness-ul" }]
            })
        );
    }

    #[test]
    fn streaming_tool_call_without_id_gets_unique_fallback_id() {
        let (sink, _events) = test_sink("streaming-tool-without-id");
        let mut pass = StreamingPassState::default();
        let mut buffer = concat!(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"function\":{\"name\":\"propose_terminal_command\",\"arguments\":\"{\\\"command\\\":\\\"docker ps\\\"}\"}}]}}]}\n\n",
            "data: [DONE]\n\n"
        )
        .to_string();

        let saw_done = drain_sse_buffer(
            &mut buffer,
            &sink,
            &mut pass,
            StagePassOptions {
                emit_visible_tokens: false,
                emit_reasoning_tokens: false,
            },
            false,
        )
        .expect("SSE drain should succeed");

        assert!(saw_done);
        let first_tool_call = collect_tool_call(
            pass.current_tool_call_id.clone(),
            pass.current_tool_name.clone(),
            pass.current_tool_args.clone(),
        )
        .expect("streaming tool call without id should be reconstructed");
        let second_tool_call = collect_tool_call(
            None,
            pass.current_tool_name,
            pass.current_tool_args,
        )
        .expect("fallback ids should remain available for later tool calls");

        assert!(first_tool_call.id.starts_with("stream-tool-call-"));
        assert!(second_tool_call.id.starts_with("stream-tool-call-"));
        assert_ne!(first_tool_call.id, second_tool_call.id);
        assert_eq!(first_tool_call.name, "propose_terminal_command");
        assert_eq!(first_tool_call.args, json!({ "command": "docker ps" }));
    }

    #[test]
    fn synthetic_thinking_stream_is_emitted_as_reasoning_preview() {
        let (sink, events) = test_sink("synthetic-thinking-stream");
        let mut pass = StreamingPassState::default();
        let mut buffer = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"<thinking>Verific daca Docker raspunde local. Daca daemon-ul nu este pornit, voi spune asta clar.</thinking>Docker nu pare pornit acum.\"}}]}\n\n",
            "data: [DONE]\n\n"
        )
        .to_string();

        let saw_done = drain_sse_buffer(
            &mut buffer,
            &sink,
            &mut pass,
            StagePassOptions {
                emit_visible_tokens: true,
                emit_reasoning_tokens: true,
            },
            true,
        )
        .expect("SSE drain should succeed");

        assert!(saw_done);
        pass.thinking_state.finish(
            &sink,
            &mut pass.visible_text,
            &mut pass.reasoning_text,
            true,
            true,
        );

        assert_eq!(pass.visible_text, "Docker nu pare pornit acum.");
        assert!(pass.reasoning_text.contains("Verific daca Docker raspunde local."));

        let recorded_events = events.lock().expect("events should lock");
        let reasoning_events = recorded_events
            .iter()
            .filter_map(|event| match event {
                crate::ai::agent::harness::TestAgentEvent::Reasoning(text, is_complete) => {
                    Some((text.clone(), *is_complete))
                }
                _ => None,
            })
            .collect::<Vec<_>>();
        let token_text = recorded_events
            .iter()
            .filter_map(|event| match event {
                crate::ai::agent::harness::TestAgentEvent::Token(text) => Some(text.clone()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("");

        assert!(
            reasoning_events
                .iter()
                .any(|(text, is_complete)| *is_complete
                    && text.contains("Daca daemon-ul nu este pornit"))
        );
        assert_eq!(token_text, "Docker nu pare pornit acum.");
    }

    fn test_sink(
        run_id: &str,
    ) -> (
        AgentEventSink,
        Arc<std::sync::Mutex<Vec<crate::ai::agent::harness::TestAgentEvent>>>,
    ) {
        let manager = AgentHarnessManager::default();
        let context = AgentHarnessContext {
            run_id: run_id.to_string(),
            conversation_id: "conv-test".to_string(),
            assistant_message_id: "assistant-test".to_string(),
            prompt: "test".to_string(),
            surface: Some("agent".to_string()),
            messages: vec![],
            terminal_blocks: vec![],
            cwd: Some("/tmp".to_string()),
            target_os: "macos".to_string(),
            target_arch: "arm64".to_string(),
            model_id: "test-model".to_string(),
            terminal_model_id: None,
            resume_execution_state: None,
        };

        manager
            .insert(
                AgentRunSnapshot {
                    run_id: run_id.to_string(),
                    conversation_id: "conv-test".to_string(),
                    assistant_message_id: "assistant-test".to_string(),
                    prompt: "test".to_string(),
                    status: AgentRunStatus::Queued,
                    status_message: Some("Queued".to_string()),
                    model_id: "test-model".to_string(),
                    cwd: Some("/tmp".to_string()),
                    error: None,
                    execution_state: AgentExecutionState::new("tool-selection"),
                    started_at: Utc::now(),
                    finished_at: None,
                },
                Arc::new(AtomicBool::new(false)),
            )
            .expect("snapshot should insert");

        AgentEventSink::for_tests(manager, &context)
    }
}
