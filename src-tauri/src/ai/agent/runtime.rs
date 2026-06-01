use super::types::AgentRunStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolMatchKind {
    Exact,
    Prefix,
}

/// Policy entry for a specific tool, determines how the harness handles it.
#[derive(Debug, Clone)]
pub struct ToolPolicy {
    pub pattern: &'static str,
    pub match_kind: ToolMatchKind,
    pub requires_approval: bool,
    pub requires_external_result: bool,
}

impl ToolPolicy {
    pub fn matches(&self, tool_name: &str) -> bool {
        match self.match_kind {
            ToolMatchKind::Exact => self.pattern == tool_name,
            ToolMatchKind::Prefix => tool_name.starts_with(self.pattern),
        }
    }
}

/// Hardcoded tool policies replacing the old loop.json definitions.
pub fn find_tool_policy(tool_name: &str) -> Option<&'static ToolPolicy> {
    static TOOL_POLICIES: [ToolPolicy; 8] = [
        ToolPolicy {
            pattern: "propose_terminal_command",
            match_kind: ToolMatchKind::Exact,
            requires_approval: true,
            requires_external_result: true,
        },
        ToolPolicy {
            pattern: "explore_workspace",
            match_kind: ToolMatchKind::Exact,
            requires_approval: false,
            requires_external_result: false,
        },
        ToolPolicy {
            pattern: "read_workspace_file",
            match_kind: ToolMatchKind::Exact,
            requires_approval: false,
            requires_external_result: false,
        },
        ToolPolicy {
            pattern: "lookup_web",
            match_kind: ToolMatchKind::Exact,
            requires_approval: false,
            requires_external_result: true,
        },
        ToolPolicy {
            pattern: "mcp__",
            match_kind: ToolMatchKind::Prefix,
            requires_approval: false,
            requires_external_result: false,
        },
        ToolPolicy {
            pattern: "propose_file_change",
            match_kind: ToolMatchKind::Exact,
            requires_approval: true,
            requires_external_result: true,
        },
        ToolPolicy {
            pattern: "propose_plan",
            match_kind: ToolMatchKind::Exact,
            requires_approval: false,
            requires_external_result: false,
        },
        ToolPolicy {
            pattern: "launch_cloud_agent",
            match_kind: ToolMatchKind::Exact,
            requires_approval: true,
            requires_external_result: true,
        },
    ];

    TOOL_POLICIES.iter().find(|policy| policy.matches(tool_name))
}

pub const PHASE_PREPARING: &str = "preparing";
pub const PHASE_RUNNING: &str = "running";
pub const PHASE_WAITING_FOR_TOOL: &str = "waiting-for-tool";
pub const PHASE_COMPLETED: &str = "completed";
pub const PHASE_FAILED: &str = "failed";
pub const PHASE_CANCELLED: &str = "cancelled";

/// Simplified runtime that tracks an informational phase for UI purposes.
/// Unlike the old `AgentLoopRuntime`, this does NOT validate transitions or
/// restrict tool access by stage. All tools are always available; the phase
/// is purely for status reporting to the frontend.
#[derive(Debug, Clone)]
pub struct AgentLoopRuntime {
    current_phase: String,
}

impl AgentLoopRuntime {
    pub fn new() -> Self {
        Self {
            current_phase: PHASE_PREPARING.to_string(),
        }
    }

    pub fn resume(phase: &str) -> Result<Self, String> {
        Ok(Self {
            current_phase: phase.to_string(),
        })
    }

    pub fn current_stage_id(&self) -> &str {
        &self.current_phase
    }

    /// Transition to a new phase. Always allowed.
    pub fn transition_to(&mut self, phase: &str) {
        self.current_phase = phase.to_string();
    }

    /// All tools are always allowed. No stage-based filtering.
    pub fn allows_tool(&self, _tool_name: &str) -> bool {
        true
    }

    /// All MCP tools are always allowed.
    pub fn allows_mcp_tools(&self) -> bool {
        true
    }

    /// Check tool approval policy from contract (kept for external-tool gating).
    pub fn tool_policy(&self, tool_name: &str) -> Option<&'static ToolPolicy> {
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
        match self.current_phase.as_str() {
            PHASE_PREPARING => AgentRunStatus::Preparing,
            PHASE_WAITING_FOR_TOOL => AgentRunStatus::WaitingForTool,
            PHASE_COMPLETED => AgentRunStatus::Completed,
            PHASE_FAILED => AgentRunStatus::Failed,
            PHASE_CANCELLED => AgentRunStatus::Cancelled,
            _ => AgentRunStatus::Running,
        }
    }

    pub fn status_message(&self) -> String {
        format!("Phase: {}", self.current_phase)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        AgentLoopRuntime, PHASE_COMPLETED, PHASE_PREPARING, PHASE_RUNNING, PHASE_WAITING_FOR_TOOL,
    };
    use crate::ai::agent::types::AgentRunStatus;

    #[test]
    fn new_runtime_starts_in_preparing() {
        let runtime = AgentLoopRuntime::new();
        assert_eq!(runtime.current_stage_id(), PHASE_PREPARING);
        assert_eq!(runtime.run_status(), AgentRunStatus::Preparing);
    }

    #[test]
    fn resumed_from_arbitrary_phase() {
        let runtime =
            AgentLoopRuntime::resume(PHASE_RUNNING).expect("resuming should always succeed");
        assert_eq!(runtime.current_stage_id(), PHASE_RUNNING);
    }

    #[test]
    fn transition_always_succeeds() {
        let mut runtime = AgentLoopRuntime::new();
        runtime.transition_to(PHASE_WAITING_FOR_TOOL);
        assert_eq!(runtime.current_stage_id(), PHASE_WAITING_FOR_TOOL);
        assert_eq!(runtime.run_status(), AgentRunStatus::WaitingForTool);

        runtime.transition_to(PHASE_COMPLETED);
        assert_eq!(runtime.run_status(), AgentRunStatus::Completed);
    }

    #[test]
    fn all_tools_are_always_allowed() {
        let runtime = AgentLoopRuntime::new();
        assert!(runtime.allows_tool("explore_workspace"));
        assert!(runtime.allows_tool("propose_terminal_command"));
        assert!(runtime.allows_tool("mcp__github__search"));
        assert!(runtime.allows_tool("nonexistent_tool"));
        assert!(runtime.allows_mcp_tools());
    }

    #[test]
    fn tool_policy_controls_resolution_rules() {
        let runtime = AgentLoopRuntime::new();
        assert!(runtime.tool_requires_approval("propose_terminal_command"));
        assert!(runtime.tool_requires_external_result("lookup_web"));
        assert!(!runtime.tool_requires_external_result("plan_execution"));
    }
}
