use super::{
    actions::handle_action_stage_response,
    context::{guardian_intercepted_tool_calls, normalize_outbound_tool_calls},
    heuristics::{
        command_is_low_risk_terminal_inspection, should_retry_file_change_duplicate_code,
        should_retry_follow_up_only,
    },
    parser::handle_stream_payload,
    resume::{apply_runtime_event, initial_runtime_for_context},
    thinking::longest_tag_suffix_len,
    types::{ActionStageOutcome, CollectedToolCall, StageModelResponse},
};
use crate::ai::agent::harness::{AgentEventSink, AgentHarnessContext, TestAgentEvent};
use crate::ai::agent::providers::{OpenAiCompatibleConfig, OpenAiCompatibleProvider};
use crate::ai::agent::runtime::{
    EVENT_SKIP_PLANNING, STAGE_AWAITING_APPROVAL, STAGE_EXECUTING, STAGE_REASONING, STAGE_VERIFYING,
};
use crate::ai::agent::types::{
    AgentExecutionState, AgentInputMessage, AgentPendingResolutionKind, AgentPendingToolCall,
    AgentRunSnapshot, AgentRunStatus, TerminalBlockContext,
};
use crate::ai::agent_management::AgentHarnessManager;
use chrono::Utc;
use serde_json::json;
use std::sync::{atomic::AtomicBool, Arc, Mutex};

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
        surface: None,
        messages,
        terminal_blocks,
        cwd: None,
        target_os: "macos".to_string(),
        target_arch: "arm64".to_string(),
        model_id: "test-model".to_string(),
        terminal_model_id: None,
        resume_execution_state: None,
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
fn stream_parser_preserves_whitespace_only_markdown_tokens() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime should build");
    runtime.block_on(async {
        let test_runtime = TestHarnessRuntime::new(
            "run-markdown-whitespace",
            "format markdown",
            vec![],
            None,
        );
        let mut streamed = String::new();
        let mut reasoning = String::new();
        let mut thinking_state = super::thinking::ThinkingStreamState::default();
        let mut usage = None;

        for chunk in ["Intro", "\n\n", "### Titlu", "\n\n", "- item"] {
            let payload = json!({
                "choices": [{
                    "delta": {
                        "content": chunk
                    }
                }]
            })
            .to_string();

            handle_stream_payload(
                &payload,
                &test_runtime.sink,
                &mut streamed,
                &mut reasoning,
                &mut thinking_state,
                false,
                true,
                false,
                &mut usage,
            )
            .expect("stream payload should parse");
        }

        assert_eq!(streamed, "Intro\n\n### Titlu\n\n- item");

        let events = test_runtime.events.lock().expect("events should lock");
        assert_eq!(
            extract_tokens(&events).join(""),
            "Intro\n\n### Titlu\n\n- item"
        );
    });
}

#[test]
fn new_runs_start_in_reasoning_stage() {
    let context = harness_context("analizeaza asta", vec![], vec![]);
    let runtime = initial_runtime_for_context(&context).expect("new runtime should initialize");

    assert_eq!(runtime.current_stage_id(), STAGE_REASONING);
}

#[test]
fn continuation_with_pending_tool_result_resumes_in_verifying() {
    let mut context = harness_context(
        "",
        vec![AgentInputMessage {
            role: "tool".to_string(),
            content: "Search completed".to_string(),
            tool_call_id: Some("tool-1".to_string()),
            tool_calls: None,
        }],
        vec![],
    );
    context.resume_execution_state = Some(AgentExecutionState {
        current_stage_id: STAGE_EXECUTING.to_string(),
        negotiation_attempt: 1,
        pending_resolution: Some(AgentPendingResolutionKind::ExternalToolResult),
        pending_tool_call: Some(AgentPendingToolCall {
            id: "tool-1".to_string(),
            name: "lookup_web".to_string(),
        }),
        last_error: None,
    });

    let runtime =
        initial_runtime_for_context(&context).expect("continuation runtime should resume");

    assert_eq!(runtime.current_stage_id(), STAGE_VERIFYING);
}

#[test]
fn continuation_without_new_tool_result_stays_in_previous_stage() {
    let mut context = harness_context(
        "",
        vec![AgentInputMessage {
            role: "assistant".to_string(),
            content: "Aștept aprobarea".to_string(),
            tool_call_id: None,
            tool_calls: None,
        }],
        vec![],
    );
    context.resume_execution_state = Some(AgentExecutionState {
        current_stage_id: STAGE_EXECUTING.to_string(),
        negotiation_attempt: 1,
        pending_resolution: Some(AgentPendingResolutionKind::ExternalToolResult),
        pending_tool_call: Some(AgentPendingToolCall {
            id: "tool-1".to_string(),
            name: "lookup_web".to_string(),
        }),
        last_error: None,
    });

    let runtime =
        initial_runtime_for_context(&context).expect("continuation runtime should resume");

    assert_eq!(runtime.current_stage_id(), STAGE_EXECUTING);
}

