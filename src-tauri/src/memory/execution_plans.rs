use serde_json::Value;

use crate::memory::storage::safe_file_component;

#[derive(Debug, Clone)]
pub(crate) struct ExecutionPlanStepState {
    pub id: String,
    pub label: String,
    pub status: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ExecutionPlanWorkstreamState {
    pub id: String,
    pub title: String,
    pub status: String,
    pub step_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct ExecutionPlanSnapshot {
    pub id: String,
    pub title: String,
    pub summary: Option<String>,
    pub version: Option<String>,
    pub steps: Vec<ExecutionPlanStepState>,
    pub workstreams: Vec<ExecutionPlanWorkstreamState>,
    pub message_index: usize,
}

pub(crate) fn collect_execution_plan_snapshots(messages: &[Value]) -> Vec<ExecutionPlanSnapshot> {
    messages
        .iter()
        .enumerate()
        .filter_map(|(message_index, message)| {
            let tool_kind = message
                .get("toolKind")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if tool_kind != "plan" {
                return None;
            }

            let execution_plan = message.get("executionPlan")?;
            let id = execution_plan
                .get("id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?
                .to_string();
            let title = execution_plan
                .get("title")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())?
                .to_string();
            let steps = execution_plan
                .get("steps")
                .and_then(Value::as_array)
                .map(|steps| {
                    steps
                        .iter()
                        .enumerate()
                        .filter_map(|(step_index, step)| normalize_step(step, step_index))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let workstreams = execution_plan
                .get("workstreams")
                .and_then(Value::as_array)
                .map(|workstreams| {
                    workstreams
                        .iter()
                        .enumerate()
                        .filter_map(|(workstream_index, workstream)| {
                            normalize_workstream(workstream, workstream_index)
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if steps.is_empty() {
                return None;
            }

            Some(ExecutionPlanSnapshot {
                id,
                title,
                summary: execution_plan
                    .get("summary")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string),
                version: execution_plan
                    .get("version")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string),
                steps,
                workstreams,
                message_index,
            })
        })
        .collect()
}

pub(crate) fn current_plan_snapshot_for_exchange(
    snapshots: &[ExecutionPlanSnapshot],
    exchange_start_message_index: usize,
) -> Option<&ExecutionPlanSnapshot> {
    snapshots
        .iter()
        .rev()
        .find(|snapshot| snapshot.message_index <= exchange_start_message_index)
}

pub(crate) fn active_step(
    snapshot: &ExecutionPlanSnapshot,
) -> Option<(usize, &ExecutionPlanStepState)> {
    snapshot
        .steps
        .iter()
        .enumerate()
        .find(|(_, step)| step.status == "inProgress")
        .or_else(|| {
            snapshot
                .steps
                .iter()
                .enumerate()
                .find(|(_, step)| step.status == "failed")
        })
        .or_else(|| {
            snapshot
                .steps
                .iter()
                .enumerate()
                .find(|(_, step)| step.status == "pending")
        })
        .or_else(|| snapshot.steps.iter().enumerate().last())
}

pub(crate) fn step_status(snapshot: &ExecutionPlanSnapshot, step_index: usize) -> &'static str {
    match snapshot.steps[step_index].status.as_str() {
        "completed" => "completed",
        "inProgress" => "inProgress",
        "failed" => "failed",
        _ => "pending",
    }
}

pub(crate) fn step_task_id(plan_id: &str, step_id: &str) -> String {
    format!(
        "task_plan_{}_{}",
        safe_file_component(plan_id),
        safe_file_component(step_id)
    )
}

pub(crate) fn active_workstream_for_step<'a>(
    snapshot: &'a ExecutionPlanSnapshot,
    step_id: &str,
) -> Option<&'a ExecutionPlanWorkstreamState> {
    snapshot
        .workstreams
        .iter()
        .filter(|workstream| {
            workstream
                .step_ids
                .iter()
                .any(|candidate| candidate == step_id)
        })
        .find(|workstream| workstream.status == "inProgress")
        .or_else(|| {
            snapshot
                .workstreams
                .iter()
                .filter(|workstream| {
                    workstream
                        .step_ids
                        .iter()
                        .any(|candidate| candidate == step_id)
                })
                .find(|workstream| workstream.status == "failed")
        })
        .or_else(|| {
            snapshot
                .workstreams
                .iter()
                .filter(|workstream| {
                    workstream
                        .step_ids
                        .iter()
                        .any(|candidate| candidate == step_id)
                })
                .find(|workstream| workstream.status == "pending")
        })
}

pub(crate) fn workstream_task_id(plan_id: &str, workstream_id: &str) -> String {
    format!(
        "task_workstream_{}_{}",
        safe_file_component(plan_id),
        safe_file_component(workstream_id)
    )
}

fn normalize_step(step: &Value, step_index: usize) -> Option<ExecutionPlanStepState> {
    let label = step
        .get("label")
        .or_else(|| step.get("title"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?
        .to_string();

    let id = step
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("step-{}", step_index + 1));

    Some(ExecutionPlanStepState {
        id,
        label,
        status: match step.get("status").and_then(Value::as_str) {
            Some("inProgress") => "inProgress".to_string(),
            Some("failed") => "failed".to_string(),
            Some("completed") => "completed".to_string(),
            _ if step
                .get("completed")
                .and_then(Value::as_bool)
                .unwrap_or(false) =>
            {
                "completed".to_string()
            }
            _ => "pending".to_string(),
        },
    })
}

fn normalize_workstream(
    workstream: &Value,
    workstream_index: usize,
) -> Option<ExecutionPlanWorkstreamState> {
    let title = workstream
        .get("title")
        .or_else(|| workstream.get("label"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?
        .to_string();

    let id = workstream
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("workstream-{}", workstream_index + 1));

    let step_ids = workstream
        .get("stepIds")
        .and_then(Value::as_array)
        .map(|step_ids| {
            step_ids
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|step_id| !step_id.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Some(ExecutionPlanWorkstreamState {
        id,
        title,
        status: match workstream.get("status").and_then(Value::as_str) {
            Some("inProgress") => "inProgress".to_string(),
            Some("failed") => "failed".to_string(),
            Some("completed") => "completed".to_string(),
            _ => "pending".to_string(),
        },
        step_ids,
    })
}
