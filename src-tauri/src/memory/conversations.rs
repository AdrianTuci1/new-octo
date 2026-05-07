use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use serde_json::{json, Value};
use uuid::Uuid;

use crate::memory::{
    execution_plans::{
        active_step, active_workstream_for_step, collect_execution_plan_snapshots,
        current_plan_snapshot_for_exchange, step_status, step_task_id, workstream_task_id,
    },
    paths::MemoryPaths,
    storage::{
        now_string, read_json_or_default, relative_time_label, safe_file_component, truncate_chars,
        write_json_atomic,
    },
    types::{
        MemoryConversationIndex, MemoryConversationRecord, MemoryConversationSummary,
        MemoryExchangeRecord, MemoryTaskRecord,
    },
};

pub(crate) fn upsert_conversation_summary(
    paths: &MemoryPaths,
    summary: MemoryConversationSummary,
) -> Result<(), String> {
    let mut index =
        read_json_or_default::<MemoryConversationIndex>(&paths.conversation_index_path())
            .unwrap_or_default();
    index
        .conversations
        .retain(|conversation| conversation.id != summary.id);
    index.conversations.push(summary);
    index
        .conversations
        .sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    write_json_atomic(&paths.conversation_index_path(), &index)
}

pub(crate) fn summary_from_conversation(
    record: &MemoryConversationRecord,
) -> MemoryConversationSummary {
    MemoryConversationSummary {
        id: record.id.clone(),
        title: record.title.clone(),
        status: record.status.clone(),
        model_id: record.model_id.clone(),
        cwd: record.cwd.clone(),
        message_count: record.messages.len(),
        branch_label: record.cwd.as_ref().and_then(|cwd| {
            Path::new(cwd)
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.to_string())
        }),
        time_label: relative_time_label(&record.updated_at),
        created_at: record.created_at.clone(),
        updated_at: record.updated_at.clone(),
        server_conversation_token: record.server_conversation_token.clone(),
        sync_state: record.sync_state.clone(),
    }
}

