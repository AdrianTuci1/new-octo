use std::collections::HashSet;

use super::loop_contract::{
    find_stage, find_tool_policy, resolve_stage_transition, AgentLoopStage, AgentToolPolicy,
};
use super::types::AgentRunStatus;

pub const STAGE_PREPARING: &str = "preparing";
#[allow(dead_code)]
pub const STAGE_REASONING: &str = "reasoning";
#[allow(dead_code)]
pub const STAGE_TOOL_SELECTION: &str = "tool-selection";
pub const STAGE_AWAITING_APPROVAL: &str = "awaiting-approval";
pub const STAGE_EXECUTING: &str = "executing";
pub const STAGE_VERIFYING: &str = "verifying";
pub const STAGE_COMPLETED: &str = "completed";
pub const STAGE_FAILED: &str = "failed";
pub const STAGE_CANCELLED: &str = "cancelled";

pub const EVENT_PREPARE_CONTEXT: &str = "prepare-context";
#[allow(dead_code)]
pub const EVENT_CONTINUE_TO_PLANNING: &str = "continue-to-planning";
pub const EVENT_SKIP_PLANNING: &str = "skip-planning";
#[allow(dead_code)]
pub const EVENT_PLAN_TOOL_FINISHED: &str = "plan-tool-finished";
pub const EVENT_AWAIT_USER_APPROVAL: &str = "await-user-approval";
#[allow(dead_code)]
pub const EVENT_APPROVE_ACTION: &str = "approve-action";
#[allow(dead_code)]
pub const EVENT_EDIT_ACTION: &str = "edit-action";
pub const EVENT_DISPATCH_TOOL: &str = "dispatch-tool";
pub const EVENT_CAPTURE_TOOL_RESULT: &str = "capture-tool-result";
pub const EVENT_REQUEST_ANOTHER_TOOL: &str = "request-another-tool";
pub const EVENT_EMIT_FINAL_ANSWER: &str = "emit-final-answer";
#[allow(dead_code)]
pub const EVENT_FAIL_RUN: &str = "fail-run";
#[allow(dead_code)]
pub const EVENT_CANCEL_RUN: &str = "cancel-run";

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

    pub fn apply_event(&mut self, event_id: &str) -> Result<(), AgentLoopRuntimeError> {
        let transition = resolve_stage_transition(&self.current_stage_id, event_id).ok_or_else(|| {
            AgentLoopRuntimeError::new(format!(
                "Stage '{}' does not allow event '{}'",
                self.current_stage_id, event_id
            ))
        })?;

        self.transition_to(&transition.target_stage_id)
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
            || self
                .tool_policy(tool_name)
                .map(|policy| {
                    policy
                        .allowed_stages
                        .iter()
                        .any(|stage_id| stage_id == self.current_stage_id())
                })
                .unwrap_or(false)
    }

    pub fn allows_mcp_tools(&self) -> bool {
        self.allows_tool("mcp__dynamic_placeholder")
    }

    pub fn tool_policy(&self, tool_name: &str) -> Option<&'static AgentToolPolicy> {
        find_tool_policy(tool_name)
    }

    pub fn tool_requires_approval(&self, tool_name: &str) -> bool {
        self.tool_policy(tool_name)
            .map(|policy| policy.requires_approval)
            .unwrap_or(false)
    }

    pub fn tool_requires_external_result(&self, tool_name: &str) -> bool {
        self.tool_policy(tool_name)
            .map(|policy| policy.requires_external_result)
            .unwrap_or(false)
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

#[cfg(test)]
mod tests {
    use super::{
        AgentLoopRuntime, EVENT_AWAIT_USER_APPROVAL, EVENT_PREPARE_CONTEXT, EVENT_SKIP_PLANNING,
        STAGE_AWAITING_APPROVAL, STAGE_PREPARING, STAGE_VERIFYING,
    };
    use crate::ai::agent::types::AgentRunStatus;

    #[test]
    fn validates_contract_transitions() {
        let mut runtime = AgentLoopRuntime::new();

        runtime
            .apply_event(EVENT_PREPARE_CONTEXT)
            .expect("preparing -> reasoning should be valid");
        runtime
            .apply_event(EVENT_SKIP_PLANNING)
            .expect("reasoning -> tool-selection should be valid");
        runtime
            .apply_event(EVENT_AWAIT_USER_APPROVAL)
            .expect("tool-selection -> awaiting-approval should be valid");

        assert_eq!(runtime.current_stage_id(), STAGE_AWAITING_APPROVAL);
        assert_eq!(runtime.run_status(), AgentRunStatus::WaitingForTool);
    }

    #[test]
    fn rejects_invalid_transitions() {
        let mut runtime = AgentLoopRuntime::new();
        let error = runtime
            .apply_event(EVENT_SKIP_PLANNING)
            .expect_err("preparing cannot skip directly to tool-selection");

        assert!(error.message.contains(STAGE_PREPARING));
        assert!(error.message.contains(EVENT_SKIP_PLANNING));
    }

    #[test]
    fn resumed_verifying_stage_allows_mcp_tools() {
        let runtime =
            AgentLoopRuntime::resume(STAGE_VERIFYING).expect("verifying stage should exist");

        assert!(runtime.allows_tool("mcp__github__search"));
        assert!(!runtime.allows_tool("nonexistent_tool"));
    }

    #[test]
    fn tool_policy_controls_resolution_rules() {
        let runtime =
            AgentLoopRuntime::resume(STAGE_VERIFYING).expect("verifying stage should exist");

        assert!(runtime.tool_requires_approval("propose_terminal_command"));
        assert!(runtime.tool_requires_external_result("lookup_web"));
        assert!(!runtime.tool_requires_external_result("plan_execution"));
    }
}
