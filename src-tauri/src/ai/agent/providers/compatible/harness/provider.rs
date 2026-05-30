use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde_json::{json, Value};
use std::time::Duration;

use crate::ai::agent::harness::{
    AgentCancellation, AgentEventSink, AgentHarnessContext, AgentHarnessError,
};
use crate::ai::agent::runtime::AgentLoopRuntime;
use crate::{
    ai::mcp,
    ai::provider_adapter::{generate_completion, ProviderCompletionRequest},
};

use super::super::config::{
    OpenAiCompatibleConfig, OpenAiCompatibleProvider, OPENROUTER_URL,
};
use super::context::build_chat_messages;
use super::parser::handle_stream_payload;
use super::resume::apply_low_reasoning_effort;
use super::thinking::ThinkingStreamState;
use super::types::{CollectedToolCall, StageModelResponse, StagePassOptions};
use super::super::{tools, utils};

#[allow(clippy::too_many_arguments)]
pub(super) async fn run_stage_model_pass(
    config: &OpenAiCompatibleConfig,
    context: &AgentHarnessContext,
    sink: &AgentEventSink,
    cancellation: &AgentCancellation,
    runtime: &AgentLoopRuntime,
    negotiation_messages: &[crate::ai::agent::types::AgentInputMessage],
    options: StagePassOptions,
    extra_system_messages: Vec<String>,
) -> Result<StageModelResponse, AgentHarnessError> {
    let use_synthetic_thinking = super::resume::should_use_synthetic_thinking(&context.model_id);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| AgentHarnessError::new(format!("Failed to create HTTP client: {error}")))?;

    let endpoint = utils::resolve_chat_endpoint(&config.base_url);
    let headers = build_headers(config)?;
    let filtered_tools = build_filtered_tools(runtime).await;

    let mut stage_messages = negotiation_messages.to_vec();
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
    let request_messages = build_chat_messages(&updated_context, runtime);
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

async fn build_filtered_tools(runtime: &AgentLoopRuntime) -> Value {
    let builtin_tools = tools::build_tool_definitions();
    let allowed_tool_names = builtin_tools
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|tool| {
            tool.get("function")
                .and_then(|value| value.get("name"))
                .and_then(Value::as_str)
        })
        .filter(|name| runtime.allows_tool(name))
        .collect::<Vec<_>>();
    let mut filtered_tools =
        tools::filter_tool_definitions(builtin_tools.clone(), &allowed_tool_names);

    if runtime.allows_mcp_tools() {
        match mcp::mcp_build_openai_tool_definitions().await {
            Ok(mcp_tools) => {
                if let Some(tool_array) = filtered_tools.as_array_mut() {
                    tool_array.extend(mcp_tools);
                }
            }
            Err(error) => {
                eprintln!("[MCP] Failed to build MCP tool definitions: {error}");
            }
        }
    }

    filtered_tools
}

#[allow(clippy::too_many_arguments)]
async fn run_google_pass(
    client: &reqwest::Client,
    config: &OpenAiCompatibleConfig,
    context: &AgentHarnessContext,
    sink: &AgentEventSink,
    options: StagePassOptions,
    use_synthetic_thinking: bool,
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
        if use_synthetic_thinking {
            visible_text.push_str(&response.text);
            if options.emit_visible_tokens {
                sink.token(&response.text);
            }
        } else {
            thinking_state.push_content(
                &response.text,
                sink,
                &mut visible_text,
                &mut reasoning_text,
                options.emit_visible_tokens,
                options.emit_reasoning_tokens,
            );
        }
    }

    if !use_synthetic_thinking {
        thinking_state.finish(
            sink,
            &mut visible_text,
            &mut reasoning_text,
            options.emit_visible_tokens,
            options.emit_reasoning_tokens,
        );
    }

    let tool_call = response.function_calls.first().map(|function_call| CollectedToolCall {
        id: function_call
            .id
            .clone()
            .unwrap_or_else(|| "google-tool-call".to_string()),
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

    while let Some(next_chunk) = byte_stream.next().await {
        if cancellation.is_cancelled() {
            return Err(AgentHarnessError::new("Agent run cancelled during provider stream."));
        }

        let bytes =
            next_chunk.map_err(|error| AgentHarnessError::new(format!("Stream interrupted: {error}")))?;
        let text = String::from_utf8_lossy(&bytes);
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
                    break;
                }

                let _ = process_payload(
                    data,
                    sink,
                    &mut pass,
                    options,
                    use_synthetic_thinking,
                );
            } else if line.starts_with('{') && line.ends_with('}') {
                let _ = process_payload(
                    &line,
                    sink,
                    &mut pass,
                    options,
                    use_synthetic_thinking,
                );
            }
        }

        if pass.current_tool_call_id.is_some() && !pass.current_tool_args.is_empty() {
            break;
        }
    }

    let remaining = sse_buffer.trim();
    if !remaining.is_empty() {
        let data = remaining.strip_prefix("data:").unwrap_or(remaining).trim();
        if data != "[DONE]" {
            let _ = process_payload(data, sink, &mut pass, options, use_synthetic_thinking);
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
            if use_synthetic_thinking {
                pass.visible_text.push_str(&response.text);
                if options.emit_visible_tokens {
                    sink.token(&response.text);
                }
            } else {
                pass.thinking_state.push_content(
                    &response.text,
                    sink,
                    &mut pass.visible_text,
                    &mut pass.reasoning_text,
                    options.emit_visible_tokens,
                    options.emit_reasoning_tokens,
                );
            }
        }

        if let Some(function_call) = response.function_calls.first() {
            pass.current_tool_call_id = Some(
                function_call
                    .id
                    .clone()
                    .unwrap_or_else(|| "fallback-tool-call".to_string()),
            );
            pass.current_tool_name = function_call.name.clone();
            pass.current_tool_args = serde_json::to_string(&function_call.arguments)
                .unwrap_or_else(|_| "{}".to_string());
        }
    }

    if !use_synthetic_thinking {
        pass.thinking_state.finish(
            sink,
            &mut pass.visible_text,
            &mut pass.reasoning_text,
            options.emit_visible_tokens,
            options.emit_reasoning_tokens,
        );
    }

    Ok(StageModelResponse {
        visible_text: pass.visible_text,
        tool_call: collect_tool_call(pass.current_tool_call_id, pass.current_tool_name, pass.current_tool_args),
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
    let id = current_tool_call_id?;
    if current_tool_name.trim().is_empty() || current_tool_args.trim().is_empty() {
        return None;
    }

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
