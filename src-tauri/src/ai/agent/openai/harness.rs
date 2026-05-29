use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde_json::{json, Value};
use std::{fs, path::Path, time::Duration};

use crate::ai::agent::harness::{
    AgentCancellation, AgentEventSink, AgentHarness, AgentHarnessContext, AgentHarnessError,
    AgentHarnessOutcome,
};
use crate::ai::agent::runtime::{
    AgentLoopRuntime, STAGE_AWAITING_APPROVAL, STAGE_COMPLETED, STAGE_EXECUTING, STAGE_REASONING,
    STAGE_TOOL_SELECTION, STAGE_VERIFYING,
};
use crate::ai::agent::types::{AgentInputMessage, AgentRunStatus, AgentToolCall, AgentUsage};
use crate::{ai::mcp, code_index};

use super::config::{OpenAiCompatibleConfig, OPENROUTER_URL};
use super::guardian::run_guardian_check;
use super::{prompt, skills, tools, utils};

const THINKING_START_TAG: &str = "<thinking>";
const THINKING_END_TAG: &str = "</thinking>";

pub struct OpenAiCompatibleHarness {
    pub config: OpenAiCompatibleConfig,
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
                "OpenAI compatible API key cannot be empty. Please configure it in Settings.",
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
    let use_synthetic_thinking = should_use_synthetic_thinking(&context.model_id);
    let mut negotiation_messages = context.messages.clone();
    let mut runtime = initial_runtime_for_context(&context)?;
    let mut attempt = 0;
    let mut forced_final_answer_retry_used = false;
    let mut forced_follow_up_retry_used = false;
    let mut forced_action_retry_used = false;
    let mut forced_file_change_cleanup_retry_used = false;
    let mut forced_local_match_retry_used = false;
    let mut forced_workspace_rehash_retry_used = false;

