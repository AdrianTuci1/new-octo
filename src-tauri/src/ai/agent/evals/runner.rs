use std::sync::{atomic::AtomicBool, Arc, Mutex};

use chrono::Utc;
use serde_json::{json, Value};

use crate::ai::agent::harness::{
    AgentCancellation, AgentEventSink, AgentHarness, AgentHarnessContext, TestAgentEvent,
};
use crate::ai::agent::providers::{OpenAiCompatibleConfig, OpenAiCompatibleHarness};
use crate::ai::agent::types::{
    AgentExecutionState, AgentInputMessage, AgentPendingToolCall, AgentRunSnapshot, AgentRunStatus,
    AgentToolCall,
};
use crate::ai::agent_management::AgentHarnessManager;

use super::assertions::assert_eval_result;
use super::judge::{maybe_judge_run, JudgeVerdict};
use super::scenarios::EvalScenario;
use super::simulators::EvalToolSimulator;
use super::user_simulator::next_user_turn;
use super::workspace::EvalWorkspace;

#[derive(Debug, Clone)]
pub(super) struct EvalRunResult {
    pub(super) final_answer: String,
    pub(super) tool_calls: Vec<AgentToolCall>,
    pub(super) tool_results: Vec<String>,
    pub(super) changed_files: Vec<String>,
    pub(super) status_messages: Vec<String>,
    pub(super) transcript_messages: Vec<AgentInputMessage>,
    pub(super) simulated_user_summaries: Vec<String>,
    pub(super) judge_verdict: Option<JudgeVerdict>,
}

pub(super) async fn run_live_eval(
    config: OpenAiCompatibleConfig,
    scenario: &'static EvalScenario,
) -> Result<EvalRunResult, String> {
    let workspace = EvalWorkspace::create(scenario)?;
    let harness = OpenAiCompatibleHarness::new(config.clone());
    let manager = AgentHarnessManager::default();
    let conversation_id = format!("eval-conv-{}", scenario.id);
    let mut transcript_messages = Vec::new();
    let mut current_user_prompt = scenario.prompt.to_string();
    let mut all_tool_calls = Vec::new();
    let mut all_tool_results = Vec::new();
    let mut status_messages = Vec::new();
    let mut final_answer = String::new();
    let mut simulated_user_summaries = Vec::new();
    let mut simulator = EvalToolSimulator::default();
    let mut goal_achieved = false;

    for user_turn_index in 0..scenario.max_user_turns {
        final_answer = run_single_user_turn(
            &config,
            scenario,
            &harness,
            &manager,
            &conversation_id,
            &workspace,
            &mut simulator,
            &mut transcript_messages,
            &current_user_prompt,
            user_turn_index,
            &mut all_tool_calls,
            &mut all_tool_results,
            &mut status_messages,
        )
        .await?;

        let simulated_user =
            next_user_turn(&config, scenario, &transcript_messages, &final_answer).await?;
        simulated_user_summaries.push(simulated_user.summary.clone());
        if simulated_user.goal_achieved {
            goal_achieved = true;
            break;
        }

        current_user_prompt = simulated_user
            .next_user_message
            .unwrap_or_default()
            .trim()
            .to_string();
        if current_user_prompt.is_empty() {
            return Err(format!(
                "scenario '{}' did not reach the goal and the simulated user produced an empty follow-up on turn {}",
                scenario.id, user_turn_index
            ));
        }
    }

    if final_answer.trim().is_empty() {
        return Err(format!(
            "scenario '{}' ended without a final visible answer after {} user turns",
            scenario.id, scenario.max_user_turns
        ));
    }
    if !goal_achieved {
        return Err(format!(
            "scenario '{}' did not reach its goal within {} user turns",
            scenario.id, scenario.max_user_turns
        ));
    }

    let mut result = EvalRunResult {
        final_answer: final_answer.trim().to_string(),
        tool_calls: all_tool_calls,
        tool_results: all_tool_results,
        changed_files: simulator
            .changed_files
            .into_iter()
            .filter(|path| workspace.changed_file_exists(path))
            .collect(),
        status_messages,
        transcript_messages,
        simulated_user_summaries,
        judge_verdict: None,
    };
    assert_eval_result(scenario, &result)?;

    if let Some(verdict) = maybe_judge_run(&config, scenario, &result).await? {
        if !verdict.pass {
            return Err(format!(
                "LLM judge rejected scenario '{}': {}",
                scenario.id, verdict.summary
            ));
        }
        result.judge_verdict = Some(verdict);
    }

    Ok(result)
}

