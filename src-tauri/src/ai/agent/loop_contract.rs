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
    pub next_stages: Vec<String>,
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

static LOOP_CONTRACT: OnceLock<AgentLoopContract> = OnceLock::new();

pub fn get_loop_contract() -> &'static AgentLoopContract {
    LOOP_CONTRACT.get_or_init(|| {
        let raw = include_str!("loop_contract.json");
        let contract: AgentLoopContract = serde_json::from_str(raw)
            .expect("loop_contract.json must be valid AgentLoopContract JSON");
        validate_loop_contract(&contract)
            .expect("loop_contract.json must define a coherent stage graph");
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
    }

    Ok(())
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
