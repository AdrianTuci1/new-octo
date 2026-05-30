use serde_json::{json, Value};

use crate::ai::agent::harness::{AgentEventSink, AgentHarnessContext, AgentHarnessError};
use crate::ai::agent::runtime::{
    AgentLoopRuntime, EVENT_APPROVE_ACTION, EVENT_AWAIT_USER_APPROVAL, EVENT_CAPTURE_TOOL_RESULT,
    EVENT_DISPATCH_TOOL, EVENT_PREPARE_CONTEXT, EVENT_REQUEST_ANOTHER_TOOL,
    STAGE_AWAITING_APPROVAL, STAGE_EXECUTING, STAGE_VERIFYING,
};
use crate::ai::agent::types::{
    AgentExecutionState, AgentInputMessage, AgentPendingResolutionKind, AgentPendingToolCall,
};

use super::heuristics::is_continuation_prompt;
pub(super) fn should_use_synthetic_thinking(model_id: &str) -> bool {
    model_id.to_lowercase().contains("gemma")
}

pub(super) fn apply_low_reasoning_effort(
    request: &mut Value,
    config: &super::super::config::OpenAiCompatibleConfig,
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

pub(super) fn initial_runtime_for_context(
    context: &AgentHarnessContext,
) -> Result<AgentLoopRuntime, AgentHarnessError> {
    if let Some(resume_state) = &context.resume_execution_state {
        let mut runtime = AgentLoopRuntime::resume(&resume_state.current_stage_id)
            .map_err(|error| AgentHarnessError::new(error.message))?;

        if should_resume_in_verifying_stage(context) {
            normalize_runtime_after_external_result(&mut runtime)?;
        }

        return Ok(runtime);
    }

    let mut runtime = AgentLoopRuntime::new();
    apply_runtime_event(&mut runtime, EVENT_PREPARE_CONTEXT)?;
    Ok(runtime)
}

fn normalize_runtime_after_external_result(
    runtime: &mut AgentLoopRuntime,
) -> Result<(), AgentHarnessError> {
    match runtime.current_stage_id() {
        STAGE_AWAITING_APPROVAL => {
            apply_runtime_event(runtime, EVENT_APPROVE_ACTION)?;
            apply_runtime_event(runtime, EVENT_CAPTURE_TOOL_RESULT)?;
        }
        STAGE_EXECUTING => {
            apply_runtime_event(runtime, EVENT_CAPTURE_TOOL_RESULT)?;
        }
        STAGE_VERIFYING => {}
        _ => {
            *runtime = AgentLoopRuntime::resume(STAGE_VERIFYING)
                .map_err(|error| AgentHarnessError::new(error.message))?;
        }
    }

    Ok(())
}

pub(super) fn should_resume_in_verifying_stage(context: &AgentHarnessContext) -> bool {
    if let Some(resume_state) = &context.resume_execution_state {
        if resume_state.pending_resolution.is_some()
            || matches!(
                resume_state.current_stage_id.as_str(),
                STAGE_AWAITING_APPROVAL | STAGE_EXECUTING | STAGE_VERIFYING
            )
        {
            return context
                .messages
                .iter()
                .rev()
                .find(|message| is_meaningful_runtime_message(message))
                .map(|message| message.role == "tool")
                .unwrap_or(false);
        }

        return false;
    }

    if is_continuation_prompt(&context.prompt) || context.prompt.trim().is_empty() {
        return context
            .messages
            .iter()
            .rev()
            .find(|message| is_meaningful_runtime_message(message))
            .map(|message| message.role == "tool")
            .unwrap_or(false);
    }

    false
}

fn is_meaningful_runtime_message(message: &AgentInputMessage) -> bool {
    message.role != "system"
        && (message.role == "tool"
            || !message.content.trim().is_empty()
            || message.tool_calls.is_some())
}

pub(super) fn apply_runtime_event(
    runtime: &mut AgentLoopRuntime,
    event_id: &str,
) -> Result<(), AgentHarnessError> {
    runtime
        .apply_event(event_id)
        .map_err(|error| AgentHarnessError::new(error.message))
}

#[allow(dead_code)]
pub(super) fn move_runtime_to_approval_wait(
    runtime: &mut AgentLoopRuntime,
) -> Result<(), AgentHarnessError> {
    if runtime.current_stage_id() == STAGE_VERIFYING {
        apply_runtime_event(runtime, EVENT_REQUEST_ANOTHER_TOOL)?;
    }

    apply_runtime_event(runtime, EVENT_AWAIT_USER_APPROVAL)
}

#[allow(dead_code)]
pub(super) fn move_runtime_to_tool_dispatch(
    runtime: &mut AgentLoopRuntime,
) -> Result<(), AgentHarnessError> {
    if runtime.current_stage_id() == STAGE_VERIFYING {
        apply_runtime_event(runtime, EVENT_REQUEST_ANOTHER_TOOL)?;
    }

    if runtime.current_stage_id() == STAGE_EXECUTING {
        return Ok(());
    }

    apply_runtime_event(runtime, EVENT_DISPATCH_TOOL)
}

#[allow(dead_code)]
pub(super) fn move_runtime_to_tool_selection_retry(
    runtime: &mut AgentLoopRuntime,
) -> Result<(), AgentHarnessError> {
    if runtime.current_stage_id() == STAGE_VERIFYING {
        apply_runtime_event(runtime, EVENT_REQUEST_ANOTHER_TOOL)?;
    }

    Ok(())
}

fn build_execution_state(
    runtime: &AgentLoopRuntime,
    negotiation_attempt: u32,
    pending_resolution: Option<AgentPendingResolutionKind>,
    pending_tool_call: Option<AgentPendingToolCall>,
    last_error: Option<String>,
) -> AgentExecutionState {
    AgentExecutionState {
        current_stage_id: runtime.current_stage_id().to_string(),
        negotiation_attempt,
        pending_resolution,
        pending_tool_call,
        last_error,
    }
}

pub(super) fn sync_execution_state(
    sink: &AgentEventSink,
    runtime: &AgentLoopRuntime,
    negotiation_attempt: u32,
    pending_resolution: Option<AgentPendingResolutionKind>,
    pending_tool_call: Option<AgentPendingToolCall>,
    last_error: Option<String>,
) {
    sink.set_execution_state(build_execution_state(
        runtime,
        negotiation_attempt,
        pending_resolution,
        pending_tool_call,
        last_error,
    ));
}
