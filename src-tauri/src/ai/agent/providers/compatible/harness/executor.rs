use crate::ai::agent::harness::{
    AgentCancellation, AgentEventSink, AgentHarnessContext, AgentHarnessError, AgentHarnessOutcome,
};
use crate::ai::agent::runtime::{
    EVENT_CONTINUE_TO_PLANNING, EVENT_DECLINE_PLAN, EVENT_PLAN_TOOL_FINISHED,
    EVENT_PREPARE_CONTEXT, EVENT_SKIP_PLANNING, STAGE_AWAITING_APPROVAL, STAGE_EXECUTING,
    STAGE_PLANNING, STAGE_PREPARING, STAGE_REASONING, STAGE_VERIFYING,
};
use crate::ai::agent::types::AgentRunStatus;

use super::super::config::OpenAiCompatibleConfig;
use super::actions::{emit_final_answer, handle_action_stage_response};
use super::control::{
    parse_stage_control, planning_stage_instruction, tool_selection_stage_instructions,
    verifying_stage_instruction, MAX_STAGE_PASSES,
};
use super::heuristics::prompt_supports_plan;
use super::messages::{
    emit_internal_tool_call, summarize_internal_tool_result, system_message, tool_result_message,
};
use super::outcomes::{cancelled_outcome, done_outcome, waiting_outcome};
use super::provider::run_stage_model_pass;
use super::resume::{apply_runtime_event, initial_runtime_for_context, sync_execution_state};
use super::types::{ActionStageOutcome, StageControlDecision, StagePassOptions};

pub(super) async fn stream_chat_completion(
    config: OpenAiCompatibleConfig,
    context: AgentHarnessContext,
    sink: AgentEventSink,
    cancellation: AgentCancellation,
) -> Result<AgentHarnessOutcome, AgentHarnessError> {
    let mut negotiation_messages = context.messages.clone();
    let mut runtime = initial_runtime_for_context(&context)?;
    let mut pass_index = context
        .resume_execution_state
        .as_ref()
        .map(|state| state.negotiation_attempt)
        .unwrap_or(0);
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
                "Rulez stage-ul {} ({}/{})",
                runtime.current_stage().display_name,
                pass_index + 1,
                MAX_STAGE_PASSES
            )),
        );

        match runtime.current_stage_id() {
            STAGE_PREPARING => {
                apply_runtime_event(&mut runtime, EVENT_PREPARE_CONTEXT)?;
            }
            STAGE_REASONING => {
                if prompt_supports_plan(&context.prompt) {
                    apply_runtime_event(&mut runtime, EVENT_CONTINUE_TO_PLANNING)?;
                } else {
                    apply_runtime_event(&mut runtime, EVENT_SKIP_PLANNING)?;
                }
            }
            STAGE_PLANNING => {
                let response = run_stage_model_pass(
                    &config,
                    &context,
                    &sink,
                    &cancellation,
                    &runtime,
                    &negotiation_messages,
                    StagePassOptions {
                        emit_visible_tokens: false,
                        emit_reasoning_tokens: false,
                    },
                    vec![planning_stage_instruction()],
                )
                .await?;
                latest_usage = response.usage.clone().or(latest_usage);

                if let Some(tool_call) = response.tool_call {
                    if !matches!(
                        tool_call.name.as_str(),
                        "propose_plan" | "update_plan" | "plan_execution"
                    ) {
                        negotiation_messages.push(system_message(
                            "Stage-ul `planning` acceptă doar `propose_plan`, `update_plan` sau `plan_execution`. Reia pasul corect.",
                        ));
                        pass_index += 1;
                        continue;
                    }

                    emit_internal_tool_call(&sink, &mut negotiation_messages, &tool_call);
                    negotiation_messages.push(tool_result_message(
                        &tool_call.id,
                        summarize_internal_tool_result(&tool_call),
                    ));
                    apply_runtime_event(&mut runtime, EVENT_PLAN_TOOL_FINISHED)?;
                    pending_resolution = None;
                    pending_tool_call = None;
                    last_runtime_error = None;
                } else {
                    match parse_stage_control(&response.visible_text) {
                        Some(StageControlDecision::DeclinePlan) => {
                            apply_runtime_event(&mut runtime, EVENT_DECLINE_PLAN)?;
                        }
                        Some(StageControlDecision::EmitFinalAnswer(answer)) => {
                            emit_final_answer(
                                &sink,
                                &mut runtime,
                                pass_index,
                                &mut pending_resolution,
                                &mut pending_tool_call,
                                &mut last_runtime_error,
                                &answer,
                                true,
                            )?;
                            return Ok(done_outcome(&context.prompt, &answer, latest_usage));
                        }
                        _ => {
                            apply_runtime_event(&mut runtime, EVENT_DECLINE_PLAN)?;
                        }
                    }
                }
            }
            "tool-selection" => {
                let response = run_stage_model_pass(
                    &config,
                    &context,
                    &sink,
                    &cancellation,
                    &runtime,
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
                    false,
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
            }
            STAGE_AWAITING_APPROVAL => {
                sync_execution_state(
                    &sink,
                    &runtime,
                    pass_index,
                    pending_resolution.clone(),
                    pending_tool_call.clone(),
                    last_runtime_error.clone(),
                );
                sink.status(
                    AgentRunStatus::WaitingForTool,
                    Some("Aștept aprobarea utilizatorului pentru acțiunea propusă.".to_string()),
                );
                return Ok(waiting_outcome(&context.prompt, "", latest_usage));
            }
            STAGE_EXECUTING => {
                sync_execution_state(
                    &sink,
                    &runtime,
                    pass_index,
                    pending_resolution.clone(),
                    pending_tool_call.clone(),
                    last_runtime_error.clone(),
                );
                sink.status(
                    AgentRunStatus::WaitingForTool,
                    Some("Aștept rezultatul tool-ului extern.".to_string()),
                );
                return Ok(waiting_outcome(&context.prompt, "", latest_usage));
            }
            STAGE_VERIFYING => {
                let response = run_stage_model_pass(
                    &config,
                    &context,
                    &sink,
                    &cancellation,
                    &runtime,
                    &negotiation_messages,
                    StagePassOptions {
                        emit_visible_tokens: true,
                        emit_reasoning_tokens: true,
                    },
                    vec![verifying_stage_instruction()],
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
                    true,
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
            }
            "completed" => {
                return Ok(done_outcome(&context.prompt, "", latest_usage));
            }
            "failed" => {
                return Err(AgentHarnessError::new(
                    last_runtime_error
                        .clone()
                        .unwrap_or_else(|| "Run-ul agentului a eșuat.".to_string()),
                ));
            }
            "cancelled" => {
                return Ok(cancelled_outcome(&context.prompt, ""));
            }
            stage_id => {
                return Err(AgentHarnessError::new(format!(
                    "Stage necunoscut în harness: {stage_id}"
                )));
            }
        }

        pass_index += 1;
    }

    let fallback = "Nu pot continua automat după mai multe treceri prin stage-uri. Mai am nevoie de o formulare mai precisă sau de o constrângere scurtă despre pasul următor.";
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