#[test]
fn approval_stage_with_tool_result_resumes_in_verifying() {
    let mut context = harness_context(
        "",
        vec![AgentInputMessage {
            role: "tool".to_string(),
            content: "Command completed successfully".to_string(),
            tool_call_id: Some("tool-approval".to_string()),
            tool_calls: None,
        }],
        vec![],
    );
    context.resume_execution_state = Some(AgentExecutionState {
        current_stage_id: STAGE_AWAITING_APPROVAL.to_string(),
        negotiation_attempt: 0,
        pending_resolution: Some(AgentPendingResolutionKind::Approval),
        pending_tool_call: Some(AgentPendingToolCall {
            id: "tool-approval".to_string(),
            name: "propose_terminal_command".to_string(),
        }),
        last_error: None,
    });

    let runtime =
        initial_runtime_for_context(&context).expect("continuation runtime should resume");

    assert_eq!(runtime.current_stage_id(), STAGE_VERIFYING);
}

#[test]
fn low_risk_terminal_inspection_commands_are_auto_approved() {
    assert!(command_is_low_risk_terminal_inspection("ls -la"));
    assert!(command_is_low_risk_terminal_inspection(
        "git status --short"
    ));
    assert!(command_is_low_risk_terminal_inspection("cargo test"));
    assert!(!command_is_low_risk_terminal_inspection(
        "rm -rf node_modules"
    ));
    assert!(!command_is_low_risk_terminal_inspection(
        "git push origin main"
    ));
    assert!(!command_is_low_risk_terminal_inspection("ls -la && pwd"));
}

#[test]
fn terminal_tool_missing_command_requests_repair() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime should build");
    runtime.block_on(async {
        let test_runtime = TestHarnessRuntime::new(
            "run-terminal-missing-command",
            "verifică mediul local",
            vec![],
            None,
        );
        let config = test_config();
        let mut loop_runtime =
            initial_runtime_for_context(&test_runtime.context).expect("runtime should initialize");
        apply_runtime_event(&mut loop_runtime, EVENT_SKIP_PLANNING)
            .expect("reasoning -> tool-selection should be valid");

        let mut negotiation_messages = test_runtime.context.messages.clone();
        let outcome = handle_action_stage_response(
            &config,
            &test_runtime.context,
            &test_runtime.sink,
            &mut loop_runtime,
            &mut negotiation_messages,
            &mut None,
            &mut None,
            &mut None,
            0,
            StageModelResponse {
                visible_text: String::new(),
                tool_call: Some(CollectedToolCall {
                    id: "call_missing_command".to_string(),
                    name: "propose_terminal_command".to_string(),
                    args: json!({}),
                    raw_args: "{}".to_string(),
                    google_thought_signature: None,
                }),
                usage: None,
            },
            false,
        )
        .await
        .expect("action handling should succeed");

        match outcome {
            ActionStageOutcome::Continue => {}
            _ => panic!("expected repair retry when command is missing"),
        }

        let repair_instruction = negotiation_messages
            .iter()
            .rev()
            .find(|message| message.role == "system")
            .map(|message| message.content.clone())
            .unwrap_or_default();
        assert!(repair_instruction.contains("missing the required `command`"));
        assert!(repair_instruction.contains("propose_terminal_command"));
    });
}

#[test]
fn namespaced_terminal_tool_calls_are_normalized() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime should build");
    runtime.block_on(async {
        let test_runtime = TestHarnessRuntime::new(
            "run-terminal-namespaced",
            "vezi daca docker ruleaza",
            vec![],
            None,
        );
        let config = test_config();
        let mut loop_runtime =
            initial_runtime_for_context(&test_runtime.context).expect("runtime should initialize");
        apply_runtime_event(&mut loop_runtime, EVENT_SKIP_PLANNING)
            .expect("reasoning -> tool-selection should be valid");

        let outcome = handle_action_stage_response(
            &config,
            &test_runtime.context,
            &test_runtime.sink,
            &mut loop_runtime,
            &mut test_runtime.context.messages.clone(),
            &mut None,
            &mut None,
            &mut None,
            0,
            StageModelResponse {
                visible_text: String::new(),
                tool_call: Some(CollectedToolCall {
                    id: "call_docker".to_string(),
                    name: "octomus:propose_terminal_command".to_string(),
                    args: json!({ "command": "docker ps" }),
                    raw_args: "{\"command\":\"docker ps\"}".to_string(),
                    google_thought_signature: None,
                }),
                usage: None,
            },
            false,
        )
        .await
        .expect("action handling should succeed");

        match outcome {
            ActionStageOutcome::Waiting(_) => {}
            _ => panic!("expected waiting outcome for namespaced terminal command"),
        }

        let snapshot = test_runtime
            .manager
            .get("run-terminal-namespaced")
            .expect("snapshot should exist");
        assert_eq!(
            snapshot
                .execution_state
                .pending_tool_call
                .as_ref()
                .map(|tool| tool.name.as_str()),
            Some("propose_terminal_command")
        );
    });
}