    while attempt < 3 {
        let stage_message = format!(
            "{} (Negociere {}/{})",
            runtime.status_message(),
            attempt + 1,
            3
        );
        sink.status(runtime.run_status(), Some(stage_message));

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
            .map_err(|error| {
                AgentHarnessError::new(format!("Failed to create HTTP client: {error}"))
            })?;

        let endpoint = utils::resolve_chat_endpoint(&config.base_url);
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

        let mut allowed_tool_names = runtime.allowed_tool_names().into_iter().collect::<Vec<_>>();
        if runtime.allows_tool("launch_cloud_agent") {
            allowed_tool_names.push("launch_cloud_agent");
        }

        let mut tools =
            tools::filter_tool_definitions(tools::build_tool_definitions(), &allowed_tool_names);
        if runtime.allows_mcp_tools() {
            match mcp::mcp_build_openai_tool_definitions().await {
                Ok(mcp_tools) => {
                    if let Some(tool_array) = tools.as_array_mut() {
                        tool_array.extend(mcp_tools);
                    }
                }
                Err(error) => {
                    eprintln!("[MCP] Failed to build MCP tool definitions: {error}");
                }
            }
        }

        let mut updated_context = context.clone();
        updated_context.messages = negotiation_messages.clone();

        let mut request = json!({
            "model": context.model_id,
            "messages": build_chat_messages(&updated_context, &runtime),
            "stream": true,
            "tools": tools,
            "tool_choice": "auto"
        });
        apply_low_reasoning_effort(&mut request, &config, &context.model_id);

        if cancellation.is_cancelled() {
            return Ok(cancelled_outcome(&context.prompt, ""));
        }

        println!("[AI] Sending request to {}", endpoint);
        let response = client
            .post(&endpoint)
            .bearer_auth(config.api_key.clone())
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
                utils::trim_error_body(&body)
            )));
        }

        sink.status(
            runtime.run_status(),
            Some(format!(
                "Rulez stage-ul {} și procesez răspunsul modelului.",
                runtime.current_stage().display_name
            )),
        );

        let mut streamed = String::new();
        let mut streamed_reasoning = String::new();
        let mut thinking_state = ThinkingStreamState::default();
        let mut current_tool_call_id: Option<String> = None;
        let mut current_tool_name = String::new();
        let mut current_tool_args = String::new();
        let mut emitted_follow_up_tool_call = false;
        let mut emitted_action_tool_call = false;
        let mut emitted_file_change_tool_call = false;
        let mut ignored_plan_tool_call = false;
        let mut pending_external_tool_name: Option<String> = None;
        let mut usage = None;
        let mut sse_buffer = String::new();
        let mut byte_stream = response.bytes_stream();
        let mut guardian_rejection_reason: Option<String> = None;
        let mut mcp_tool_result: Option<(String, String, String, String)> = None;
        let recent_local_match_paths = extract_recent_workspace_local_match_paths(&updated_context);

        while let Some(next_chunk) = byte_stream.next().await {
            if cancellation.is_cancelled() {
                return Ok(cancelled_outcome(&context.prompt, &streamed));
            }

            let bytes = next_chunk
                .map_err(|error| AgentHarnessError::new(format!("Stream interrupted: {error}")))?;

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

                    match handle_stream_payload(
                        data,
                        &sink,
                        &mut streamed,
                        &mut streamed_reasoning,
                        &mut thinking_state,
                        use_synthetic_thinking,
                        &mut usage,
                    ) {
                        Ok(Some(delta_payload)) => {
                            if !use_synthetic_thinking {
                                if let Some(reasoning_delta) = delta_payload.reasoning {
                                    streamed_reasoning.push_str(&reasoning_delta);
                                    sink.reasoning(streamed_reasoning.clone(), false);
                                }
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
                        Err(_) => {}
                    }
                } else if line.starts_with('{') && line.ends_with('}') {
                    let _ = handle_stream_payload(
                        &line,
                        &sink,
                        &mut streamed,
                        &mut streamed_reasoning,
                        &mut thinking_state,
                        use_synthetic_thinking,
                        &mut usage,
                    );
                }
            }

            if current_tool_call_id.is_some() && !current_tool_args.is_empty() {
                if let Ok(args_value) = serde_json::from_str::<Value>(&current_tool_args) {
                    if !runtime.allows_tool(&current_tool_name) {
                        guardian_rejection_reason = Some(format!(
                            "Tool-ul `{}` nu este permis în stage-ul curent `{}`.",
                            current_tool_name,
                            runtime.current_stage_id()
                        ));
                        current_tool_name.clear();
                        current_tool_args.clear();
                        break;
                    }

                    if current_tool_name == "propose_plan" && !prompt_supports_plan(&context.prompt)
                    {
                        println!(
                            "[AI] Ignoring propose_plan for non-plan prompt: '{}'",
                            context.prompt
                        );
                        ignored_plan_tool_call = true;
                        current_tool_call_id = None;
                        current_tool_name.clear();
                        current_tool_args.clear();
                        continue;
                    }

                    if current_tool_name == "propose_terminal_command" {
                        if let Some(cmd) = args_value.get("command").and_then(Value::as_str) {
                            let guardian_intent = guardian_intent_context(&context);
                            if !context_supports_terminal_command(&context) {
                                println!(
                                    "[GUARDIAN] Rejected terminal command for non-terminal prompt: '{}'",
                                    cmd
                                );
                                guardian_rejection_reason = Some(
                                    "Cererea utilizatorului nu cere o comandă de terminal. Răspunde direct, fără să propui un shell command.".to_string(),
                                );
                                current_tool_args = cmd.to_string();
                                current_tool_name.clear();
                                break;
                            }

                            let guardian_model = context
                                .terminal_model_id
                                .as_deref()
                                .filter(|m| !m.trim().is_empty())
                                .unwrap_or(&context.model_id);

                            match run_guardian_check(&config, guardian_model, cmd, &guardian_intent)
                                .await
                            {
                                Ok(Some(reason)) => {
                                    println!(
                                        "[GUARDIAN] Rejected command: '{}'. Reason: {}",
                                        cmd, reason
                                    );
                                    let rejected_command = cmd.to_string();
                                    guardian_rejection_reason = Some(reason);
                                    current_tool_args = rejected_command;
                                    current_tool_name.clear();
                                    break;
                                }
                                _ => {
                                    println!("[GUARDIAN] Approved command: '{}'", cmd);
                                }
                            }
                        }
                    }

                    if current_tool_name.starts_with("mcp__") {
                        let tool_call_id =
                            current_tool_call_id.take().expect("tool id should exist");
                        let tool_name = current_tool_name.clone();
                        let raw_args = current_tool_args.clone();

                        runtime_transition(&mut runtime, STAGE_EXECUTING)?;
                        sink.status(
                            runtime.run_status(),
                            Some(format!("Rulez tool-ul MCP `{tool_name}`.")),
                        );

                        let result = match mcp::call_openai_mcp_tool(&tool_name, args_value).await {
                            Ok(result) => result,
                            Err(error) => json!({ "error": error }).to_string(),
                        };

                        mcp_tool_result = Some((tool_call_id, tool_name, raw_args, result));
                        current_tool_name.clear();
                        current_tool_args.clear();
                        break;
                    }

                    if guardian_rejection_reason.is_none() {
                        if current_tool_name == "explore_workspace"
                            && !recent_local_match_paths.is_empty()
                        {
                            guardian_rejection_reason = Some(format!(
                                "Există deja fișiere candidate găsite local în directorul curent: {}. Nu repeta `explore_workspace`; citește unul dintre aceste fișiere cu `read_workspace_file` sau continuă analiza pe baza lor.",
                                recent_local_match_paths.join(", ")
                            ));
                            current_tool_name.clear();
                            current_tool_args.clear();
                            break;
                        }

                        if current_tool_name == "suggest_follow_up" {
                            emitted_follow_up_tool_call = true;
                        } else {
                            emitted_action_tool_call = true;
                            if current_tool_name == "propose_file_change" {
                                emitted_file_change_tool_call = true;
                            }
                        }

                        let tool_name = current_tool_name.clone();
                        sink.tool_call(AgentToolCall {
                            id: current_tool_call_id.take().expect("tool id should exist"),
                            name: tool_name.clone(),
                            args: args_value,
                        });
                        if tool_requires_external_resolution(&tool_name) {
                            pending_external_tool_name = Some(tool_name.clone());
                            if tool_requires_user_approval(&tool_name) {
                                if runtime.current_stage_id() == STAGE_VERIFYING {
                                    runtime_transition(&mut runtime, STAGE_TOOL_SELECTION)?;
                                }
                                runtime_transition(&mut runtime, STAGE_AWAITING_APPROVAL)?;
                                sink.status(
                                    runtime.run_status(),
                                    Some(format!(
                                        "Aștept aprobarea sau rezolvarea pentru `{tool_name}`."
                                    )),
                                );
                            }
                        }
                        current_tool_name.clear();
                        current_tool_args.clear();
                    }
                }
            }
        }

        if let Some((tool_call_id, tool_name, raw_args, result)) = mcp_tool_result {
            sink.tool_result(tool_call_id.clone(), result.clone());
            negotiation_messages.push(AgentInputMessage {
                role: "assistant".to_string(),
                content: String::new(),
                tool_call_id: None,
                tool_calls: Some(json!([
                    {
                        "id": tool_call_id.clone(),
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": raw_args
                        }
                    }
                ])),
            });
            negotiation_messages.push(AgentInputMessage {
                role: "tool".to_string(),
                content: result,
                tool_call_id: Some(tool_call_id),
                tool_calls: None,
            });
            runtime_transition(&mut runtime, STAGE_VERIFYING)?;
            attempt += 1;
            continue;
        }

        if let Some(reason) = guardian_rejection_reason {
            if !current_tool_args.trim().is_empty() {
                negotiation_messages.push(AgentInputMessage {
                    role: "assistant".to_string(),
                    content: String::new(),
                    tool_call_id: None,
                    tool_calls: Some(guardian_intercepted_tool_calls(&current_tool_args)),
                });
            }
            negotiation_messages.push(AgentInputMessage {
                role: "system".to_string(),
                content: format!(
                    "[RUNTIME] Acțiunea propusă a fost respinsă deoarece: {}. \
                    Revizuiește alegerea în stage-ul curent și selectează o alternativă compatibilă, sigură și mai precisă.",
                    reason
                ),
                tool_call_id: current_tool_args
                    .trim()
                    .is_empty()
                    .then(|| None)
                    .unwrap_or_else(|| Some("guardian-intercepted-id".to_string())),
                tool_calls: None,
            });

            if runtime.current_stage_id() == STAGE_VERIFYING {
                runtime_transition(&mut runtime, STAGE_TOOL_SELECTION)?;
            }
            attempt += 1;
            continue;
        }

        let remaining = sse_buffer.trim();
        if !remaining.is_empty() {
            let data = remaining.strip_prefix("data:").unwrap_or(remaining).trim();
            if data != "[DONE]" {
                let _ = handle_stream_payload(
                    data,
                    &sink,
                    &mut streamed,
                    &mut streamed_reasoning,
                    &mut thinking_state,
                    use_synthetic_thinking,
                    &mut usage,
                );
            }
        }

        if !use_synthetic_thinking {
            thinking_state.finish(&sink, &mut streamed, &mut streamed_reasoning);
        }

        let visible_response = streamed.trim();
        let reasoning_response = streamed_reasoning.trim();
        let pseudo_plan_response = is_pseudo_plan_response(visible_response);
        let should_force_file_change_retry = prompt_requests_file_change(&context.prompt)
            && response_looks_like_inline_code(visible_response)
            && !emitted_action_tool_call
            && !forced_action_retry_used;
        let should_force_file_change_cleanup_retry = should_retry_file_change_duplicate_code(
            visible_response,
            emitted_file_change_tool_call,
            forced_file_change_cleanup_retry_used,
        );
        if (visible_response.is_empty() || pseudo_plan_response)
            && !emitted_action_tool_call
            && (ignored_plan_tool_call || pseudo_plan_response || reasoning_response.is_empty())
            && !forced_action_retry_used
        {
            negotiation_messages.push(AgentInputMessage {
                role: "system".to_string(),
                content: format!(
                    "Răspunsul anterior nu a produs o acțiune utilă pentru cererea utilizatorului. \
                    Nu mai propune plan. Dacă sarcina cere creare/modificare fișier, emite `propose_file_change`. \
                    Dacă sarcina cere explorare recursivă, căutare de fișiere, funcții sau variabile în workspace, emite `explore_workspace`. \
                    Dacă sarcina cere rulare/verificare/test, emite `propose_terminal_command`. \
                    Dacă deja există un fișier sau un rezultat în context, continuă concret următorul pas. \
                    Cererea curentă este: {}",
                    context.prompt
                ),
                tool_call_id: None,
                tool_calls: None,
            });
            forced_action_retry_used = true;
            attempt += 1;
            continue;
        }

        if should_force_file_change_cleanup_retry {
            negotiation_messages.push(AgentInputMessage {
                role: "system".to_string(),
                content: format!(
                    "Ai emis deja `propose_file_change`, dar ai repetat codul sau diff-ul în răspunsul vizibil. \
                    Reîncearcă și păstrează doar un mesaj foarte scurt pentru utilizator, fără code block, fără a repeta conținutul fișierului și fără a dubla diff-ul. \
                    UI-ul afișează deja blocul de fișier nativ. \
                    Nu emite `suggest_follow_up` în această încercare. \
                    Cererea curentă este: {}",
                    context.prompt
                ),
                tool_call_id: None,
                tool_calls: None,
            });
            forced_file_change_cleanup_retry_used = true;
            attempt += 1;
            continue;
        }

        if should_force_file_change_retry {
            negotiation_messages.push(AgentInputMessage {
                role: "system".to_string(),
                content: format!(
                    "Cererea utilizatorului cere creare sau generare de cod într-un fișier local, dar ai răspuns cu cod vizibil în chat. \
                    Reîncearcă folosind `propose_file_change` în loc de code block. \
                    Alege un nume de fișier scurt și rezonabil dacă utilizatorul nu a dat unul explicit. \
                    Nu emite `suggest_follow_up` în această încercare. \
                    Cererea curentă este: {}",
                    context.prompt
                ),
                tool_call_id: None,
                tool_calls: None,
            });
            forced_action_retry_used = true;
            attempt += 1;
            continue;
        }

        if should_retry_follow_up_only(
            visible_response,
            emitted_follow_up_tool_call,
            forced_follow_up_retry_used,
        ) {
            negotiation_messages.push(AgentInputMessage {
                role: "system".to_string(),
                content: format!(
                    "Ai făcut deja o căutare și ai emis doar o sugestie de follow-up fără răspuns vizibil. \
                    Acum trebuie să răspunzi direct utilizatorului cu un rezumat clar și util al rezultatelor găsite pentru: {}. \
                    Nu emite `suggest_follow_up` în această încercare. Nu cere clarificări dacă cererea este deja suficient de specifică.",
                    context.prompt
                ),
                tool_call_id: None,
                tool_calls: None,
            });
            forced_follow_up_retry_used = true;
            attempt += 1;
            continue;
        }

        if !recent_local_match_paths.is_empty()
            && response_claims_workspace_not_found(visible_response)
            && !forced_local_match_retry_used
        {
            negotiation_messages.push(AgentInputMessage {
                role: "system".to_string(),
                content: format!(
                    "Răspunsul anterior spune greșit că nu ai găsit nimic, dar contextul conține deja match-uri locale explicite în cwd: {}. \
                    Nu mai spune că nu ai găsit proiectul. Următorul pas corect este să citești fișierul cel mai relevant cu `read_workspace_file` sau să continui analiza pe baza fișierului deja citit.",
                    recent_local_match_paths.join(", ")
                ),
                tool_call_id: None,
                tool_calls: None,
            });
            forced_local_match_retry_used = true;
            attempt += 1;
            continue;
        }

        if !recent_local_match_paths.is_empty()
            && response_rehashes_workspace_process(visible_response)
            && !forced_workspace_rehash_retry_used
        {
            negotiation_messages.push(AgentInputMessage {
                role: "system".to_string(),
                content: format!(
                    "Ai deja rezultatul relevant în context pentru fișierele: {}. \
                    Reîncearcă răspunsul final fără scuze, fără recapitularea tentativelor de căutare și fără formulări de tipul «voi începe să caut». \
                    Începe direct cu faptul găsit, apoi oferă analiza sau schimbările propuse.",
                    recent_local_match_paths.join(", ")
                ),
                tool_call_id: None,
                tool_calls: None,
            });
            forced_workspace_rehash_retry_used = true;
            attempt += 1;
            continue;
        }

        if !use_synthetic_thinking
            && visible_response.is_empty()
            && !reasoning_response.is_empty()
            && !forced_final_answer_retry_used
        {
            negotiation_messages.push(AgentInputMessage {
                role: "system".to_string(),
                content: "Răspunsul anterior a fost doar reasoning. Oferă acum numai răspunsul final către utilizator, fără `<thinking>`, fără explicații despre pași și fără să repeți analiza internă.".to_string(),
                tool_call_id: None,
                tool_calls: None,
            });
            forced_final_answer_retry_used = true;
            attempt += 1;
            continue;
        }

        if let Some(tool_name) = pending_external_tool_name {
            sink.status(
                AgentRunStatus::WaitingForTool,
                Some(format!(
                    "Run-ul așteaptă rezultatul extern pentru `{tool_name}`."
                )),
            );
            return Ok(waiting_outcome(&context.prompt, &streamed, usage));
        }

        runtime_transition(&mut runtime, STAGE_COMPLETED)?;
        return Ok(done_outcome(&context.prompt, &streamed, usage));
    }

    let fallback = "Nu pot continua automat cu o comandă sigură după mai multe încercări. Am nevoie de o comandă mai precisă sau de o clarificare scurtă despre ce pas vrei să verific.";
    sink.token(fallback);
    Ok(done_outcome(&context.prompt, fallback, None))
}

