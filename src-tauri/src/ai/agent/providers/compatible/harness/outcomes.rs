use crate::ai::agent::harness::AgentHarnessOutcome;
use crate::ai::agent::types::{AgentRunStatus, AgentUsage};

pub(super) fn done_outcome(
    prompt: &str,
    streamed: &str,
    usage: Option<AgentUsage>,
) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::Completed,
        usage: usage.unwrap_or_else(|| AgentUsage::approximate(prompt, streamed)),
    }
}

pub(super) fn waiting_outcome(
    prompt: &str,
    streamed: &str,
    usage: Option<AgentUsage>,
) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::WaitingForTool,
        usage: usage.unwrap_or_else(|| AgentUsage::approximate(prompt, streamed)),
    }
}

pub(super) fn cancelled_outcome(prompt: &str, streamed: &str) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::Cancelled,
        usage: AgentUsage::approximate(prompt, streamed),
    }
}