#[allow(clippy::too_many_arguments)]
async fn run_single_user_turn(
    config: &OpenAiCompatibleConfig,
    scenario: &EvalScenario,
    harness: &OpenAiCompatibleHarness,
    manager: &AgentHarnessManager,
    conversation_id: &str,
    workspace: &EvalWorkspace,
    simulator: &mut EvalToolSimulator,
    transcript_messages: &mut Vec<AgentInputMessage>,
    user_prompt: &str,
    user_turn_index: usize,
    all_tool_calls: &mut Vec<AgentToolCall>,
    all_tool_results: &mut Vec<String>,
    status_messages: &mut Vec<String>,
) -> Result<String, String> {
    let user_message = AgentInputMessage {
        role: "user".to_string(),
        content: user_prompt.to_string(),
        tool_call_id: None,
        tool_calls: None,
    };
    let mut working_messages = transcript_messages.clone();
    let mut resume_execution_state: Option<AgentExecutionState> = None;
    let mut user_message_recorded = false;

    for harness_turn_index in 0..scenario.max_harness_turns_per_user {
        let run_id = format!(
            "eval-run-{}-{}-{}",
            scenario.id, user_turn_index, harness_turn_index
        );
        let assistant_message_id = format!(
            "eval-assistant-{}-{}-{}",
            scenario.id, user_turn_index, harness_turn_index
        );
        let prompt = if harness_turn_index == 0 {
            user_prompt.to_string()
        } else {
            String::new()
        };
        let context = AgentHarnessContext {
            run_id: run_id.clone(),
            conversation_id: conversation_id.to_string(),
            assistant_message_id: assistant_message_id.clone(),
            prompt: prompt.clone(),
            surface: Some("agent".to_string()),
            messages: working_messages.clone(),
            terminal_blocks: vec![],
            cwd: Some(workspace.root().to_string_lossy().to_string()),
            target_os: std::env::consts::OS.to_string(),
            target_arch: std::env::consts::ARCH.to_string(),
            model_id: config.model_id.clone(),
            terminal_model_id: None,
            resume_execution_state: resume_execution_state.clone(),
        };
        let initial_state = resume_execution_state
            .clone()
            .unwrap_or_else(|| AgentExecutionState::new("preparing"));

        manager.insert(
            AgentRunSnapshot {
                run_id: run_id.clone(),
                conversation_id: conversation_id.to_string(),
                assistant_message_id: assistant_message_id.clone(),
                prompt: if prompt.is_empty() {
                    "continue".to_string()
                } else {
                    prompt.clone()
                },
                status: AgentRunStatus::Queued,
                status_message: Some("Queued eval run.".to_string()),
                model_id: config.model_id.clone(),
                cwd: Some(workspace.root().to_string_lossy().to_string()),
                error: None,
                execution_state: initial_state,
                started_at: Utc::now(),
                finished_at: None,
            },
            Arc::new(AtomicBool::new(false)),
        )?;

        let (sink, events) = AgentEventSink::for_tests(manager.clone(), &context);
        let outcome = harness
            .run_async(
                context,
                sink,
                AgentCancellation::new(Arc::new(AtomicBool::new(false))),
            )
            .await
            .map_err(|error| error.message)?;
        let events = snapshot_events(&events)?;
        let snapshot = manager.get(&run_id)?;
        let run_visible_text = extract_tokens(&events);

        collect_status_messages(&events, status_messages);
        collect_tool_calls(&events, all_tool_calls);

        if outcome.status == AgentRunStatus::Completed {
            if !user_message_recorded {
                working_messages.push(user_message.clone());
            }
            working_messages.push(assistant_visible_message(&run_visible_text));
            *transcript_messages = working_messages;
            return Ok(run_visible_text);
        }

        if outcome.status != AgentRunStatus::WaitingForTool {
            return Err(format!(
                "scenario '{}' expected waiting/completed in user turn {} harness turn {}, but got {:?}",
                scenario.id, user_turn_index, harness_turn_index, outcome.status
            ));
        }

        let pending_tool_call = snapshot
            .execution_state
            .pending_tool_call
            .clone()
            .ok_or_else(|| {
                format!(
                    "scenario '{}' is waiting for a tool but no pending_tool_call was recorded",
                    scenario.id
                )
            })?;
        let tool_call = all_tool_calls
            .iter()
            .rev()
            .find(|tool_call| tool_call.id == pending_tool_call.id)
            .cloned()
            .ok_or_else(|| {
                format!(
                    "scenario '{}' could not find tool call event for pending id `{}`",
                    scenario.id, pending_tool_call.id
                )
            })?;
        let tool_result = simulator.execute(workspace, &tool_call)?;
        all_tool_results.push(tool_result.clone());

        if !user_message_recorded {
            working_messages.push(user_message.clone());
            user_message_recorded = true;
        }
        working_messages.push(assistant_tool_call_message(&tool_call, &run_visible_text));
        working_messages.push(AgentInputMessage {
            role: "tool".to_string(),
            content: tool_result,
            tool_call_id: Some(tool_call.id.clone()),
            tool_calls: None,
        });
        resume_execution_state = Some(snapshot.execution_state.clone());
    }

    Err(format!(
        "scenario '{}' exhausted {} harness turns while handling a single user turn",
        scenario.id, scenario.max_harness_turns_per_user
    ))
}

