use std::time::Duration;

use serde_json::json;
use uuid::Uuid;

use super::{
    harness::{
        sleep_or_cancel, AgentCancellation, AgentEventSink, AgentHarness, AgentHarnessContext,
        AgentHarnessError, AgentHarnessOutcome,
    },
    types::{AgentRunStatus, AgentToolCall, AgentUsage},
};

mod plan;
mod util;

use plan::build_plan;
use util::cancelled_outcome;

#[derive(Default)]
pub struct ScriptedHarness;

impl AgentHarness for ScriptedHarness {
    fn kind(&self) -> &'static str {
        "scripted-local"
    }

    fn validate(&self) -> Result<(), AgentHarnessError> {
        Ok(())
    }

    fn run_async(
        &self,
        context: AgentHarnessContext,
        sink: AgentEventSink,
        cancellation: AgentCancellation,
    ) -> impl std::future::Future<Output = Result<AgentHarnessOutcome, AgentHarnessError>> + Send
    {
        async move {
            sink.status(
                AgentRunStatus::Preparing,
                Some("Validating harness.".to_string()),
            );
            sink.reasoning(
                "Verific contextul conversației și stabilesc dacă este nevoie de un pas intermediar.",
                false,
            );
            if sleep_or_cancel(&cancellation, Duration::from_millis(80)) {
                return Ok(cancelled_outcome(&context.prompt, ""));
            }

            sink.status(
                AgentRunStatus::Running,
                Some(format!(
                    "Running {} with {}.",
                    self.kind(),
                    context.model_id
                )),
            );
            if sleep_or_cancel(&cancellation, Duration::from_millis(120)) {
                return Ok(cancelled_outcome(&context.prompt, ""));
            }

            let plan = build_plan(&context);

            if let Some(command) = &plan.tool_command {
                sink.reasoning(
                    "Am identificat că un tool local ar clarifica următorul pas, așa că pregătesc propunerea pentru UI.",
                    false,
                );
                let tool_call_id = format!("tool_{}", Uuid::new_v4());
                sink.status(
                    AgentRunStatus::WaitingForTool,
                    Some("Preparing a terminal command proposal.".to_string()),
                );
                sink.tool_call(AgentToolCall {
                    id: tool_call_id.clone(),
                    name: "propose_terminal_command".to_string(),
                    args: json!({
                        "command": command,
                        "cwd": context.cwd,
                        "requiresApproval": true,
                        "reason": util::approval_reason(command),
                    }),
                    extra_content: None,
                });

                if sleep_or_cancel(&cancellation, Duration::from_millis(120)) {
                    return Ok(cancelled_outcome(&context.prompt, ""));
                }

                sink.tool_result(
                    tool_call_id,
                    "Command proposal created. UI approval is required before terminal execution.",
                );
                sink.status(
                    AgentRunStatus::Running,
                    Some("Streaming assistant response.".to_string()),
                );
            }

            if let Some(query) = &plan.web_search_query {
                let tool_call_id = format!("tool_{}", Uuid::new_v4());
                sink.status(
                    AgentRunStatus::WaitingForTool,
                    Some("Preparing a web lookup.".to_string()),
                );
                sink.tool_call(AgentToolCall {
                    id: tool_call_id,
                    name: "lookup_web".to_string(),
                    args: json!({
                        "query": query,
                    }),
                    extra_content: None,
                });

                if sleep_or_cancel(&cancellation, Duration::from_millis(120)) {
                    return Ok(cancelled_outcome(&context.prompt, ""));
                }

                sink.status(
                    AgentRunStatus::Running,
                    Some("Waiting for web results.".to_string()),
                );
            }

            if let Some(execution_plan) = &plan.execution_plan {
                let tool_call_id = format!("tool_{}", Uuid::new_v4());
                sink.tool_call(AgentToolCall {
                    id: tool_call_id,
                    name: plan
                        .execution_plan_tool
                        .unwrap_or("propose_plan")
                        .to_string(),
                    args: execution_plan.clone(),
                    extra_content: None,
                });

                if sleep_or_cancel(&cancellation, Duration::from_millis(80)) {
                    return Ok(cancelled_outcome(&context.prompt, ""));
                }
            }

            sink.reasoning(
                "Am terminat analiza inițială și trec la formularea răspunsului vizibil.",
                true,
            );

            let mut streamed = String::new();
            for chunk in util::response_chunks(&plan.response, 28) {
                if cancellation.is_cancelled() {
                    return Ok(cancelled_outcome(&context.prompt, &streamed));
                }

                streamed.push_str(&chunk);
                sink.token(chunk);

                if sleep_or_cancel(&cancellation, Duration::from_millis(24)) {
                    return Ok(cancelled_outcome(&context.prompt, &streamed));
                }
            }

            if let Some(prompt) = &plan.follow_up_prompt {
                sink.tool_call(AgentToolCall {
                    id: format!("tool_{}", Uuid::new_v4()),
                    name: "suggest_follow_up".to_string(),
                    args: json!({
                        "prompt": prompt,
                        "description": "Suggested next user message based on the current answer.",
                        "confidence": 0.95
                    }),
                    extra_content: None,
                });
            }

            Ok(AgentHarnessOutcome {
                status: AgentRunStatus::Completed,
                usage: AgentUsage::approximate(&context.prompt, &streamed),
            })
        }
    }
}