struct DeltaToolCall {
    id: Option<String>,
    name: Option<String>,
    arguments: Option<String>,
    reasoning: Option<String>,
}

#[derive(Default)]
struct ThinkingStreamState {
    pending: String,
    inside_thinking: bool,
}

impl ThinkingStreamState {
    fn push_content(
        &mut self,
        content: &str,
        sink: &AgentEventSink,
        streamed: &mut String,
        streamed_reasoning: &mut String,
    ) {
        if content.is_empty() {
            return;
        }

        self.pending.push_str(content);

        loop {
            if self.pending.is_empty() {
                break;
            }

            if self.inside_thinking {
                if let Some(end_idx) = self.pending.find(THINKING_END_TAG) {
                    let thinking_part = self.pending[..end_idx].to_string();
                    if !thinking_part.is_empty() {
                        streamed_reasoning.push_str(&thinking_part);
                        sink.reasoning(streamed_reasoning.clone(), true);
                    }
                    self.pending.drain(..end_idx + THINKING_END_TAG.len());
                    self.inside_thinking = false;
                    continue;
                }

                let safe_suffix_len = longest_tag_suffix_len(&self.pending, THINKING_END_TAG);
                let emit_len = self.pending.len().saturating_sub(safe_suffix_len);
                if emit_len == 0 {
                    break;
                }

                let thinking_part = self.pending[..emit_len].to_string();
                streamed_reasoning.push_str(&thinking_part);
                sink.reasoning(streamed_reasoning.clone(), false);
                self.pending.drain(..emit_len);
                continue;
            }

            if let Some(start_idx) = self.pending.find(THINKING_START_TAG) {
                // Native-thinking models sometimes emit a short preamble before the
                // first <thinking> tag. Keep the visible response clean and only emit
                // the reasoning block itself once thinking starts.
                self.pending.drain(..start_idx + THINKING_START_TAG.len());
                self.inside_thinking = true;
                continue;
            }

            let safe_suffix_len = longest_tag_suffix_len(&self.pending, THINKING_START_TAG);
            let emit_len = self.pending.len().saturating_sub(safe_suffix_len);
            if emit_len == 0 {
                break;
            }

            let text = self.pending[..emit_len].to_string();
            streamed.push_str(&text);
            sink.token(&text);
            self.pending.drain(..emit_len);
        }
    }

