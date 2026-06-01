use serde_json::{json, Value};

use crate::ai::agent::harness::{AgentEventSink, AgentHarnessContext, AgentHarnessError};
use crate::ai::agent::runtime::{
    AgentLoopRuntime, PHASE_COMPLETED, PHASE_RUNNING, PHASE_WAITING_FOR_TOOL,
};
use crate::ai::agent::types::{
    AgentInputMessage, AgentPendingResolutionKind, AgentPendingToolCall,
};
use crate::ai::mcp;
use crate::ai::web_search;
use std::path::PathBuf;

use super::super::config::OpenAiCompatibleConfig;
use super::super::guardian::run_guardian_check;
use super::context;
use super::heuristics::{
    command_is_low_risk_terminal_inspection, guardian_intent_context,
};
use super::messages::{
    emit_internal_tool_call, summarize_internal_tool_result,
    system_message, tool_result_message,
};
use super::resume::sync_execution_state;
use super::types::{ActionStageOutcome, StageModelResponse};
use crate::ai::provider_adapter::normalize_tool_call_name;

#[allow(clippy::too_many_arguments)]
pub(super) async fn handle_action_stage_response(
    config: &OpenAiCompatibleConfig,
    context: &AgentHarnessContext,
    sink: &AgentEventSink,
    runtime: &mut AgentLoopRuntime,
    negotiation_messages: &mut Vec<AgentInputMessage>,
    pending_resolution: &mut Option<AgentPendingResolutionKind>,
    pending_tool_call: &mut Option<AgentPendingToolCall>,
    last_runtime_error: &mut Option<String>,
    pass_index: u32,
    response: StageModelResponse,
) -> Result<ActionStageOutcome, AgentHarnessError> {
    let visible_text = response.visible_text;

    if let Some(mut tool_call) = response.tool_call {
        tool_call.name = normalize_tool_call_name(&tool_call.name);

        if let Some(outcome) = guard_terminal_tool_call(
            config,
            context,
            negotiation_messages,
            last_runtime_error,
            &tool_call.name,
            &tool_call.args,
        )
        .await?
        {
            return Ok(outcome);
        }

        if let Some(outcome) = guard_workspace_tool_call(
            context,
            negotiation_messages,
            last_runtime_error,
            &tool_call.name,
        ) {
            return Ok(outcome);
        }

        if let Some(outcome) = guard_file_change_tool_call(
            negotiation_messages,
            last_runtime_error,
            &tool_call.name,
            &tool_call.args,
        ) {
            return Ok(outcome);
        }

        if tool_call.name.starts_with("mcp__") {
            return dispatch_inline_mcp_tool(
                sink,
                runtime,
                negotiation_messages,
                pending_resolution,
                pending_tool_call,
                last_runtime_error,
                pass_index,
                tool_call.id,
                tool_call.name,
                tool_call.args,
                tool_call.raw_args,
            )
            .await;
        }

        // Inline execution for read-only tools
        if matches!(
            tool_call.name.as_str(),
            "read_workspace_file" | "explore_workspace" | "lookup_web"
        ) {
            emit_internal_tool_call(sink, negotiation_messages, &tool_call);
            runtime.transition_to(PHASE_RUNNING);

            let result = dispatch_inline_read_only_tool(context, &tool_call.name, &tool_call.args)
                .await;

            sink.tool_result(tool_call.id.clone(), result.clone());
            negotiation_messages.push(tool_result_message(&tool_call.id, result));
            *pending_resolution = None;
            *pending_tool_call = None;
            *last_runtime_error = None;
            return Ok(ActionStageOutcome::Continue);
        }

        // Auto-approve low-risk terminal commands
        if tool_call.name == "propose_terminal_command" {
            if let Some(command) = tool_call.args.get("command").and_then(Value::as_str) {
                if command_is_low_risk_terminal_inspection(command) {
                    emit_internal_tool_call(sink, negotiation_messages, &tool_call);
                    runtime.transition_to(PHASE_WAITING_FOR_TOOL);
                    *pending_resolution = Some(AgentPendingResolutionKind::ExternalToolResult);
                    *pending_tool_call = Some(AgentPendingToolCall {
                        id: tool_call.id.clone(),
                        name: tool_call.name.clone(),
                    });
                    *last_runtime_error = None;
                    sync_execution_state(
                        sink,
                        runtime,
                        pass_index,
                        pending_resolution.clone(),
                        pending_tool_call.clone(),
                        last_runtime_error.clone(),
                    );
                    return Ok(ActionStageOutcome::Waiting(
                        visible_text.trim().to_string(),
                    ));
                }
            }
        }

        let is_internal_tool = matches!(
            tool_call.name.as_str(),
            "propose_plan" | "update_plan" | "plan_execution" | "suggest_follow_up"
        );

        emit_internal_tool_call(sink, negotiation_messages, &tool_call);

        if is_internal_tool {
            return handle_internal_tool_completion(
                sink,
                runtime,
                negotiation_messages,
                pending_resolution,
                pending_tool_call,
                last_runtime_error,
                pass_index,
                &tool_call,
                visible_text,
            );
        }

        transition_external_tool(
            runtime,
            pending_resolution,
            pending_tool_call,
            last_runtime_error,
            pass_index,
            sink,
            &tool_call.id,
            &tool_call.name,
        )?;

        return Ok(ActionStageOutcome::Waiting(visible_text.trim().to_string()));
    }

    handle_empty_or_direct_response(
        context,
        sink,
        runtime,
        negotiation_messages,
        pending_resolution,
        pending_tool_call,
        last_runtime_error,
        pass_index,
        visible_text,
    )
}