#[test]
fn stream_payload_object_tool_arguments_are_serialized() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime should build");
    runtime.block_on(async {
        let test_runtime = TestHarnessRuntime::new(
            "run-stream-object-args",
            "vezi daca docker ruleaza",
            vec![],
            None,
        );
        let mut streamed = String::new();
        let mut reasoning = String::new();
        let mut thinking_state = super::thinking::ThinkingStreamState::default();
        let mut usage = None;
        let payload = json!({
            "choices": [{
                "delta": {
                    "tool_calls": [{
                        "id": "call_1",
                        "function": {
                            "name": "propose_terminal_command",
                            "arguments": {
                                "command": "docker ps",
                                "requiresApproval": true
                            }
                        }
                    }]
                }
            }]
        })
        .to_string();

        let delta = handle_stream_payload(
            &payload,
            &test_runtime.sink,
            &mut streamed,
            &mut reasoning,
            &mut thinking_state,
            false,
            false,
            false,
            &mut usage,
        )
        .expect("stream payload should parse")
        .expect("tool delta should be returned");

        assert_eq!(delta.name.as_deref(), Some("propose_terminal_command"));
        assert_eq!(
            delta.arguments.as_deref(),
            Some("{\"command\":\"docker ps\",\"requiresApproval\":true}")
        );
    });
}

#[test]
fn local_runtime_check_first_turn_enters_waiting_for_approval() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime should build");
    runtime.block_on(async {
        let test_runtime = TestHarnessRuntime::new(
            "run-python-turn-1",
            "verifica daca am python instalat",
            vec![],
            None,
        );
        let config = test_config();
        let mut loop_runtime =
            initial_runtime_for_context(&test_runtime.context).expect("runtime should initialize");
        apply_runtime_event(&mut loop_runtime, EVENT_SKIP_PLANNING)
            .expect("reasoning -> tool-selection should be valid");

        let outcome = handle_action_stage_response(
            &config,
            &test_runtime.context,
            &test_runtime.sink,
            &mut loop_runtime,
            &mut test_runtime.context.messages.clone(),
            &mut None,
            &mut None,
            &mut None,
            0,
            StageModelResponse {
                visible_text: String::new(),
                tool_call: Some(CollectedToolCall {
                    id: "call_python".to_string(),
                    name: "propose_terminal_command".to_string(),
                    args: json!({ "command": "python3 --version" }),
                    raw_args: "{\"command\":\"python3 --version\"}".to_string(),
                    google_thought_signature: None,
                }),
                usage: None,
            },
            false,
        )
        .await
        .expect("action handling should succeed");

        match outcome {
            ActionStageOutcome::Waiting(_) => {}
            _ => panic!("expected waiting outcome for approval-gated command"),
        }

        let snapshot = test_runtime
            .manager
            .get("run-python-turn-1")
            .expect("snapshot should exist");
        assert_eq!(
            snapshot.execution_state.current_stage_id,
            STAGE_AWAITING_APPROVAL
        );
        assert_eq!(
            snapshot
                .execution_state
                .pending_tool_call
                .as_ref()
                .map(|tool| tool.name.as_str()),
            Some("propose_terminal_command")
        );
    });
}

