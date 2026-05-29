use std::collections::HashSet;

use super::loop_contract::{get_loop_contract, AgentLoopStage};
use super::types::AgentRunStatus;

pub const STAGE_PREPARING: &str = "preparing";
pub const STAGE_REASONING: &str = "reasoning";
pub const STAGE_TOOL_SELECTION: &str = "tool-selection";
pub const STAGE_AWAITING_APPROVAL: &str = "awaiting-approval";
pub const STAGE_EXECUTING: &str = "executing";
pub const STAGE_VERIFYING: &str = "verifying";
pub const STAGE_COMPLETED: &str = "completed";
pub const STAGE_FAILED: &str = "failed";
pub const STAGE_CANCELLED: &str = "cancelled";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentLoopRuntimeError {
    pub message: String,
}

impl AgentLoopRuntimeError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct AgentLoopRuntime {
    current_stage_id: String,
}

impl AgentLoopRuntime {
    pub fn new() -> Self {
        Self {
            current_stage_id: STAGE_PREPARING.to_string(),
        }
    }

    pub fn resume(stage_id: &str) -> Result<Self, AgentLoopRuntimeError> {
        find_stage(stage_id).ok_or_else(|| {
            AgentLoopRuntimeError::new(format!("Unknown runtime stage '{stage_id}'"))
        })?;

        Ok(Self {
            current_stage_id: stage_id.to_string(),
        })
    }

    pub fn current_stage_id(&self) -> &str {
        &self.current_stage_id
    }

    pub fn current_stage(&self) -> &'static AgentLoopStage {
        find_stage(&self.current_stage_id)
            .expect("runtime current stage must exist in loop contract")
    }

    pub fn transition_to(&mut self, next_stage_id: &str) -> Result<(), AgentLoopRuntimeError> {
        if next_stage_id == self.current_stage_id {
            return Ok(());
        }

        let current_stage = self.current_stage();
        if !current_stage
            .next_stages
            .iter()
            .any(|id| id == next_stage_id)
        {
            return Err(AgentLoopRuntimeError::new(format!(
                "Invalid stage transition from '{}' to '{}'",
                current_stage.id, next_stage_id
            )));
        }

        find_stage(next_stage_id).ok_or_else(|| {
            AgentLoopRuntimeError::new(format!("Unknown runtime stage '{next_stage_id}'"))
        })?;

        self.current_stage_id = next_stage_id.to_string();
        Ok(())
    }

    pub fn allowed_tool_names(&self) -> HashSet<&str> {
        self.current_stage()
            .allowed_tools
            .iter()
            .map(String::as_str)
            .collect()
    }

    pub fn allows_tool(&self, tool_name: &str) -> bool {
        self.allowed_tool_names().contains(tool_name)
            || (tool_name == "launch_cloud_agent"
                && matches!(
                    self.current_stage_id.as_str(),
                    STAGE_TOOL_SELECTION | STAGE_VERIFYING
                ))
            || (tool_name.starts_with("mcp__")
                && matches!(
                    self.current_stage_id.as_str(),
                    STAGE_TOOL_SELECTION | STAGE_VERIFYING
                ))
    }

    pub fn allows_mcp_tools(&self) -> bool {
        matches!(
            self.current_stage_id.as_str(),
            STAGE_TOOL_SELECTION | STAGE_VERIFYING
        )
    }

    pub fn run_status(&self) -> AgentRunStatus {
        match self.current_stage_id.as_str() {
            STAGE_PREPARING => AgentRunStatus::Preparing,
            STAGE_AWAITING_APPROVAL => AgentRunStatus::WaitingForTool,
            STAGE_COMPLETED => AgentRunStatus::Completed,
            STAGE_FAILED => AgentRunStatus::Failed,
            STAGE_CANCELLED => AgentRunStatus::Cancelled,
            _ => AgentRunStatus::Running,
        }
    }

    pub fn status_message(&self) -> String {
        let stage = self.current_stage();
        format!("Stage {}: {}", stage.display_name, stage.purpose)
    }
}

fn find_stage(stage_id: &str) -> Option<&'static AgentLoopStage> {
    get_loop_contract()
        .stages
        .iter()
        .find(|stage| stage.id == stage_id)
}

#[cfg(test)]
mod tests {
    use super::{
        AgentLoopRuntime, STAGE_AWAITING_APPROVAL, STAGE_PREPARING, STAGE_REASONING,
        STAGE_TOOL_SELECTION, STAGE_VERIFYING,
    };
    use crate::ai::agent::types::AgentRunStatus;

    #[test]
    fn validates_contract_transitions() {
        let mut runtime = AgentLoopRuntime::new();

        runtime
            .transition_to(STAGE_REASONING)
            .expect("preparing -> reasoning should be valid");
        runtime
            .transition_to(STAGE_TOOL_SELECTION)
            .expect("reasoning -> tool-selection should be valid");
        runtime
            .transition_to(STAGE_AWAITING_APPROVAL)
            .expect("tool-selection -> awaiting-approval should be valid");

        assert_eq!(runtime.current_stage_id(), STAGE_AWAITING_APPROVAL);
        assert_eq!(runtime.run_status(), AgentRunStatus::WaitingForTool);
    }

    #[test]
    fn rejects_invalid_transitions() {
        let mut runtime = AgentLoopRuntime::new();
        let error = runtime
            .transition_to(STAGE_TOOL_SELECTION)
            .expect_err("preparing -> tool-selection should be rejected");

        assert!(error.message.contains(STAGE_PREPARING));
        assert!(error.message.contains(STAGE_TOOL_SELECTION));
    }

    #[test]
    fn resumed_verifying_stage_allows_mcp_tools() {
        let runtime =
            AgentLoopRuntime::resume(STAGE_VERIFYING).expect("verifying stage should exist");

        assert!(runtime.allows_tool("mcp__github__search"));
        assert!(!runtime.allows_tool("nonexistent_tool"));
    }
}