#[allow(clippy::too_many_arguments)]
pub(super) fn emit_final_answer(
    sink: &AgentEventSink,
    runtime: &mut AgentLoopRuntime,
    pass_index: u32,
    pending_resolution: &mut Option<AgentPendingResolutionKind>,
    pending_tool_call: &mut Option<AgentPendingToolCall>,
    last_runtime_error: &mut Option<String>,
    answer: &str,
    emit_answer_token: bool,
) -> Result<(), AgentHarnessError> {
    if emit_answer_token && !answer.is_empty() {
        sink.token(answer);
    }
    runtime.transition_to(PHASE_COMPLETED);
    *pending_resolution = None;
    *pending_tool_call = None;
    *last_runtime_error = None;
    sync_execution_state(
        sink,
        runtime,
        pass_index,
        pending_resolution.clone(),
        pending_tool_call.clone(),
        last_runtime_error.clone(),
    );
    Ok(())
}

async fn guard_terminal_tool_call(
    config: &OpenAiCompatibleConfig,
    context: &AgentHarnessContext,
    negotiation_messages: &mut Vec<AgentInputMessage>,
    last_runtime_error: &mut Option<String>,
    tool_name: &str,
    tool_args: &Value,
) -> Result<Option<ActionStageOutcome>, AgentHarnessError> {
    if tool_name != "propose_terminal_command" {
        return Ok(None);
    }

    let Some(command) = tool_args
        .get("command")
        .and_then(Value::as_str)
        .map(str::trim)
    else {
        negotiation_messages.push(system_message(
            "Tool call `propose_terminal_command` is missing the required `command` field. Re-emit the tool call with a concrete read-only command, or answer directly if no local inspection is needed.",
        ));
        *last_runtime_error = Some("terminal-command-missing-command".to_string());
        return Ok(Some(ActionStageOutcome::Continue));
    };

    if command.is_empty() {
        negotiation_messages.push(system_message(
            "Tool call `propose_terminal_command` must include a non-empty `command`. Re-emit the tool call with a concrete read-only command, or answer directly if no local inspection is needed.",
        ));
        *last_runtime_error = Some("terminal-command-empty-command".to_string());
        return Ok(Some(ActionStageOutcome::Continue));
    }

    if command_is_low_risk_terminal_inspection(command) {
        return Ok(None);
    }

    let guardian_model = context
        .terminal_model_id
        .as_deref()
        .filter(|model| !model.trim().is_empty())
        .unwrap_or(&context.model_id);
    if let Ok(Some(reason)) = run_guardian_check(
        config,
        guardian_model,
        command,
        &guardian_intent_context(context),
    )
    .await
    {
        negotiation_messages.push(AgentInputMessage {
            role: "assistant".to_string(),
            content: String::new(),
            tool_call_id: None,
            tool_calls: Some(context::guardian_intercepted_tool_calls(command)),
        });
        negotiation_messages.push(system_message(format!(
            "Acțiunea propusă a fost respinsă de Guardian: {}. Alege o alternativă mai sigură și mai precisă.",
            reason
        )));
        *last_runtime_error = Some(reason);
        return Ok(Some(ActionStageOutcome::Continue));
    }

    Ok(None)
}

