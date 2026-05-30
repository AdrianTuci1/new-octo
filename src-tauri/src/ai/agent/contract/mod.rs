//! Typed loader and validator for the declarative agent loop contract.
//!
//! `loop.json` is the machine-readable source of truth.
//! This module exists to deserialize it, validate its coherence, and expose
//! helpers used by the runtime and UI command layer.

use std::collections::HashSet;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use super::types::AgentRunStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLoopContract {
    pub id: String,
    pub version: String,
    pub status: String,
    pub description: String,
    pub run_status_mapping: AgentLoopRunStatusMapping,
    pub shared_decision_types: Vec<String>,
    pub shared_tool_names: Vec<String>,
    #[serde(default)]
    pub tool_policies: Vec<AgentToolPolicy>,
    pub stages: Vec<AgentLoopStage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLoopRunStatusMapping {
    pub preparing: String,
    pub reasoning: String,
    pub planning: String,
    pub tool_selection: String,
    pub awaiting_approval: String,
    pub executing: String,
    pub verifying: String,
    pub completed: String,
    pub failed: String,
    pub cancelled: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLoopStage {
    pub id: String,
    pub display_name: String,
    pub primary_actor: String,
    pub purpose: String,
    pub inputs: Vec<String>,
    pub allowed_tools: Vec<String>,
    pub allowed_decisions: Vec<AgentLoopDecision>,
    pub emitted_events: Vec<String>,
    #[serde(default)]
    pub transitions: Vec<AgentLoopTransition>,
    pub next_stages: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLoopTransition {
    pub event_id: String,
    pub target_stage_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLoopDecision {
    pub id: String,
    pub actor: String,
    #[serde(rename = "type")]
    pub decision_type: String,
    pub description: String,
    #[serde(default)]
    pub tool: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentToolMatchKind {
    Exact,
    Prefix,
}

fn default_tool_match_kind() -> AgentToolMatchKind {
    AgentToolMatchKind::Exact
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolPolicy {
    pub pattern: String,
    #[serde(default = "default_tool_match_kind")]
    pub match_kind: AgentToolMatchKind,
    #[serde(default)]
    pub allowed_stages: Vec<String>,
    #[serde(default)]
    pub requires_approval: bool,
    #[serde(default)]
    pub requires_external_result: bool,
}

impl AgentToolPolicy {
    pub fn matches(&self, tool_name: &str) -> bool {
        match self.match_kind {
            AgentToolMatchKind::Exact => self.pattern == tool_name,
            AgentToolMatchKind::Prefix => tool_name.starts_with(&self.pattern),
        }
    }
}

static LOOP_CONTRACT: OnceLock<AgentLoopContract> = OnceLock::new();

pub fn get_loop_contract() -> &'static AgentLoopContract {
    LOOP_CONTRACT.get_or_init(|| {
        let raw = include_str!("loop.json");
        let contract: AgentLoopContract = serde_json::from_str(raw)
            .expect("contract/loop.json must be valid AgentLoopContract JSON");
        validate_loop_contract(&contract)
            .expect("contract/loop.json must define a coherent stage graph");
        contract
    })
}

pub fn agent_get_loop_contract() -> Result<AgentLoopContract, String> {
    Ok(get_loop_contract().clone())
}

pub fn validate_loop_contract(contract: &AgentLoopContract) -> Result<(), String> {
    if contract.id.trim().is_empty() {
        return Err("loop contract id cannot be empty".to_string());
    }

    if contract.stages.is_empty() {
        return Err("loop contract must define at least one stage".to_string());
    }

    let stage_ids = contract
        .stages
        .iter()
        .map(|stage| stage.id.trim().to_string())
        .collect::<Vec<_>>();
    let stage_id_set = stage_ids.iter().cloned().collect::<HashSet<_>>();

    if stage_ids.len() != stage_id_set.len() {
        return Err("loop contract contains duplicate stage ids".to_string());
    }

    for stage in &contract.stages {
        if stage.id.trim().is_empty() {
            return Err("loop contract contains a stage with an empty id".to_string());
        }

        if stage.display_name.trim().is_empty() {
            return Err(format!("stage '{}' is missing displayName", stage.id));
        }

        for next_stage in &stage.next_stages {
            if !stage_id_set.contains(next_stage) {
                return Err(format!(
                    "stage '{}' references unknown next stage '{}'",
                    stage.id, next_stage
                ));
            }
        }

        for transition in &stage.transitions {
            if transition.event_id.trim().is_empty() {
                return Err(format!("stage '{}' has a transition with an empty eventId", stage.id));
            }

            if !stage_id_set.contains(&transition.target_stage_id) {
                return Err(format!(
                    "stage '{}' transition '{}' references unknown target stage '{}'",
                    stage.id, transition.event_id, transition.target_stage_id
                ));
            }

            if !stage.next_stages.iter().any(|next| next == &transition.target_stage_id) {
                return Err(format!(
                    "stage '{}' transition '{}' targets '{}' which is missing from nextStages",
                    stage.id, transition.event_id, transition.target_stage_id
                ));
            }
        }
    }

    for policy in &contract.tool_policies {
        if policy.pattern.trim().is_empty() {
            return Err("tool policy pattern cannot be empty".to_string());
        }

        for stage_id in &policy.allowed_stages {
            if !stage_id_set.contains(stage_id) {
                return Err(format!(
                    "tool policy '{}' references unknown allowed stage '{}'",
                    policy.pattern, stage_id
                ));
            }
        }
    }

    Ok(())
}

pub fn find_stage(stage_id: &str) -> Option<&'static AgentLoopStage> {
    get_loop_contract()
        .stages
        .iter()
        .find(|stage| stage.id == stage_id)
}

pub fn resolve_stage_transition(
    stage_id: &str,
    event_id: &str,
) -> Option<&'static AgentLoopTransition> {
    find_stage(stage_id)?
        .transitions
        .iter()
        .find(|transition| transition.event_id == event_id)
}

pub fn find_tool_policy(tool_name: &str) -> Option<&'static AgentToolPolicy> {
    get_loop_contract()
        .tool_policies
        .iter()
        .find(|policy| policy.matches(tool_name))
}

pub fn stage_id_for_status(status: AgentRunStatus) -> &'static str {
    let mapping = &get_loop_contract().run_status_mapping;
    match status {
        AgentRunStatus::Queued => "preparing",
        AgentRunStatus::Preparing => mapping.preparing.as_str(),
        AgentRunStatus::Running => mapping.reasoning.as_str(),
        AgentRunStatus::WaitingForTool => mapping.awaiting_approval.as_str(),
        AgentRunStatus::Completed => mapping.completed.as_str(),
        AgentRunStatus::Cancelled => mapping.cancelled.as_str(),
        AgentRunStatus::Failed => mapping.failed.as_str(),
    }
}
