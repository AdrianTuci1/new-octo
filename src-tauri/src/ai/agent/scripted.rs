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

#[derive(Default)]
pub struct ScriptedHarness;

struct ScriptedPlan {
    response: String,
    tool_command: Option<String>,
}

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
    ) -> impl std::future::Future<Output = Result<AgentHarnessOutcome, AgentHarnessError>> + Send {
        async move {
            sink.status(
                AgentRunStatus::Preparing,
                Some("Validating harness.".to_string()),
            );
            if sleep_or_cancel(&cancellation, Duration::from_millis(80)) {
                return Ok(cancelled_outcome(&context.prompt, ""));
            }

            sink.status(
                AgentRunStatus::Running,
                Some(format!("Running {} with {}.", self.kind(), context.model_id)),
            );
            if sleep_or_cancel(&cancellation, Duration::from_millis(120)) {
                return Ok(cancelled_outcome(&context.prompt, ""));
            }

            let plan = build_plan(&context);

            if let Some(command) = &plan.tool_command {
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
                        "reason": approval_reason(command),
                    }),
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

            let mut streamed = String::new();
            for chunk in response_chunks(&plan.response, 28) {
                if cancellation.is_cancelled() {
                    return Ok(cancelled_outcome(&context.prompt, &streamed));
                }

                streamed.push_str(&chunk);
                sink.token(chunk);

                if sleep_or_cancel(&cancellation, Duration::from_millis(24)) {
                    return Ok(cancelled_outcome(&context.prompt, &streamed));
                }
            }

            Ok(AgentHarnessOutcome {
                status: AgentRunStatus::Completed,
                usage: AgentUsage::approximate(&context.prompt, &streamed),
            })
        }
    }
}

fn cancelled_outcome(prompt: &str, streamed: &str) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::Cancelled,
        usage: AgentUsage::approximate(prompt, streamed),
    }
}

fn build_plan(context: &AgentHarnessContext) -> ScriptedPlan {
    let prompt = context.prompt.trim();
    let normalized = prompt.to_lowercase();

    if normalized.contains("git") {
        return ScriptedPlan {
            tool_command: Some("git status --short".to_string()),
            response: format!(
                "Pot verifica starea repository-ului fara sa rulez nimic automat. Harness-ul a pregatit o propunere de comanda, iar UI-ul pastreaza aprobarea la utilizator.\n\n```bash\ngit status --short\n```\n\nContext primit: `{}`",
                compact_prompt(prompt)
            ),
        };
    }

    if normalized.contains("eroare")
        || normalized.contains("error")
        || normalized.contains("fail")
        || normalized.contains("crash")
    {
        return ScriptedPlan {
            tool_command: Some("ls /tmp/octomus-this-path-should-not-exist".to_string()),
            response: "Am ales o comanda controlata pentru a testa fluxul de eroare si cardul de terminal. Ea ramane doar propusa pana la aprobare.\n\n```bash\nls /tmp/octomus-this-path-should-not-exist\n```\n\nDupa ce o rulezi, harness-ul poate primi blocul de terminal ca input contextual pentru urmatorul pas.".to_string(),
        };
    }

    if normalized.contains("file") || normalized.contains("fisier") || normalized.contains("rg") {
        return ScriptedPlan {
            tool_command: Some("rg --files".to_string()),
            response: "Pentru inspectie rapida de proiect, harness-ul propune o cautare de fisiere prin `rg`, pastrand executia sub controlul tau.\n\n```bash\nrg --files\n```\n\nAcesta este punctul unde, mai tarziu, conectam tool registry-ul real pentru read/search/edit.".to_string(),
        };
    }

    ScriptedPlan {
        tool_command: None,
        response: format!(
            "Am rulat cererea prin harness-ul local. In forma actuala, motorul face lifecycle complet: creeaza run-ul, emite stari, stream-uieste raspunsul, accepta anulare si finalizeaza usage estimativ.\n\nCererea ta:\n\n> {}\n\nUrmatorul strat va putea injecta un model real fara ca `AgentDriver` sau harness-ul sa stie despre auth, credite ori proxy.",
            prompt
        ),
    }
}

fn compact_prompt(prompt: &str) -> String {
    const MAX_CHARS: usize = 80;

    let mut compact = prompt.chars().take(MAX_CHARS).collect::<String>();
    if prompt.chars().count() > MAX_CHARS {
        compact.push_str("...");
    }
    compact.replace('`', "'")
}

fn approval_reason(command: &str) -> &'static str {
    let normalized = command.trim().to_lowercase();

    if normalized.starts_with("git status") {
        return "Am cerut accesul pentru verificarea statusului repository-ului.";
    }

    "Am cerut accesul pentru a rula o comandă în terminal și a verifica rezultatul."
}

fn response_chunks(response: &str, max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    for ch in response.chars() {
        current.push(ch);
        if current.chars().count() >= max_chars || ch == '\n' {
            chunks.push(std::mem::take(&mut current));
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context_for(prompt: &str) -> AgentHarnessContext {
        AgentHarnessContext {
            run_id: "run_test".to_string(),
            conversation_id: "conv_test".to_string(),
            assistant_message_id: "assistant_test".to_string(),
            prompt: prompt.to_string(),
            messages: Vec::new(),
            cwd: Some("/tmp".to_string()),
            model_id: "test-model".to_string(),
        }
    }

    #[test]
    fn git_prompt_creates_terminal_command_proposal() {
        let plan = build_plan(&context_for("verifica git status"));

        assert_eq!(plan.tool_command.as_deref(), Some("git status --short"));
        assert!(plan.response.contains("```bash"));
    }
}