fn guard_workspace_tool_call(
    context: &AgentHarnessContext,
    negotiation_messages: &mut Vec<AgentInputMessage>,
    last_runtime_error: &mut Option<String>,
    tool_name: &str,
) -> Option<ActionStageOutcome> {
    if tool_name != "explore_workspace" {
        return None;
    }

    let recent_paths = context::extract_recent_workspace_local_match_paths(context);
    if recent_paths.is_empty() {
        return None;
    }

    negotiation_messages.push(system_message(format!(
        "Există deja match-uri locale recente: {}. Nu repeta `explore_workspace`; continuă cu `read_workspace_file` sau răspuns direct.",
        recent_paths.join(", ")
    )));
    *last_runtime_error = Some("redundant-explore-workspace".to_string());
    Some(ActionStageOutcome::Continue)
}

fn guard_file_change_tool_call(
    negotiation_messages: &mut Vec<AgentInputMessage>,
    last_runtime_error: &mut Option<String>,
    tool_name: &str,
    tool_args: &Value,
) -> Option<ActionStageOutcome> {
    if tool_name != "propose_file_change" {
        return None;
    }

    let Some(file_diffs) = tool_args.get("fileDiffs").and_then(Value::as_array) else {
        negotiation_messages.push(system_message(
            "Tool call `propose_file_change` must include a `fileDiffs` array. Re-emit the tool call with explicit project-relative `filePath` values for every file.",
        ));
        *last_runtime_error = Some("file-change-missing-file-diffs".to_string());
        return Some(ActionStageOutcome::Continue);
    };

    if file_diffs.is_empty() {
        negotiation_messages.push(system_message(
            "Tool call `propose_file_change` cannot use an empty `fileDiffs` array. Re-emit the intended file changes with explicit project-relative `filePath` values.",
        ));
        *last_runtime_error = Some("file-change-empty-file-diffs".to_string());
        return Some(ActionStageOutcome::Continue);
    }

    let missing_paths = file_diffs.iter().any(|diff| {
        diff.get("filePath")
            .and_then(Value::as_str)
            .map(|path| path.trim().is_empty())
            .unwrap_or(true)
    });
    if missing_paths {
        negotiation_messages.push(system_message(
            "Every entry in `propose_file_change.fileDiffs` must include an explicit non-empty `filePath`. Re-emit the tool call with one concrete project-relative path per file. Do not rely on inferred names from code snippets, property accesses, or stack traces.",
        ));
        *last_runtime_error = Some("file-change-missing-file-path".to_string());
        return Some(ActionStageOutcome::Continue);
    }

    None
}

#[allow(clippy::too_many_arguments)]
async fn dispatch_inline_mcp_tool(
    sink: &AgentEventSink,
    runtime: &mut AgentLoopRuntime,
    negotiation_messages: &mut Vec<AgentInputMessage>,
    pending_resolution: &mut Option<AgentPendingResolutionKind>,
    pending_tool_call: &mut Option<AgentPendingToolCall>,
    last_runtime_error: &mut Option<String>,
    pass_index: u32,
    tool_id: String,
    tool_name: String,
    tool_args: Value,
    tool_raw_args: String,
) -> Result<ActionStageOutcome, AgentHarnessError> {
    runtime.transition_to(PHASE_RUNNING);
    *pending_resolution = None;
    *pending_tool_call = Some(AgentPendingToolCall {
        id: tool_id.clone(),
        name: tool_name.clone(),
    });
    *last_runtime_error = None;
    sync_execution_state(
        sink,
        runtime,
        pass_index,
        pending_resolution.clone(),
        pending_tool_call.clone(),
        last_runtime_error.clone(),
    );

    let collected_tool = super::types::CollectedToolCall {
        id: tool_id.clone(),
        name: tool_name.clone(),
        args: tool_args.clone(),
        raw_args: tool_raw_args,
        google_thought_signature: None,
    };
    emit_internal_tool_call(sink, negotiation_messages, &collected_tool);

    let result = match mcp::call_openai_mcp_tool(&tool_name, tool_args).await {
        Ok(result) => result,
        Err(error) => json!({ "error": error }).to_string(),
    };

    sink.tool_result(tool_id.clone(), result.clone());
    negotiation_messages.push(tool_result_message(&tool_id, result));
    *pending_resolution = None;
    *pending_tool_call = None;
    *last_runtime_error = None;
    Ok(ActionStageOutcome::Continue)
}

