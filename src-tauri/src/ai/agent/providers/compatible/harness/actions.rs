use serde_json::{json, Value};

use crate::ai::agent::harness::{AgentEventSink, AgentHarnessContext, AgentHarnessError};
use crate::ai::agent::runtime::{
    AgentLoopRuntime, EVENT_AWAIT_USER_APPROVAL, EVENT_CAPTURE_TOOL_RESULT, EVENT_DISPATCH_TOOL,
    EVENT_EMIT_FINAL_ANSWER, EVENT_REQUEST_ANOTHER_TOOL, STAGE_TOOL_SELECTION,
};
use crate::ai::agent::types::{
    AgentInputMessage, AgentPendingResolutionKind, AgentPendingToolCall,
};
use crate::ai::mcp;

use super::super::config::OpenAiCompatibleConfig;
use super::super::guardian::run_guardian_check;
use super::heuristics::{
    command_is_low_risk_terminal_inspection, context_supports_terminal_command,
    guardian_intent_context, prompt_requests_file_change, response_looks_like_inline_code,
};
use super::messages::{
    emit_internal_tool_call, rejected_tool_result_message, summarize_internal_tool_result,
    system_message, tool_result_message,
};
use super::resume::{apply_runtime_event, sync_execution_state};
use super::types::{ActionStageOutcome, StageModelResponse};
use super::context;

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
    local_terminal_check_requested: bool,
    response: StageModelResponse,
    from_verifying: bool,
) -> Result<ActionStageOutcome, AgentHarnessError> {
    let visible_text = response.visible_text;

    if let Some(tool_call) = response.tool_call {
        if !runtime.allows_tool(&tool_call.name) {
            emit_internal_tool_call(sink, negotiation_messages, &tool_call);
            negotiation_messages.push(rejected_tool_result_message(
                &tool_call.id,
                format!(
                    "Tool-ul `{}` nu este permis în stage-ul curent `{}`. Reia pasul și alege o alternativă validă.",
                    tool_call.name,
                    runtime.current_stage_id()
                ),
            ));
            negotiation_messages.push(system_message(format!(
                "Tool-ul `{}` nu este permis în stage-ul curent `{}`. Reia pasul și alege o alternativă validă.",
                tool_call.name,
                runtime.current_stage_id()
            )));
            *last_runtime_error = Some(format!(
                "tool-not-allowed:{}:{}",
                runtime.current_stage_id(),
                tool_call.name
            ));
            return Ok(ActionStageOutcome::Continue);
        }

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

        if tool_call.name.starts_with("mcp__") {
            return dispatch_inline_mcp_tool(
                sink,
                runtime,
                negotiation_messages,
                pending_resolution,
                pending_tool_call,
                last_runtime_error,
                pass_index,
                from_verifying,
                tool_call.id,
                tool_call.name,
                tool_call.args,
                tool_call.raw_args,
            )
            .await;
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
                from_verifying,
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
            from_verifying,
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
        local_terminal_check_requested,
        visible_text,
        from_verifying,
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
) -> Result<(), AgentHarnessError> {
    if !answer.is_empty() {
        sink.token(answer);
    }
    apply_runtime_event(runtime, EVENT_EMIT_FINAL_ANSWER)?;
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

    let Some(command) = tool_args.get("command").and_then(Value::as_str) else {
        return Ok(None);
    };

    if !context_supports_terminal_command(context) {
        negotiation_messages.push(system_message(
            "Cererea curentă nu cere o comandă de terminal. Reia pasul și răspunde direct sau alege alt tool local potrivit.",
        ));
        *last_runtime_error = Some("terminal-command-out-of-context".to_string());
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

#[allow(clippy::too_many_arguments)]
async fn dispatch_inline_mcp_tool(
    sink: &AgentEventSink,
    runtime: &mut AgentLoopRuntime,
    negotiation_messages: &mut Vec<AgentInputMessage>,
    pending_resolution: &mut Option<AgentPendingResolutionKind>,
    pending_tool_call: &mut Option<AgentPendingToolCall>,
    last_runtime_error: &mut Option<String>,
    pass_index: u32,
    from_verifying: bool,
    tool_id: String,
    tool_name: String,
    tool_args: Value,
    tool_raw_args: String,
) -> Result<ActionStageOutcome, AgentHarnessError> {
    transition_to_dispatch(runtime, from_verifying)?;
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
    apply_runtime_event(runtime, EVENT_CAPTURE_TOOL_RESULT)?;
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
    from_verifying: bool,
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

    if visible_text.trim().is_empty() && tool_call.name == "suggest_follow_up" {
        negotiation_messages.push(system_message(
            "`suggest_follow_up` este metadată. Reia stage-ul și oferă și un răspuns vizibil utilizatorului.",
        ));
        return Ok(ActionStageOutcome::Continue);
    }

    if from_verifying && visible_text.trim().is_empty() {
        return Ok(ActionStageOutcome::Continue);
    }

    if visible_text.trim().is_empty() {
        return Ok(ActionStageOutcome::Continue);
    }

    emit_final_answer(
        sink,
        runtime,
        pass_index,
        pending_resolution,
        pending_tool_call,
        last_runtime_error,
        visible_text.trim(),
    )?;
    Ok(ActionStageOutcome::Completed(visible_text.trim().to_string()))
}

#[allow(clippy::too_many_arguments)]
fn transition_external_tool(
    runtime: &mut AgentLoopRuntime,
    pending_resolution: &mut Option<AgentPendingResolutionKind>,
    pending_tool_call: &mut Option<AgentPendingToolCall>,
    last_runtime_error: &mut Option<String>,
    pass_index: u32,
    sink: &AgentEventSink,
    from_verifying: bool,
    tool_call_id: &str,
    tool_name: &str,
) -> Result<(), AgentHarnessError> {
    if runtime.tool_requires_approval(tool_name) {
        transition_to_approval_wait(runtime, from_verifying)?;
        *pending_resolution = Some(AgentPendingResolutionKind::Approval);
    } else {
        transition_to_dispatch(runtime, from_verifying)?;
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
    context: &AgentHarnessContext,
    sink: &AgentEventSink,
    runtime: &mut AgentLoopRuntime,
    negotiation_messages: &mut Vec<AgentInputMessage>,
    pending_resolution: &mut Option<AgentPendingResolutionKind>,
    pending_tool_call: &mut Option<AgentPendingToolCall>,
    last_runtime_error: &mut Option<String>,
    pass_index: u32,
    local_terminal_check_requested: bool,
    visible_text: String,
    from_verifying: bool,
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
        )?;
        return Ok(ActionStageOutcome::Completed(visible_text.trim().to_string()));
    }

    if local_terminal_check_requested && runtime.current_stage_id() == STAGE_TOOL_SELECTION {
        negotiation_messages.push(system_message(format!(
            "Cererea `{}` cere o verificare locală. Reia acum și emite obligatoriu `propose_terminal_command` cu o singură comandă read-only care poate răspunde local.",
            context.prompt
        )));
        *last_runtime_error = Some("llm-missed-local-terminal-check".to_string());
        return Ok(ActionStageOutcome::Continue);
    }

    if prompt_requests_file_change(&context.prompt)
        && response_looks_like_inline_code(&visible_text)
        && runtime.current_stage_id() == STAGE_TOOL_SELECTION
    {
        negotiation_messages.push(system_message(
            "Cererea cere modificare de fișier. Reia folosind `propose_file_change`, nu cod vizibil direct în chat.",
        ));
        *last_runtime_error = Some("inline-code-instead-of-file-change".to_string());
        return Ok(ActionStageOutcome::Continue);
    }

    let fallback = if from_verifying {
        "Modelul nu a produs o verificare finală utilă după rezultatul tool-ului. Încearcă din nou sau oferă o instrucțiune puțin mai precisă."
    } else {
        "Modelul nu a produs niciun răspuns vizibil sau tool call util pentru această cerere. Încearcă din nou sau reformulează cererea mai concret."
    };
    emit_final_answer(
        sink,
        runtime,
        pass_index,
        pending_resolution,
        pending_tool_call,
        last_runtime_error,
        fallback,
    )?;
    Ok(ActionStageOutcome::Completed(fallback.to_string()))
}

fn transition_to_approval_wait(
    runtime: &mut AgentLoopRuntime,
    from_verifying: bool,
) -> Result<(), AgentHarnessError> {
    if from_verifying {
        apply_runtime_event(runtime, EVENT_REQUEST_ANOTHER_TOOL)?;
    }
    apply_runtime_event(runtime, EVENT_AWAIT_USER_APPROVAL)
}

fn transition_to_dispatch(
    runtime: &mut AgentLoopRuntime,
    from_verifying: bool,
) -> Result<(), AgentHarnessError> {
    if from_verifying {
        apply_runtime_event(runtime, EVENT_REQUEST_ANOTHER_TOOL)?;
    }
    apply_runtime_event(runtime, EVENT_DISPATCH_TOOL)
}