    fn finish(
        &mut self,
        sink: &AgentEventSink,
        streamed: &mut String,
        streamed_reasoning: &mut String,
    ) {
        if self.pending.is_empty() {
            return;
        }

        let pending = std::mem::take(&mut self.pending);
        if self.inside_thinking {
            streamed_reasoning.push_str(&pending);
            sink.reasoning(streamed_reasoning.clone(), true);
        } else {
            streamed.push_str(&pending);
            sink.token(pending);
        }
    }
}

fn longest_tag_suffix_len(text: &str, tag: &str) -> usize {
    let mut boundaries = text.char_indices().map(|(idx, _)| idx).collect::<Vec<_>>();
    boundaries.retain(|idx| *idx < text.len());

    for start in boundaries.into_iter().rev() {
        let suffix = &text[start..];
        if !suffix.is_empty() && tag.starts_with(suffix) {
            return suffix.len();
        }
    }

    0
}

fn prompt_supports_terminal_command(prompt: &str) -> bool {
    let prompt = prompt.to_lowercase();
    let terminal_keywords = [
        "terminal",
        "shell",
        "command",
        "comand",
        "modal",
        "cloud",
        "container",
        "volume",
        "deploy",
        "agent",
        "workspace",
        "script",
        "repo",
        "repository",
        "git",
        "fișier",
        "fisier",
        "fișiere",
        "fisiere",
        "folder",
        "director",
        "directoare",
        "path",
        "cale",
        "build",
        "test",
        "testare",
        "debug",
        "depan",
        "rulează",
        "ruleaza",
        "run ",
        "execut",
        "instal",
        "inspect",
        "verific",
        "list",
        "liste",
        "open ",
        "deschide",
        "search",
        "caut",
        "find",
    ];

    terminal_keywords
        .iter()
        .any(|keyword| prompt.contains(keyword))
}