#[allow(clippy::too_many_arguments)]
fn handle_internal_tool_completion(
    sink: &AgentEventSink,
    runtime: &mut AgentLoopRuntime,
    negotiation_messages: &mut Vec<AgentInputMessage>,
    pending_resolution: &mut Option<AgentPendingResolutionKind>,
    pending_tool_call: &mut Option<AgentPendingToolCall>,
    last_runtime_error: &mut Option<String>,
    pass_index: u32,
    tool_call: &super::types::CollectedToolCall,
    visible_text: String,
) -> Result<ActionStageOutcome, AgentHarnessError> {
    negotiation_messages.push(tool_result_message(
        &tool_call.id,
        summarize_internal_tool_result(tool_call),
    ));
    *pending_resolution = None;
    *pending_tool_call = None;
    *last_runtime_error = None;

    if tool_call.name == "suggest_follow_up" {
        negotiation_messages.push(system_message(
            "`suggest_follow_up` nu este permis în acest context. Oferă direct text vizibil sau alege o acțiune concretă.",
        ));
        return Ok(ActionStageOutcome::Continue);
    }

    let trimmed_visible_text = visible_text.trim();
    if trimmed_visible_text.is_empty() {
        return Ok(ActionStageOutcome::Continue);
    }

    negotiation_messages.push(AgentInputMessage {
        role: "assistant".to_string(),
        content: trimmed_visible_text.to_string(),
        tool_call_id: None,
        tool_calls: None,
    });

    if is_plan_progress_tool(&tool_call.name) {
        return Ok(ActionStageOutcome::Continue);
    }

    emit_final_answer(
        sink,
        runtime,
        pass_index,
        pending_resolution,
        pending_tool_call,
        last_runtime_error,
        trimmed_visible_text,
        false,
    )?;
    Ok(ActionStageOutcome::Completed(trimmed_visible_text.to_string()))
}

fn is_plan_progress_tool(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "propose_plan" | "update_plan" | "plan_execution"
    )
}