pub(crate) fn derive_task_store(
    conversation_id: &str,
    title: &str,
    status: &str,
    messages: &[Value],
    created_at: &str,
    updated_at: &str,
) -> (String, Vec<MemoryTaskRecord>, Vec<MemoryExchangeRecord>) {
    let root_task_id = format!("task_root_{}", safe_file_component(conversation_id));
    let mut built_exchanges = Vec::<BuiltExchange>::new();
    let mut current_exchange: Option<BuiltExchange> = None;
    let mut tool_calls = HashMap::<String, ToolCallState>::new();

    for (message_index, message) in messages.iter().enumerate() {
        let role = message_string(message, "role").unwrap_or_default();
        let message_id =
            message_string(message, "id").unwrap_or_else(|| format!("message_{}", Uuid::new_v4()));

        if role == "user" {
            if let Some(mut exchange) = current_exchange.take() {
                finalize_exchange(&mut exchange.record, messages);
                built_exchanges.push(exchange);
            }

            current_exchange = Some(BuiltExchange::new(
                conversation_id,
                built_exchanges.len() + 1,
                root_task_id.clone(),
                message_index,
                message_string(message, "createdAt").unwrap_or_else(now_string),
                vec![message_id],
            ));
            continue;
        }

        if current_exchange.is_none() {
            current_exchange = Some(BuiltExchange::new(
                conversation_id,
                built_exchanges.len() + 1,
                root_task_id.clone(),
                message_index,
                message_string(message, "createdAt").unwrap_or_else(now_string),
                Vec::new(),
            ));
        }

        if let Some(exchange) = &mut current_exchange {
            exchange.record.output_message_ids.push(message_id);
            for (tool_call_id, tool_name) in tool_calls_from_message(message) {
                if !exchange.record.tool_call_ids.contains(&tool_call_id) {
                    exchange.record.tool_call_ids.push(tool_call_id.clone());
                }
                tool_calls
                    .entry(tool_call_id.clone())
                    .and_modify(|state| {
                        if state.title.is_none() {
                            state.title = tool_name.clone();
                        }
                    })
                    .or_insert_with(|| ToolCallState {
                        title: tool_name,
                        created_at: message_string(message, "createdAt").unwrap_or_else(now_string),
                    });
            }
        }
    }

    if let Some(mut exchange) = current_exchange {
        finalize_exchange(&mut exchange.record, messages);
        built_exchanges.push(exchange);
    }

    let plan_snapshots = collect_execution_plan_snapshots(messages);
    let latest_plan_snapshot = plan_snapshots.last();
    let current_task_id = latest_plan_snapshot.and_then(|snapshot| {
        active_step(snapshot).map(|(_, step)| {
            active_workstream_for_step(snapshot, &step.id)
                .map(|workstream| workstream_task_id(&snapshot.id, &workstream.id))
                .unwrap_or_else(|| step_task_id(&snapshot.id, &step.id))
        })
    });

    for exchange in &mut built_exchanges {
        let assigned_task_id =
            current_plan_snapshot_for_exchange(&plan_snapshots, exchange.start_message_index)
                .and_then(|snapshot| {
                    active_step(snapshot).map(|(_, step)| {
                        active_workstream_for_step(snapshot, &step.id)
                            .map(|workstream| workstream_task_id(&snapshot.id, &workstream.id))
                            .unwrap_or_else(|| step_task_id(&snapshot.id, &step.id))
                    })
                })
                .unwrap_or_else(|| root_task_id.clone());
        exchange.record.task_id = assigned_task_id;
    }

    let mut root_child_task_ids = Vec::<String>::new();
    let mut plan_tasks = Vec::<MemoryTaskRecord>::new();
    let mut plan_task_index_by_id = HashMap::<String, usize>::new();
    let mut workstream_tasks = Vec::<MemoryTaskRecord>::new();
    let mut workstream_task_index_by_id = HashMap::<String, usize>::new();

    if let Some(snapshot) = latest_plan_snapshot {
        for (step_index, step) in snapshot.steps.iter().enumerate() {
            let task_id = step_task_id(&snapshot.id, &step.id);
            root_child_task_ids.push(task_id.clone());
            plan_task_index_by_id.insert(task_id.clone(), plan_tasks.len());
            plan_tasks.push(MemoryTaskRecord {
                id: task_id,
                parent_task_id: Some(root_task_id.clone()),
                kind: "plan-step".to_string(),
                title: step.label.clone(),
                status: step_status(snapshot, step_index).to_string(),
                exchange_ids: Vec::new(),
                child_task_ids: Vec::new(),
                created_at: created_at.to_string(),
                updated_at: updated_at.to_string(),
                metadata: json!({
                    "planArtifactId": snapshot.id,
                    "planTitle": snapshot.title,
                    "planVersion": snapshot.version,
                    "planSummary": snapshot.summary,
                    "stepId": step.id,
                    "stepIndex": step_index,
                }),
            });
        }

        for workstream in &snapshot.workstreams {
            let task_id = workstream_task_id(&snapshot.id, &workstream.id);
            let parent_task_id = workstream
                .step_ids
                .first()
                .map(|step_id| step_task_id(&snapshot.id, step_id))
                .unwrap_or_else(|| root_task_id.clone());

            if parent_task_id == root_task_id {
                root_child_task_ids.push(task_id.clone());
            } else if let Some(parent_index) = plan_task_index_by_id.get(&parent_task_id) {
                plan_tasks[*parent_index]
                    .child_task_ids
                    .push(task_id.clone());
            }

            workstream_task_index_by_id.insert(task_id.clone(), workstream_tasks.len());
            workstream_tasks.push(MemoryTaskRecord {
                id: task_id,
                parent_task_id: Some(parent_task_id),
                kind: "workstream".to_string(),
                title: workstream.title.clone(),
                status: workstream.status.clone(),
                exchange_ids: Vec::new(),
                child_task_ids: Vec::new(),
                created_at: created_at.to_string(),
                updated_at: updated_at.to_string(),
                metadata: json!({
                    "planArtifactId": snapshot.id,
                    "workstreamId": workstream.id,
                    "stepIds": workstream.step_ids,
                }),
            });
        }
    }

    for exchange in &built_exchanges {
        if let Some(index) = plan_task_index_by_id.get(&exchange.record.task_id) {
            plan_tasks[*index]
                .exchange_ids
                .push(exchange.record.id.clone());
        } else if let Some(index) = workstream_task_index_by_id.get(&exchange.record.task_id) {
            workstream_tasks[*index]
                .exchange_ids
                .push(exchange.record.id.clone());
        }
    }

    let mut tool_tasks = Vec::<MemoryTaskRecord>::new();
    let mut tool_task_index_by_id = HashMap::<String, usize>::new();

    for exchange in &built_exchanges {
        for tool_call_id in &exchange.record.tool_call_ids {
            let tool_task_id = format!("task_tool_{}", safe_file_component(tool_call_id));
            if let Some(existing_index) = tool_task_index_by_id.get(&tool_task_id) {
                let task = &mut tool_tasks[*existing_index];
                if !task.exchange_ids.contains(&exchange.record.id) {
                    task.exchange_ids.push(exchange.record.id.clone());
                }
                continue;
            }

            let parent_task_id = exchange.record.task_id.clone();
            let metadata = json!({
                "toolCallId": tool_call_id,
                "assignedTaskId": parent_task_id,
            });
            let created_at = tool_calls
                .get(tool_call_id)
                .map(|state| state.created_at.clone())
                .unwrap_or_else(now_string);
            let title = tool_calls
                .get(tool_call_id)
                .and_then(|state| state.title.clone())
                .unwrap_or_else(|| "Tool call".to_string());

            if parent_task_id == root_task_id {
                root_child_task_ids.push(tool_task_id.clone());
            } else if let Some(index) = plan_task_index_by_id.get(&parent_task_id) {
                plan_tasks[*index].child_task_ids.push(tool_task_id.clone());
            } else if let Some(index) = workstream_task_index_by_id.get(&parent_task_id) {
                workstream_tasks[*index]
                    .child_task_ids
                    .push(tool_task_id.clone());
            }

            tool_task_index_by_id.insert(tool_task_id.clone(), tool_tasks.len());
            tool_tasks.push(MemoryTaskRecord {
                id: tool_task_id,
                parent_task_id: Some(parent_task_id),
                kind: "tool".to_string(),
                title,
                status: if exchange.record.status == "error" {
                    "error".to_string()
                } else {
                    "completed".to_string()
                },
                exchange_ids: vec![exchange.record.id.clone()],
                child_task_ids: Vec::new(),
                created_at,
                updated_at: updated_at.to_string(),
                metadata,
            });
        }
    }

    let root_task = MemoryTaskRecord {
        id: root_task_id.clone(),
        parent_task_id: None,
        kind: "root".to_string(),
        title: title.to_string(),
        status: status.to_string(),
        exchange_ids: built_exchanges
            .iter()
            .map(|exchange| exchange.record.id.clone())
            .collect(),
        child_task_ids: root_child_task_ids,
        created_at: created_at.to_string(),
        updated_at: updated_at.to_string(),
        metadata: json!({
            "conversationId": conversation_id,
            "activePlanId": latest_plan_snapshot.map(|snapshot| snapshot.id.clone()),
            "currentTaskId": current_task_id,
        }),
    };

    let mut tasks = vec![root_task];
    tasks.extend(plan_tasks);
    tasks.extend(workstream_tasks);
    tasks.extend(tool_tasks);
    (
        root_task_id,
        tasks,
        built_exchanges
            .into_iter()
            .map(|exchange| exchange.record)
            .collect(),
    )
}