fn context_supports_terminal_command(context: &AgentHarnessContext) -> bool {
    if prompt_supports_terminal_command(&context.prompt) {
        return true;
    }

    if is_continuation_prompt(&context.prompt) || context.prompt.trim().is_empty() {
        return recent_context_supports_terminal_command(context);
    }

    false
}

fn is_continuation_prompt(prompt: &str) -> bool {
    let normalized = prompt
        .to_lowercase()
        .replace(['.', '!', '?'], "")
        .trim()
        .to_string();
    matches!(
        normalized.as_str(),
        "continua"
            | "continuă"
            | "continue"
            | "go on"
            | "mai departe"
            | "next"
            | "ok continua"
            | "ok continuă"
            | "da continua"
            | "da continuă"
    )
}

fn recent_context_supports_terminal_command(context: &AgentHarnessContext) -> bool {
    if context.terminal_blocks.iter().rev().take(3).any(|block| {
        !block.command.trim().is_empty()
            || block.exit_code.is_some()
            || block.output.to_lowercase().contains("traceback")
    }) {
        return true;
    }

    context.messages.iter().rev().take(8).any(|message| {
        let content = message.content.to_lowercase();
        content.contains("[invisible harness instruction]")
            || content.contains("propose_terminal_command")
            || content.contains("applied file changes successfully")
            || content.contains("file changes")
            || content.contains("comanda s-a executat")
            || content.contains("failed")
            || content.contains("traceback")
            || content.contains("test")
            || content.contains("verific")
            || content.contains("rulez")
            || content.contains("run")
    })
}

