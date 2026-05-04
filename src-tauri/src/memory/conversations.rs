use std::{collections::HashSet, path::Path};

use serde_json::{json, Value};
use uuid::Uuid;

use crate::memory::{
    paths::MemoryPaths,
    storage::{
        now_string, read_json_or_default, relative_time_label, safe_file_component,
        truncate_chars, write_json_atomic,
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
    let mut index = read_json_or_default::<MemoryConversationIndex>(&paths.conversation_index_path())
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

pub(crate) fn summary_from_conversation(record: &MemoryConversationRecord) -> MemoryConversationSummary {
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
    let mut exchanges = Vec::<MemoryExchangeRecord>::new();
    let mut current_exchange: Option<MemoryExchangeRecord> = None;
    let mut tool_task_ids = Vec::<String>::new();
    let mut tool_tasks = Vec::<MemoryTaskRecord>::new();
    let mut seen_tool_tasks = HashSet::<String>::new();

    for message in messages {
        let role = message_string(message, "role").unwrap_or_default();
        let message_id =
            message_string(message, "id").unwrap_or_else(|| format!("message_{}", Uuid::new_v4()));

        if role == "user" {
            if let Some(mut exchange) = current_exchange.take() {
                finalize_exchange(&mut exchange, messages);
                exchanges.push(exchange);
            }

            current_exchange = Some(MemoryExchangeRecord {
                id: format!(
                    "exchange_{}_{}",
                    safe_file_component(conversation_id),
                    exchanges.len() + 1
                ),
                task_id: root_task_id.clone(),
                parent_exchange_id: None,
                input_message_ids: vec![message_id],
                output_message_ids: Vec::new(),
                tool_call_ids: Vec::new(),
                status: "streaming".to_string(),
                started_at: message_string(message, "createdAt").unwrap_or_else(now_string),
                finished_at: None,
            });
            continue;
        }

        if current_exchange.is_none() {
            current_exchange = Some(MemoryExchangeRecord {
                id: format!(
                    "exchange_{}_{}",
                    safe_file_component(conversation_id),
                    exchanges.len() + 1
                ),
                task_id: root_task_id.clone(),
                parent_exchange_id: None,
                input_message_ids: Vec::new(),
                output_message_ids: Vec::new(),
                tool_call_ids: Vec::new(),
                status: "streaming".to_string(),
                started_at: message_string(message, "createdAt").unwrap_or_else(now_string),
                finished_at: None,
            });
        }

        if let Some(exchange) = &mut current_exchange {
            exchange.output_message_ids.push(message_id);
            for (tool_call_id, tool_name) in tool_calls_from_message(message) {
                if !exchange.tool_call_ids.contains(&tool_call_id) {
                    exchange.tool_call_ids.push(tool_call_id.clone());
                }
                let tool_task_id = format!("task_tool_{}", safe_file_component(&tool_call_id));
                if seen_tool_tasks.insert(tool_task_id.clone()) {
                    tool_task_ids.push(tool_task_id.clone());
                    tool_tasks.push(MemoryTaskRecord {
                        id: tool_task_id,
                        parent_task_id: Some(root_task_id.clone()),
                        kind: "tool".to_string(),
                        title: tool_name.unwrap_or_else(|| "Tool call".to_string()),
                        status: "completed".to_string(),
                        exchange_ids: Vec::new(),
                        child_task_ids: Vec::new(),
                        created_at: message_string(message, "createdAt").unwrap_or_else(now_string),
                        updated_at: updated_at.to_string(),
                        metadata: json!({ "toolCallId": tool_call_id }),
                    });
                }
            }
        }
    }

    if let Some(mut exchange) = current_exchange {
        finalize_exchange(&mut exchange, messages);
        exchanges.push(exchange);
    }

    let root_task = MemoryTaskRecord {
        id: root_task_id.clone(),
        parent_task_id: None,
        kind: "root".to_string(),
        title: title.to_string(),
        status: status.to_string(),
        exchange_ids: exchanges.iter().map(|exchange| exchange.id.clone()).collect(),
        child_task_ids: tool_task_ids,
        created_at: created_at.to_string(),
        updated_at: updated_at.to_string(),
        metadata: json!({ "conversationId": conversation_id }),
    };

    let mut tasks = vec![root_task];
    tasks.extend(tool_tasks);
    (root_task_id, tasks, exchanges)
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
    value.get(key).and_then(Value::as_str).map(|value| value.to_string())
}