#[allow(clippy::too_many_arguments)]
fn transition_external_tool(
    runtime: &mut AgentLoopRuntime,
    pending_resolution: &mut Option<AgentPendingResolutionKind>,
    pending_tool_call: &mut Option<AgentPendingToolCall>,
    last_runtime_error: &mut Option<String>,
    pass_index: u32,
    sink: &AgentEventSink,
    tool_call_id: &str,
    tool_name: &str,
) -> Result<(), AgentHarnessError> {
    runtime.transition_to(PHASE_WAITING_FOR_TOOL);
    if runtime.tool_requires_approval(tool_name) {
        *pending_resolution = Some(AgentPendingResolutionKind::Approval);
    } else {
        *pending_resolution = Some(AgentPendingResolutionKind::ExternalToolResult);
    }

    *pending_tool_call = Some(AgentPendingToolCall {
        id: tool_call_id.to_string(),
        name: tool_name.to_string(),
    });
    *last_runtime_error = None;
    sync_execution_state(
        sink,
        runtime,
        pass_index,
        pending_resolution.clone(),
        pending_tool_call.clone(),
        last_runtime_error.clone(),
    );

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn handle_empty_or_direct_response(
    _context: &AgentHarnessContext,
    sink: &AgentEventSink,
    runtime: &mut AgentLoopRuntime,
    negotiation_messages: &mut Vec<AgentInputMessage>,
    pending_resolution: &mut Option<AgentPendingResolutionKind>,
    pending_tool_call: &mut Option<AgentPendingToolCall>,
    last_runtime_error: &mut Option<String>,
    pass_index: u32,
    visible_text: String,
) -> Result<ActionStageOutcome, AgentHarnessError> {
    if !visible_text.trim().is_empty() {
        emit_final_answer(
            sink,
            runtime,
            pass_index,
            pending_resolution,
            pending_tool_call,
            last_runtime_error,
            visible_text.trim(),
            false,
        )?;
        return Ok(ActionStageOutcome::Completed(
            visible_text.trim().to_string(),
        ));
    }

    let retry_message =
        "Modelul nu a produs niciun răspuns vizibil sau tool call util pentru această cerere. Re-evaluează cererea și alege exact o acțiune concretă sau un răspuns final direct.";
    negotiation_messages.push(system_message(retry_message));
    *last_runtime_error = Some("empty-response".to_string());
    Ok(ActionStageOutcome::Continue)
}

/// Executes read-only tools inline within the harness loop.
async fn dispatch_inline_read_only_tool(
    context: &AgentHarnessContext,
    tool_name: &str,
    tool_args: &Value,
) -> String {
    match tool_name {
        "read_workspace_file" => inline_read_workspace_file(context, tool_args).await,
        "explore_workspace" => inline_explore_workspace(context, tool_args).await,
        "lookup_web" => inline_lookup_web(tool_args).await,
        _ => format!("Unknown inline read-only tool: {tool_name}"),
    }
}

async fn inline_read_workspace_file(context: &AgentHarnessContext, tool_args: &Value) -> String {
    let path = match tool_args.get("path").and_then(Value::as_str) {
        Some(p) if !p.trim().is_empty() => p.trim(),
        _ => return "Error: `path` argument is required for read_workspace_file.".to_string(),
    };

    let cwd = context.cwd.as_deref().unwrap_or(".");
    let full_path = if path.starts_with('/') {
        PathBuf::from(path)
    } else {
        PathBuf::from(cwd).join(path)
    };

    match tokio::fs::read_to_string(&full_path).await {
        Ok(contents) => {
            let start_line =
                tool_args.get("startLine").and_then(Value::as_u64).unwrap_or(0) as usize;
            let end_line = tool_args.get("endLine").and_then(Value::as_u64).map(|v| v as usize);
            let max_chars = tool_args
                .get("maxChars")
                .and_then(Value::as_u64)
                .map(|v| v as usize)
                .unwrap_or(24000)
                .clamp(200, 24000);

            let mut result = contents;

            if start_line > 0 || end_line.is_some() {
                let lines: Vec<&str> = result.lines().collect();
                let start = start_line.saturating_sub(1).min(lines.len());
                let end = end_line.unwrap_or(lines.len()).min(lines.len());
                if start < end {
                    result = lines[start..end].join("\n");
                } else {
                    result = String::new();
                }
            }

            if result.len() > max_chars {
                let half = max_chars / 2;
                result = format!(
                    "{}\n... ({} more characters) ...\n{}",
                    &result[..half],
                    result.len() - max_chars,
                    &result[result.len().saturating_sub(half)..]
                );
            }

            format!("=== {} ===\n{}", full_path.display(), result)
        }
        Err(error) => format!("Error reading '{}': {}", path, error),
    }
}

async fn inline_explore_workspace(context: &AgentHarnessContext, tool_args: &Value) -> String {
    let mode = tool_args
        .get("mode")
        .and_then(Value::as_str)
        .unwrap_or("list");

    match mode {
        "list" => inline_explore_list(context, tool_args),
        "search" => inline_explore_search(context, tool_args).await,
        _ => {
            let path = tool_args
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or("current directory");
            format!(
                "explore_workspace mode `{mode}` requires frontend execution. \
                 Used `list` for {path}. Use `propose_terminal_command` with ls/find/grep \
                 for advanced inspection."
            )
        }
    }
}

fn inline_explore_list(context: &AgentHarnessContext, tool_args: &Value) -> String {
    let path_arg = tool_args.get("path").and_then(Value::as_str).unwrap_or("");
    let cwd = context.cwd.as_deref().unwrap_or(".");
    let dir_path = if path_arg.trim().is_empty() || path_arg.trim() == "." {
        PathBuf::from(cwd)
    } else if path_arg.starts_with('/') {
        PathBuf::from(path_arg)
    } else {
        PathBuf::from(cwd).join(path_arg)
    };

    match std::fs::read_dir(&dir_path) {
        Ok(entries) => {
            let mut files = Vec::new();
            let mut dirs = Vec::new();

            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.trim().is_empty() {
                    continue;
                }
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    dirs.push(format!("{name}/"));
                } else {
                    files.push(name);
                }
            }

            dirs.sort();
            files.sort();

            let mut lines = vec![format!("Contents of {}:", dir_path.display())];
            if dirs.is_empty() && files.is_empty() {
                lines.push("  (empty directory)".to_string());
            } else {
                for d in &dirs {
                    lines.push(format!("  📁 {d}"));
                }
                for f in &files {
                    lines.push(format!("  📄 {f}"));
                }
            }
            lines.join("\n")
        }
        Err(error) => format!("Error listing '{}': {}", dir_path.display(), error),
    }
}