fn guardian_intent_context(context: &AgentHarnessContext) -> String {
    let mut parts = vec![format!("Prompt curent: {}", context.prompt)];

    let recent_messages = context
        .messages
        .iter()
        .rev()
        .take(6)
        .filter(|message| !message.content.trim().is_empty())
        .map(|message| {
            format!(
                "{}: {}",
                message.role,
                truncate_for_guardian(&message.content, 700)
            )
        })
        .collect::<Vec<_>>();

    if !recent_messages.is_empty() {
        parts.push(format!(
            "Context conversație recentă:\n{}",
            recent_messages
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    let recent_terminal = context
        .terminal_blocks
        .iter()
        .rev()
        .take(3)
        .map(|block| {
            format!(
                "command={} exit={:?} output={}",
                block.command,
                block.exit_code,
                truncate_for_guardian(&block.output, 500)
            )
        })
        .collect::<Vec<_>>();

    if !recent_terminal.is_empty() {
        parts.push(format!(
            "Context terminal recent:\n{}",
            recent_terminal
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    parts.join("\n\n")
}

fn truncate_for_guardian(value: &str, max_chars: usize) -> String {
    let normalized = value.replace('\n', " ");
    let mut chars = normalized.chars();
    let clipped = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{clipped}...")
    } else {
        clipped
    }
}

fn prompt_supports_plan(prompt: &str) -> bool {
    let prompt = prompt.to_lowercase();
    let plan_keywords = [
        "implement",
        "implementation",
        "debug",
        "debugging",
        "fix",
        "bug",
        "refactor",
        "migrate",
        "migration",
        "architecture",
        "architectură",
        "arhitectură",
        "research",
        "investigate",
        "investiga",
        "task",
        "project",
        "feature",
        "roadmap",
        "plan",
        "workstream",
        "steps",
        "paș",
        "pas",
        "cerinț",
        "cerint",
        "specifica",
        "specification",
    ];

    plan_keywords.iter().any(|keyword| prompt.contains(keyword))
}

fn prompt_requests_file_change(prompt: &str) -> bool {
    let prompt = prompt.to_lowercase();
    let creation_keywords = [
        "create",
        "creeaza",
        "creează",
        "generate",
        "genereaza",
        "generează",
        "write",
        "scrie",
        "implement",
        "build",
        "fa ",
        "fă ",
    ];
    let file_targets = [
        "file",
        "fișier",
        "fisier",
        "script",
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".rs",
        ".go",
        ".java",
        ".json",
        "python",
        "component",
        "module",
        "functie",
        "funcție",
        "generator",
        "class",
    ];

    creation_keywords
        .iter()
        .any(|keyword| prompt.contains(keyword))
        && file_targets.iter().any(|keyword| prompt.contains(keyword))
}

fn response_looks_like_inline_code(visible_response: &str) -> bool {
    let normalized = visible_response.trim_start();
    normalized.contains("```")
        || normalized.starts_with("def ")
        || normalized.starts_with("class ")
        || normalized.starts_with("function ")
        || normalized.starts_with("const ")
        || normalized.starts_with("let ")
        || normalized.starts_with("import ")
}

fn should_retry_follow_up_only(
    visible_response: &str,
    emitted_follow_up_tool_call: bool,
    forced_follow_up_retry_used: bool,
) -> bool {
    visible_response.is_empty() && emitted_follow_up_tool_call && !forced_follow_up_retry_used
}

fn should_retry_file_change_duplicate_code(
    visible_response: &str,
    emitted_file_change_tool_call: bool,
    forced_file_change_cleanup_retry_used: bool,
) -> bool {
    emitted_file_change_tool_call
        && response_looks_like_inline_code(visible_response)
        && !forced_file_change_cleanup_retry_used
}

fn is_pseudo_plan_response(visible_response: &str) -> bool {
    visible_response
        .trim_start()
        .to_lowercase()
        .starts_with("propose_plan{")
}

fn response_claims_workspace_not_found(visible_response: &str) -> bool {
    let normalized = visible_response.to_lowercase();
    (normalized.contains("nu am găsit")
        || normalized.contains("n-am găsit")
        || normalized.contains("didn't find")
        || normalized.contains("did not find")
        || normalized.contains("not found"))
        && (normalized.contains("fișier")
            || normalized.contains("fisier")
            || normalized.contains("folder")
            || normalized.contains("director")
            || normalized.contains("project")
            || normalized.contains("proiect"))
}

fn response_rehashes_workspace_process(visible_response: &str) -> bool {
    let normalized = visible_response.to_lowercase();
    normalized.contains("îmi pare rău")
        || normalized.contains("imi pare rau")
        || normalized.contains("am încercat")
        || normalized.contains("am incercat")
        || normalized.contains("voi începe")
        || normalized.contains("voi incepe")
        || normalized.contains("trebuie să identific")
        || normalized.contains("trebuie sa identific")
        || normalized.contains("deoarece sunt în folderul personal")
        || normalized.contains("deoarece sunt in folderul personal")
}

fn extract_recent_workspace_local_match_paths(context: &AgentHarnessContext) -> Vec<String> {
    let mut matches = Vec::new();

    for message in context
        .messages
        .iter()
        .rev()
        .filter(|message| message.role == "tool")
        .take(8)
    {
        if !message
            .content
            .contains("Local matches found in the current directory")
        {
            continue;
        }

        let mut inside_files_block = false;
        for line in message.content.lines() {
            let trimmed = line.trim();
            if trimmed == "Files:" {
                inside_files_block = true;
                continue;
            }

            if !inside_files_block {
                continue;
            }

            if trimmed.is_empty()
                || trimmed.starts_with("Directories:")
                || trimmed.starts_with("Search warnings:")
                || trimmed.starts_with("Filtered ")
                || trimmed.starts_with("Searched for ")
            {
                break;
            }

            if let Some(path) = trimmed.strip_prefix("- ") {
                let normalized = path.trim().to_string();
                if !normalized.is_empty() && !matches.contains(&normalized) {
                    matches.push(normalized);
                }
            }
        }
    }

    matches.reverse();
    matches
}

fn handle_stream_payload(
    payload: &str,
    sink: &AgentEventSink,
    streamed: &mut String,
    streamed_reasoning: &mut String,
    thinking_state: &mut ThinkingStreamState,
    use_synthetic_thinking: bool,
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

    if let Some(content) = delta
        .and_then(|item| item.get("content"))
        .and_then(Value::as_str)
    {
        if use_synthetic_thinking {
            streamed.push_str(content);
            sink.token(content);
        } else {
            thinking_state.push_content(content, sink, streamed, streamed_reasoning);
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

fn should_use_synthetic_thinking(model_id: &str) -> bool {
    model_id.to_lowercase().contains("gemma")
}

fn apply_low_reasoning_effort(
    request: &mut Value,
    config: &OpenAiCompatibleConfig,
    model_id: &str,
) {
    if !is_openai_reasoning_model(model_id) {
        return;
    }

    let is_openai_endpoint = config.base_url.contains("api.openai.com");
    if !is_openai_endpoint {
        return;
    }

    if let Some(object) = request.as_object_mut() {
        object.insert("reasoning_effort".to_string(), json!("low"));
    }
}

fn is_openai_reasoning_model(model_id: &str) -> bool {
    let model = model_id.to_lowercase();
    model.starts_with("o1")
        || model.starts_with("o3")
        || model.starts_with("o4")
        || model.starts_with("gpt-5")
}

fn initial_runtime_for_context(
    context: &AgentHarnessContext,
) -> Result<AgentLoopRuntime, AgentHarnessError> {
    if should_resume_in_verifying_stage(context) {
        return AgentLoopRuntime::resume(STAGE_VERIFYING)
            .map_err(|error| AgentHarnessError::new(error.message));
    }

    let mut runtime = AgentLoopRuntime::new();
    runtime_transition(&mut runtime, STAGE_REASONING)?;
    runtime_transition(&mut runtime, STAGE_TOOL_SELECTION)?;
    Ok(runtime)
}

fn should_resume_in_verifying_stage(context: &AgentHarnessContext) -> bool {
    if is_continuation_prompt(&context.prompt) || context.prompt.trim().is_empty() {
        return context
            .messages
            .iter()
            .rev()
            .find(|message| {
                message.role != "system"
                    && (message.role == "tool"
                        || !message.content.trim().is_empty()
                        || message.tool_calls.is_some())
            })
            .map(|message| message.role == "tool")
            .unwrap_or(false);
    }

    false
}

fn runtime_transition(
    runtime: &mut AgentLoopRuntime,
    next_stage_id: &str,
) -> Result<(), AgentHarnessError> {
    runtime
        .transition_to(next_stage_id)
        .map_err(|error| AgentHarnessError::new(error.message))
}

fn tool_requires_user_approval(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "propose_terminal_command"
            | "propose_file_change"
            | "propose_mcp_server"
            | "launch_cloud_agent"
    )
}

fn tool_requires_external_resolution(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "lookup_web"
            | "explore_workspace"
            | "read_workspace_file"
            | "propose_terminal_command"
            | "propose_file_change"
            | "propose_mcp_server"
            | "launch_cloud_agent"
    )
}

fn build_chat_messages(context: &AgentHarnessContext, runtime: &AgentLoopRuntime) -> Vec<Value> {
    let mut messages = Vec::new();
    let cwd = context.cwd.as_deref().unwrap_or("unknown");

    let injected_skills_text = skills::load_skills_instructions(&context.prompt, &context.messages);

    let mut system_prompt =
        prompt::build_identity_prompt(cwd, &context.target_os, &context.target_arch);
    if !injected_skills_text.is_empty() {
        system_prompt.push_str(
            "\n\n[INFORMATIE INVIZIBILA PENTRU UTILIZATOR - SKILL-URI INVOCATE SI ACTIVE]",
        );
        system_prompt.push_str("\nUrmatoarele instructiuni de specialitate sunt active deoarece utilizatorul a invocat skill-ul respectiv:");
        system_prompt.push_str(&injected_skills_text);
    }

    messages.push(json!({
        "role": "system",
        "content": system_prompt
    }));

    messages.push(json!({
        "role": "system",
        "content": prompt::build_stage_prompt(runtime.current_stage())
    }));

    if let Some(terminal_context) = build_terminal_context_message(context) {
        messages.push(json!({
            "role": "system",
            "content": terminal_context
        }));
    }

    if let Some(workspace_context) = build_workspace_context_message(cwd) {
        messages.push(json!({
            "role": "system",
            "content": workspace_context
        }));
    }

    if let Some(index_context) = code_index::code_index_context_for_cwd(cwd, &context.prompt, 10) {
        messages.push(json!({
            "role": "system",
            "content": index_context
        }));
    }

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

fn build_workspace_context_message(cwd: &str) -> Option<String> {
    if cwd.trim().is_empty() || cwd == "unknown" {
        return None;
    }

    let home_dir = std::env::var("HOME").ok();
    let is_broad_cwd = home_dir.as_deref().map(|home| cwd == home).unwrap_or(false)
        || Path::new(cwd).components().count() <= 3;
    let entries = fs::read_dir(cwd).ok()?;
    let mut names = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.trim().is_empty() {
                return None;
            }

            let suffix = entry
                .file_type()
                .ok()
                .filter(|file_type| file_type.is_dir())
                .map(|_| "/")
                .unwrap_or("");
            Some(format!("{file_name}{suffix}"))
        })
        .collect::<Vec<_>>();

    if names.is_empty() {
        return None;
    }

    names.sort_unstable();
    let max_entries = if is_broad_cwd { 12 } else { 24 };
    if names.len() > max_entries {
        names.truncate(max_entries);
        names.push("...".to_string());
    }

    Some(format!(
        "CONTEXT WORKSPACE:\n- cwd: {cwd}\n- top-level entries:\n{}\
        \nREGULĂ PATH: tratează cwd ca rădăcina operațiunilor locale. În `propose_file_change`, folosește path-uri relative la cwd pentru fișiere de proiect. Dacă vrei să citești un fișier anume, folosește `read_workspace_file`. Dacă vrei să listezi sau să cauți în proiect, folosește `explore_workspace`. Nu presupune că un subdirector vizibil este proiectul corect fără un pas explicit de listare sau căutare.",
        indent_block(&names.join("\n"), 2)
    ))
}

fn build_terminal_context_message(context: &AgentHarnessContext) -> Option<String> {
    let finished_blocks = context
        .terminal_blocks
        .iter()
        .rev()
        .filter(|block| block.status.as_deref() == Some("finished") || block.finished_at.is_some())
        .take(6)
        .collect::<Vec<_>>();

    if finished_blocks.is_empty() {
        return None;
    }

    let mut lines = vec![
        "CONTEXT TERMINAL RECENT:".to_string(),
        "Utilizatorul vede deja output-ul brut în UI, dar aici ai o versiune compactă ca să poți înțelege exact ce s-a întâmplat.".to_string(),
    ];

    for block in finished_blocks.into_iter().rev() {
        let status = block
            .status
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("finished");
        let exit_code = block
            .exit_code
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let output = summarize_output(&block.output);
        lines.push(format!(
            "- command: {}\n  status: {}\n  exit_code: {}\n  output:\n{}",
            block.command,
            status,
            exit_code,
            indent_block(&output, 4)
        ));
    }

    Some(lines.join("\n"))
}

fn indent_block(text: &str, spaces: usize) -> String {
    let prefix = " ".repeat(spaces);
    text.lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn summarize_output(output: &str) -> String {
    let lines = output.lines().collect::<Vec<_>>();
    if lines.len() <= 10 {
        return output.to_string();
    }

    let omitted = lines.len().saturating_sub(10);
    let mut summary = lines
        .iter()
        .take(5)
        .map(|line| (*line).to_string())
        .collect::<Vec<_>>();
    summary.push(format!("... ({omitted} lines omitted) ..."));
    summary.extend(
        lines
            .iter()
            .skip(lines.len().saturating_sub(5))
            .map(|line| (*line).to_string()),
    );
    summary.join("\n")
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
        tool_calls: message
            .tool_calls
            .as_ref()
            .map(normalize_outbound_tool_calls),
    })
}

fn guardian_intercepted_tool_calls(command: &str) -> Value {
    json!([{
        "id": "guardian-intercepted-id",
        "type": "function",
        "function": {
            "name": "propose_terminal_command",
            "arguments": serde_json::to_string(&json!({
                "command": command,
            }))
            .expect("guardian intercepted command arguments should serialize"),
        }
    }])
}

fn normalize_outbound_tool_calls(tool_calls: &Value) -> Value {
    let Some(calls) = tool_calls.as_array() else {
        return tool_calls.clone();
    };

    Value::Array(
        calls
            .iter()
            .map(normalize_outbound_tool_call)
            .collect::<Vec<_>>(),
    )
}

fn normalize_outbound_tool_call(tool_call: &Value) -> Value {
    let Some(object) = tool_call.as_object() else {
        return tool_call.clone();
    };

    let mut normalized = object.clone();
    if let Some(function) = normalized
        .get_mut("function")
        .and_then(Value::as_object_mut)
    {
        if let Some(arguments) = function.get_mut("arguments") {
            if !arguments.is_string() {
                *arguments = Value::String(
                    serde_json::to_string(arguments)
                        .expect("tool call arguments should serialize to JSON string"),
                );
            }
        }
    }

    Value::Object(normalized)
}

fn done_outcome(prompt: &str, streamed: &str, usage: Option<AgentUsage>) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::Completed,
        usage: usage.unwrap_or_else(|| AgentUsage::approximate(prompt, streamed)),
    }
}

fn waiting_outcome(prompt: &str, streamed: &str, usage: Option<AgentUsage>) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::WaitingForTool,
        usage: usage.unwrap_or_else(|| AgentUsage::approximate(prompt, streamed)),
    }
}

