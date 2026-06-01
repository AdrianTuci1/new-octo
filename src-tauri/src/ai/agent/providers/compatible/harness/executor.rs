use crate::ai::agent::harness::{
    AgentCancellation, AgentEventSink, AgentHarnessContext, AgentHarnessError, AgentHarnessOutcome,
};
use crate::ai::agent::types::AgentInputMessage;

use super::super::config::OpenAiCompatibleConfig;
use super::actions::{emit_final_answer, handle_action_stage_response};
use super::control::{
    tool_selection_stage_instructions, MAX_STAGE_PASSES,
};
use super::outcomes::{cancelled_outcome, done_outcome, waiting_outcome};
use super::provider::run_stage_model_pass;
use super::resume::{initial_runtime_for_context, sync_execution_state};
use super::types::{ActionStageOutcome, StagePassOptions};

pub(super) async fn stream_chat_completion(
    config: OpenAiCompatibleConfig,
    context: AgentHarnessContext,
    sink: AgentEventSink,
    cancellation: AgentCancellation,
) -> Result<AgentHarnessOutcome, AgentHarnessError> {
    let mut negotiation_messages = context.messages.clone();
    if !context.prompt.trim().is_empty() {
        negotiation_messages.push(AgentInputMessage {
            role: "user".to_string(),
            content: context.prompt.clone(),
            tool_call_id: None,
            tool_calls: None,
        });
    }
    let mut runtime = initial_runtime_for_context(&context)?;
    // Always start at 0 so every continuation gets a full budget of passes.
    // The old approach accumulated negotiation_attempt across continuations,
    // causing multi-tool tasks to hit MAX_STAGE_PASSES prematurely.
    let mut pass_index: u32 = 0;
    let mut pending_resolution = context
        .resume_execution_state
        .as_ref()
        .and_then(|state| state.pending_resolution.clone());
    let mut pending_tool_call = context
        .resume_execution_state
        .as_ref()
        .and_then(|state| state.pending_tool_call.clone());
    let mut last_runtime_error = context
        .resume_execution_state
        .as_ref()
        .and_then(|state| state.last_error.clone());
    let mut latest_usage = None;

    // If resuming after an approved tool call whose result is already in the
    // message history, clear the stale pending state so the frontend does not
    // show the approval dialog again.
    if pending_resolution.is_some() {
        if let Some(ref pending_tool) = pending_tool_call {
            let tool_already_completed = context
                .messages
                .iter()
                .any(|msg| msg.tool_call_id.as_deref() == Some(&pending_tool.id));
            if tool_already_completed {
                pending_resolution = None;
                pending_tool_call = None;
            }
        }
    }

    sync_execution_state(
        &sink,
        &runtime,
        pass_index,
        pending_resolution.clone(),
        pending_tool_call.clone(),
        last_runtime_error.clone(),
    );

    while pass_index < MAX_STAGE_PASSES {
        if cancellation.is_cancelled() {
            return Ok(cancelled_outcome(&context.prompt, ""));
        }

        sync_execution_state(
            &sink,
            &runtime,
            pass_index,
            pending_resolution.clone(),
            pending_tool_call.clone(),
            last_runtime_error.clone(),
        );
        sink.status(
            runtime.run_status(),
            Some(format!(
                "Pass {}/{}",
                pass_index + 1,
                MAX_STAGE_PASSES
            )),
        );

        let response = run_stage_model_pass(
            &config,
            &context,
            &sink,
            &cancellation,
            &negotiation_messages,
            StagePassOptions {
                emit_visible_tokens: true,
                emit_reasoning_tokens: true,
            },
            tool_selection_stage_instructions(pass_index),
        )
        .await?;
        latest_usage = response.usage.clone().or(latest_usage);

        match handle_action_stage_response(
            &config,
            &context,
            &sink,
            &mut runtime,
            &mut negotiation_messages,
            &mut pending_resolution,
            &mut pending_tool_call,
            &mut last_runtime_error,
            pass_index,
            response,
        )
        .await?
        {
            ActionStageOutcome::Continue => {}
            ActionStageOutcome::Waiting(streamed) => {
                return Ok(waiting_outcome(&context.prompt, &streamed, latest_usage));
            }
            ActionStageOutcome::Completed(streamed) => {
                return Ok(done_outcome(&context.prompt, &streamed, latest_usage));
            }
        }

        pass_index += 1;
    }

    let fallback = "Nu pot continua automat după mai multe treceri. Mai am nevoie de o formulare mai precisă sau de o constrângere scurtă despre pasul următor.";
    emit_final_answer(
        &sink,
        &mut runtime,
        pass_index,
        &mut pending_resolution,
        &mut pending_tool_call,
        &mut last_runtime_error,
        fallback,
        true,
    )?;
    Ok(done_outcome(&context.prompt, fallback, latest_usage))
}
