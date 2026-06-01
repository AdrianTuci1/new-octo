use serde_json::{json, Value};

use crate::ai::agent::harness::{AgentEventSink, AgentHarnessContext, AgentHarnessError};
use crate::ai::agent::runtime::{
    AgentLoopRuntime, PHASE_CANCELLED, PHASE_COMPLETED, PHASE_FAILED,
    PHASE_RUNNING, PHASE_WAITING_FOR_TOOL,
};
use crate::ai::agent::types::{
    AgentExecutionState, AgentPendingResolutionKind, AgentPendingToolCall,
};

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

/// Maps old stage IDs to new phase IDs for continuity compatibility.
fn determine_resume_phase(stage_id: &str) -> &'static str {
    match stage_id {
        "awaiting-approval" | "executing" | "verifying" => PHASE_WAITING_FOR_TOOL,
        "completed" => PHASE_COMPLETED,
        "failed" => PHASE_FAILED,
        "cancelled" => PHASE_CANCELLED,
        _ => PHASE_RUNNING,
    }
}

pub(super) fn initial_runtime_for_context(
    context: &AgentHarnessContext,
) -> Result<AgentLoopRuntime, AgentHarnessError> {
    if let Some(resume_state) = &context.resume_execution_state {
        let phase = determine_resume_phase(&resume_state.current_stage_id);
        let runtime = AgentLoopRuntime::resume(phase)
            .map_err(|error| AgentHarnessError::new(error))?;
        return Ok(runtime);
    }

    let mut runtime = AgentLoopRuntime::new();
    runtime.transition_to(PHASE_RUNNING);
    Ok(runtime)
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