#[test]
fn local_runtime_check_resume_produces_non_fallback_answer() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime should build");
    runtime.block_on(async {
        let continuation_messages = vec![
            assistant_tool_call_message(
                "call_python",
                "propose_terminal_command",
                "{\"command\":\"python3 --version\"}",
            ),
            AgentInputMessage {
                role: "tool".to_string(),
                content: "Python 3.12.0".to_string(),
                tool_call_id: Some("call_python".to_string()),
                tool_calls: None,
            },
        ];

        let second_turn = TestHarnessRuntime::new(
            "run-python-turn-2",
            "",
            continuation_messages,
            Some(AgentExecutionState {
                current_stage_id: STAGE_AWAITING_APPROVAL.to_string(),
                negotiation_attempt: 0,
                pending_resolution: Some(AgentPendingResolutionKind::Approval),
                pending_tool_call: Some(AgentPendingToolCall {
                    id: "call_python".to_string(),
                    name: "propose_terminal_command".to_string(),
                }),
                last_error: None,
            }),
        );
        let config = test_config();
        let mut loop_runtime =
            initial_runtime_for_context(&second_turn.context).expect("runtime should resume");
        assert_eq!(loop_runtime.current_stage_id(), STAGE_VERIFYING);

        let outcome = handle_action_stage_response(
            &config,
            &second_turn.context,
            &second_turn.sink,
            &mut loop_runtime,
            &mut second_turn.context.messages.clone(),
            &mut None,
            &mut None,
            &mut None,
            1,
            StageModelResponse {
                visible_text:
                    "Da, Python este instalat local. `python3 --version` a returnat Python 3.12.0."
                        .to_string(),
                tool_call: None,
                usage: None,
            },
            true,
        )
        .await
        .expect("verification stage should succeed");

        match outcome {
            ActionStageOutcome::Completed(answer) => {
                assert!(answer.contains("Python este instalat local"));
            }
            _ => panic!("expected completed outcome after verification"),
        }

        let final_tokens = extract_tokens(&second_turn.events.lock().expect("event lock")).join("");
        assert!(final_tokens.contains("Python este instalat"));
        assert!(!final_tokens.contains("Nu pot continua automat"));
    });
}

fn test_config() -> OpenAiCompatibleConfig {
    OpenAiCompatibleConfig::new(
        OpenAiCompatibleProvider::Custom,
        "test-key".to_string(),
        Some("http://unused.local/v1".to_string()),
        Some("test-model".to_string()),
        "test".to_string(),
    )
}

fn assistant_tool_call_message(
    tool_call_id: &str,
    tool_name: &str,
    raw_arguments: &str,
) -> AgentInputMessage {
    AgentInputMessage {
        role: "assistant".to_string(),
        content: String::new(),
        tool_call_id: None,
        tool_calls: Some(normalize_outbound_tool_calls(&json!([
            {
                "id": tool_call_id,
                "type": "function",
                "function": {
                    "name": tool_name,
                    "arguments": raw_arguments,
                }
            }
        ]))),
    }
}

#[derive(Clone)]
struct TestHarnessRuntime {
    manager: AgentHarnessManager,
    sink: AgentEventSink,
    context: AgentHarnessContext,
    events: Arc<Mutex<Vec<TestAgentEvent>>>,
}

impl TestHarnessRuntime {
    fn new(
        run_id: &str,
        prompt: &str,
        messages: Vec<AgentInputMessage>,
        resume_execution_state: Option<AgentExecutionState>,
    ) -> Self {
        let manager = AgentHarnessManager::default();
        let context = AgentHarnessContext {
            run_id: run_id.to_string(),
            conversation_id: "conv-test".to_string(),
            assistant_message_id: "assistant-test".to_string(),
            prompt: prompt.to_string(),
            surface: Some("agent".to_string()),
            messages,
            terminal_blocks: vec![],
            cwd: Some("/tmp".to_string()),
            target_os: "macos".to_string(),
            target_arch: "arm64".to_string(),
            model_id: "test-model".to_string(),
            terminal_model_id: None,
            resume_execution_state: resume_execution_state.clone(),
        };

        manager
            .insert(
                AgentRunSnapshot {
                    run_id: run_id.to_string(),
                    conversation_id: "conv-test".to_string(),
                    assistant_message_id: "assistant-test".to_string(),
                    prompt: prompt.to_string(),
                    status: AgentRunStatus::Queued,
                    status_message: Some("Queued".to_string()),
                    model_id: "test-model".to_string(),
                    cwd: Some("/tmp".to_string()),
                    error: None,
                    execution_state: resume_execution_state
                        .unwrap_or_else(|| AgentExecutionState::new("preparing")),
                    started_at: Utc::now(),
                    finished_at: None,
                },
                Arc::new(AtomicBool::new(false)),
            )
            .expect("snapshot should insert");

        let (sink, events) = AgentEventSink::for_tests(manager.clone(), &context);

        Self {
            manager,
            sink,
            context,
            events,
        }
    }
}

fn extract_tokens(events: &[TestAgentEvent]) -> Vec<String> {
    events
        .iter()
        .filter_map(|event| match event {
            TestAgentEvent::Token(text) => Some(text.clone()),
            _ => None,
        })
        .collect()
}