fn snapshot_events(
    events: &Arc<Mutex<Vec<TestAgentEvent>>>,
) -> Result<Vec<TestAgentEvent>, String> {
    events
        .lock()
        .map(|lock| lock.clone())
        .map_err(|_| "eval event lock is poisoned".to_string())
}

fn collect_tool_calls(events: &[TestAgentEvent], output: &mut Vec<AgentToolCall>) {
    for event in events {
        if let TestAgentEvent::ToolCall(tool_call) = event {
            output.push(tool_call.clone());
        }
    }
}

fn collect_status_messages(events: &[TestAgentEvent], output: &mut Vec<String>) {
    for event in events {
        if let TestAgentEvent::Status(_, Some(message)) = event {
            output.push(message.clone());
        }
    }
}

fn extract_tokens(events: &[TestAgentEvent]) -> String {
    events
        .iter()
        .filter_map(|event| match event {
            TestAgentEvent::Token(text) => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

fn assistant_tool_call_message(tool_call: &AgentToolCall, content: &str) -> AgentInputMessage {
    let mut tool_call_payload = json!({
        "id": tool_call.id,
        "type": "function",
        "function": {
            "name": tool_call.name,
            "arguments": raw_tool_arguments(&tool_call.args),
        }
    });
    if let Some(extra_content) = &tool_call.extra_content {
        if let Some(object) = tool_call_payload.as_object_mut() {
            object.insert("extra_content".to_string(), extra_content.clone());
        }
    }

    AgentInputMessage {
        role: "assistant".to_string(),
        content: content.to_string(),
        tool_call_id: None,
        tool_calls: Some(json!([tool_call_payload])),
    }
}

fn assistant_visible_message(content: &str) -> AgentInputMessage {
    AgentInputMessage {
        role: "assistant".to_string(),
        content: content.to_string(),
        tool_call_id: None,
        tool_calls: None,
    }
}

fn raw_tool_arguments(args: &Value) -> String {
    serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string())
}

#[allow(dead_code)]
fn _pending_tool_name(pending_tool_call: &AgentPendingToolCall) -> &str {
    pending_tool_call.name.as_str()
}