fn cancelled_outcome(prompt: &str, streamed: &str) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::Cancelled,
        usage: AgentUsage::approximate(prompt, streamed),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        context_supports_terminal_command, guardian_intercepted_tool_calls, longest_tag_suffix_len,
        normalize_outbound_tool_calls, prompt_supports_terminal_command,
        should_retry_file_change_duplicate_code, should_retry_follow_up_only,
    };
    use crate::ai::agent::harness::AgentHarnessContext;
    use crate::ai::agent::types::{AgentInputMessage, TerminalBlockContext};
    use serde_json::json;

    fn harness_context(
        prompt: &str,
        messages: Vec<AgentInputMessage>,
        terminal_blocks: Vec<TerminalBlockContext>,
    ) -> AgentHarnessContext {
        AgentHarnessContext {
            run_id: "run-test".to_string(),
            conversation_id: "conv-test".to_string(),
            assistant_message_id: "assistant-test".to_string(),
            prompt: prompt.to_string(),
            messages,
            terminal_blocks,
            cwd: None,
            target_os: "macos".to_string(),
            target_arch: "arm64".to_string(),
            model_id: "test-model".to_string(),
            terminal_model_id: None,
        }
    }

    #[test]
    fn longest_tag_suffix_does_not_accept_empty_suffix() {
        assert_eq!(longest_tag_suffix_len("<th", "<thinking>"), 3);
        assert_eq!(longest_tag_suffix_len("inking", "<thinking>"), 0);
        assert_eq!(longest_tag_suffix_len("</think", "</thinking>"), 7);
    }

    #[test]
    fn follow_up_retry_depends_on_emitted_follow_up_tool_call() {
        assert!(should_retry_follow_up_only("", true, false));
        assert!(!should_retry_follow_up_only("Rezumat util", true, false));
        assert!(!should_retry_follow_up_only("", false, false));
        assert!(!should_retry_follow_up_only("", true, true));
    }

    #[test]
    fn file_change_cleanup_retry_depends_on_duplicate_visible_code() {
        assert!(should_retry_file_change_duplicate_code(
            "```python\nprint('hi')\n```",
            true,
            false
        ));
        assert!(!should_retry_file_change_duplicate_code(
            "Am pregătit fișierul pentru review.",
            true,
            false
        ));
        assert!(!should_retry_file_change_duplicate_code(
            "```python\nprint('hi')\n```",
            false,
            false
        ));
        assert!(!should_retry_file_change_duplicate_code(
            "```python\nprint('hi')\n```",
            true,
            true
        ));
    }

    #[test]
    fn guardian_intercepted_tool_arguments_are_serialized_as_string() {
        let payload = guardian_intercepted_tool_calls("cd /cloud-agent && ls -la");

        assert_eq!(
            payload[0]["function"]["arguments"],
            json!("{\"command\":\"cd /cloud-agent && ls -la\"}")
        );
    }

    #[test]
    fn normalizes_assistant_tool_call_arguments_from_objects_to_strings() {
        let payload = normalize_outbound_tool_calls(&json!([
            {
                "id": "call-1",
                "type": "function",
                "function": {
                    "name": "propose_terminal_command",
                    "arguments": {
                        "command": "ls -la",
                        "reason": "inspect"
                    }
                }
            }
        ]));

        assert_eq!(
            payload[0]["function"]["arguments"],
            json!("{\"command\":\"ls -la\",\"reason\":\"inspect\"}")
        );
    }

    #[test]
    fn terminal_prompt_support_includes_modal_cloud_flows() {
        assert!(prompt_supports_terminal_command(
            "modal e deja configurat; creează un container și scrie un fișier în cloud"
        ));
    }

    #[test]
    fn empty_prompt_is_treated_like_continuation_when_recent_tool_context_exists() {
        let context = harness_context(
            "",
            vec![AgentInputMessage {
                role: "tool".to_string(),
                content: "[Invisible harness instruction]\nContinue toward the original user goal."
                    .to_string(),
                tool_call_id: Some("tool-1".to_string()),
                tool_calls: None,
            }],
            vec![],
        );

        assert!(context_supports_terminal_command(&context));
    }
}