fn finalize_exchange(exchange: &mut MemoryExchangeRecord, messages: &[Value]) {
    let relevant_message_ids = exchange
        .input_message_ids
        .iter()
        .chain(exchange.output_message_ids.iter())
        .cloned()
        .collect::<HashSet<_>>();
    let relevant_messages = messages
        .iter()
        .filter(|message| {
            message_string(message, "id")
                .as_ref()
                .is_some_and(|id| relevant_message_ids.contains(id))
        })
        .collect::<Vec<_>>();

    if relevant_messages.iter().any(|message| {
        message
            .get("isError")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }) {
        exchange.status = "error".to_string();
        exchange.finished_at = Some(now_string());
        return;
    }

    if relevant_messages.iter().any(|message| {
        message
            .get("isStreaming")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }) {
        exchange.status = "streaming".to_string();
        exchange.finished_at = None;
        return;
    }

    exchange.status = "completed".to_string();
    exchange.finished_at = relevant_messages
        .iter()
        .filter_map(|message| message_string(message, "createdAt"))
        .max()
        .or_else(|| Some(now_string()));
}

pub(crate) fn title_from_messages(messages: &[Value]) -> String {
    let title = messages
        .iter()
        .find(|message| {
            message_string(message, "role").as_deref() == Some("assistant")
                && !message
                    .get("isError")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                && message_string(message, "body")
                    .as_ref()
                    .is_some_and(|body| !body.trim().is_empty())
        })
        .and_then(|message| message_string(message, "body"))
        .or_else(|| {
            messages
                .iter()
                .find(|message| message_string(message, "role").as_deref() == Some("user"))
                .and_then(|message| message_string(message, "body"))
        })
        .or_else(|| {
            messages
                .iter()
                .find(|message| message_string(message, "role").as_deref() == Some("user"))
                .and_then(|message| message_string(message, "content"))
        })
        .unwrap_or_else(|| "New agent conversation".to_string());

    let normalized = title.split_whitespace().collect::<Vec<_>>().join(" ");
    truncate_chars(&normalized, 80)
}