async fn inline_explore_search(context: &AgentHarnessContext, tool_args: &Value) -> String {
    let query = tool_args.get("query").and_then(Value::as_str).unwrap_or("");
    let path_arg = tool_args.get("path").and_then(Value::as_str).unwrap_or("");
    let max_results = tool_args
        .get("maxResults")
        .and_then(Value::as_u64)
        .unwrap_or(20) as usize;
    let recursive = tool_args
        .get("recursive")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    if query.trim().is_empty() {
        return "Error: `query` is required for explore_workspace mode=search.".to_string();
    }

    let cwd = context.cwd.as_deref().unwrap_or(".");
    let search_dir = if path_arg.trim().is_empty() {
        PathBuf::from(cwd)
    } else if path_arg.starts_with('/') {
        PathBuf::from(path_arg)
    } else {
        PathBuf::from(cwd).join(path_arg)
    };

    let mut cmd = tokio::process::Command::new("rg");
    cmd.arg("-l").arg("--max-count").arg("1").arg("-i");
    if !recursive {
        cmd.arg("--max-depth").arg("1");
    }
    cmd.arg(query).arg(&search_dir);

    match cmd.output().await {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let paths: Vec<&str> = stdout
                .lines()
                .filter(|l| !l.trim().is_empty())
                .take(max_results)
                .collect();

            if paths.is_empty() {
                format!("No matches found for `{query}` in {}.", search_dir.display())
            } else {
                let mut lines = vec![format!(
                    "Local matches for `{query}` in {}:",
                    search_dir.display()
                )];
                for p in &paths {
                    lines.push(format!("  - {p}"));
                }
                if paths.len() >= max_results {
                    lines.push(format!("  ... (showing first {max_results} matches)"));
                }
                lines.join("\n")
            }
        }
        Ok(_) => {
            let mut cmd = tokio::process::Command::new("grep");
            cmd.arg("-rl").arg("-i").arg(query).arg(&search_dir);

            match cmd.output().await {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let paths: Vec<&str> = stdout
                        .lines()
                        .filter(|l| !l.trim().is_empty())
                        .take(max_results)
                        .collect();
                    if paths.is_empty() {
                        format!("No matches found for `{query}` in {}.", search_dir.display())
                    } else {
                        let mut lines = vec![format!(
                            "Local matches for `{query}` in {}:",
                            search_dir.display()
                        )];
                        for p in &paths {
                            lines.push(format!("  - {p}"));
                        }
                        lines.join("\n")
                    }
                }
                Err(_) => "Cannot search: neither `rg` nor `grep` is available on this system.".to_string(),
            }
        }
        Err(_) => "Cannot search: failed to execute rg/grep.".to_string(),
    }
}

async fn inline_lookup_web(tool_args: &Value) -> String {
    let query = match tool_args.get("query").and_then(Value::as_str) {
        Some(q) if !q.trim().is_empty() => q.trim(),
        _ => return "Error: `query` argument is required for lookup_web.".to_string(),
    };

    match web_search::web_search(web_search::WebSearchRequest {
        query: query.to_string(),
        max_results: Some(5),
    })
    .await
    {
        Ok(response) => {
            let mut lines = vec![format!("Web search results for: {}", response.query)];
            for (i, result) in response.results.iter().enumerate() {
                lines.push(format!("\n{}. {}", i + 1, result.title));
                lines.push(format!("   URL: {}", result.url));
                if let Some(snippet) = &result.snippet {
                    lines.push(format!("   {snippet}"));
                }
            }
            lines.join("\n")
        }
        Err(error) => format!("Web search error: {error}"),
    }
}