pub(crate) fn status_from_messages(messages: &[Value]) -> String {
    if messages.iter().any(|message| {
        message
            .get("isError")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }) {
        return "error".to_string();
    }

    if messages.iter().any(|message| {
        message
            .get("isStreaming")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }) {
        return "inProgress".to_string();
    }

    "success".to_string()
}

pub(crate) fn first_message_created_at(messages: &[Value]) -> Option<String> {
    messages
        .iter()
        .filter_map(|message| message_string(message, "createdAt"))
        .min()
}

fn tool_calls_from_message(message: &Value) -> Vec<(String, Option<String>)> {
    let mut calls = Vec::new();
    if let Some(tool_call_id) = message_string(message, "toolCallId") {
        calls.push((tool_call_id, Some("Tool result".to_string())));
    }

    if let Some(tool_calls) = message.get("toolCalls").and_then(Value::as_array) {
        for call in tool_calls {
            let Some(id) = message_string(call, "id") else {
                continue;
            };
            let name = call
                .get("function")
                .and_then(|function| message_string(function, "name"))
                .or_else(|| message_string(call, "name"));
            calls.push((id, name));
        }
    }

    calls
}

fn message_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|value| value.to_string())
}

struct BuiltExchange {
    record: MemoryExchangeRecord,
    start_message_index: usize,
}

impl BuiltExchange {
    fn new(
        conversation_id: &str,
        sequence: usize,
        root_task_id: String,
        start_message_index: usize,
        started_at: String,
        input_message_ids: Vec<String>,
    ) -> Self {
        Self {
            record: MemoryExchangeRecord {
                id: format!(
                    "exchange_{}_{}",
                    safe_file_component(conversation_id),
                    sequence
                ),
                task_id: root_task_id,
                parent_exchange_id: None,
                input_message_ids,
                output_message_ids: Vec::new(),
                tool_call_ids: Vec::new(),
                status: "streaming".to_string(),
                started_at,
                finished_at: None,
            },
            start_message_index,
        }
    }
}

struct ToolCallState {
    title: Option<String>,
    created_at: String,
}
