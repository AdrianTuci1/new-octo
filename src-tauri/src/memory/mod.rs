mod cloud;
mod conversations;
mod paths;
mod storage;
mod sync;
mod types;

use std::{collections::HashSet, fs};

use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::memory::{
    cloud::{summary_from_cloud_object, upsert_cloud_object_summary},
    conversations::{
        derive_task_store, first_message_created_at, status_from_messages,
        summary_from_conversation, title_from_messages, upsert_conversation_summary,
    },
    storage::{merge_values, now_string, read_json_or_default, write_json_atomic},
    sync::{enqueue_sync_operation_inner, sync_status_from_queue},
    types::*,
};

pub use paths::OctomusMemoryManager;

const EVENT_WORKSPACE_UPDATED: &str = "memory:workspace-updated";
const EVENT_CONVERSATION_UPDATED: &str = "memory:conversation-updated";

#[tauri::command]
pub fn memory_bootstrap(
    manager: State<'_, OctomusMemoryManager>,
) -> Result<OctomusMemoryBootstrap, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    let paths = &manager.paths;
    paths.ensure_layout()?;

    let meta = read_json_or_default::<MemoryMeta>(&paths.meta_path()).unwrap_or_else(|| {
        let now = now_string();
        MemoryMeta {
            schema_version: MEMORY_SCHEMA_VERSION,
            device_id: format!("octomus-device-{}", Uuid::new_v4()),
            created_at: now.clone(),
            updated_at: now,
            sync_endpoint: None,
        }
    });
    let settings = read_json_or_default::<MemorySettingsRecord>(&paths.settings_path())
        .unwrap_or_else(MemorySettingsRecord::default);
    let workspace = read_json_or_default::<MemoryWorkspaceSnapshot>(&paths.workspace_path());
    let conversation_index =
        read_json_or_default::<MemoryConversationIndex>(&paths.conversation_index_path())
            .unwrap_or_default();
    let cloud_index = read_json_or_default::<MemoryCloudObjectIndex>(&paths.cloud_index_path())
        .unwrap_or_default();
    let sync_queue =
        read_json_or_default::<MemorySyncQueue>(&paths.sync_queue_path()).unwrap_or_default();
    let sync_status = sync_status_from_queue(paths, &meta, &sync_queue, None);

    Ok(OctomusMemoryBootstrap {
        root_path: paths.root.to_string_lossy().to_string(),
        schema_version: MEMORY_SCHEMA_VERSION,
        meta,
        workspace,
        settings,
        conversations: conversation_index.conversations,
        cloud_index,
        sync_status,
    })
}

#[tauri::command]
pub fn memory_put_settings(
    manager: State<'_, OctomusMemoryManager>,
    request: MemorySettingsPutRequest,
) -> Result<MemorySettingsRecord, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    let paths = &manager.paths;
    paths.ensure_layout()?;

    let mut record = read_json_or_default::<MemorySettingsRecord>(&paths.settings_path())
        .unwrap_or_else(MemorySettingsRecord::default);
    record.schema_version = MEMORY_SCHEMA_VERSION;
    record.updated_at = now_string();
    record.values = if request.merge {
        merge_values(record.values, request.values)
    } else {
        request.values
    };

    write_json_atomic(&paths.settings_path(), &record)?;

    let mut meta = read_json_or_default::<MemoryMeta>(&paths.meta_path())
        .ok_or_else(|| "memory metadata is unavailable after layout initialization".to_string())?;
    if let Some(endpoint) = record
        .values
        .get("syncEndpoint")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        meta.sync_endpoint = Some(endpoint.to_string());
        meta.updated_at = now_string();
        write_json_atomic(&paths.meta_path(), &meta)?;
    }

    enqueue_sync_operation_inner(
        paths,
        MemorySyncOperationRequest {
            object_uid: "settings/global".to_string(),
            object_kind: "settings".to_string(),
            operation: "upsert".to_string(),
            payload: json!({ "settings": record }),
        },
    )?;

    Ok(record)
}

#[tauri::command]
pub fn memory_put_workspace_snapshot(
    app: AppHandle,
    manager: State<'_, OctomusMemoryManager>,
    request: MemoryWorkspacePutRequest,
) -> Result<MemoryWorkspaceSnapshot, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    let paths = &manager.paths;
    paths.ensure_layout()?;

    let mut snapshot = request.snapshot;
    snapshot.id = if snapshot.id.trim().is_empty() {
        DEFAULT_WORKSPACE_ID.to_string()
    } else {
        snapshot.id
    };
    snapshot.schema_version = MEMORY_SCHEMA_VERSION;
    snapshot.updated_at = now_string();
    write_json_atomic(&paths.workspace_path(), &snapshot)?;

    enqueue_sync_operation_inner(
        paths,
        MemorySyncOperationRequest {
            object_uid: format!("workspace/{}", snapshot.id),
            object_kind: "workspace".to_string(),
            operation: "upsert".to_string(),
            payload: json!({ "workspace": snapshot }),
        },
    )?;

    let _ = app.emit(EVENT_WORKSPACE_UPDATED, &snapshot);

    Ok(snapshot)
}

#[tauri::command]
pub fn memory_put_conversation(
    app: AppHandle,
    manager: State<'_, OctomusMemoryManager>,
    request: MemoryConversationPutRequest,
) -> Result<MemoryConversationRecord, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    let paths = &manager.paths;
    paths.ensure_layout()?;

    let conversation_id = request.conversation_id.trim();
    if conversation_id.is_empty() {
        return Err("conversation id cannot be empty".to_string());
    }

    let existing =
        read_json_or_default::<MemoryConversationRecord>(&paths.conversation_path(conversation_id));
    let now = now_string();
    let created_at = existing
        .as_ref()
        .map(|conversation| conversation.created_at.clone())
        .or_else(|| first_message_created_at(&request.messages))
        .unwrap_or_else(|| now.clone());
    let title = request
        .title
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| title_from_messages(&request.messages));
    let status = request
        .status
        .filter(|status| !status.trim().is_empty())
        .unwrap_or_else(|| status_from_messages(&request.messages));
    let server_token = request.server_conversation_token.or_else(|| {
        existing
            .as_ref()
            .and_then(|conversation| conversation.server_conversation_token.clone())
    });
    let sync_state = MemorySyncState {
        status: if server_token.is_some() {
            "dirty".to_string()
        } else {
            "local".to_string()
        },
        server_token: server_token.clone(),
        last_synced_at: existing
            .as_ref()
            .and_then(|conversation| conversation.sync_state.last_synced_at.clone()),
        last_error: None,
    };
    let (root_task_id, tasks, exchanges) = derive_task_store(
        conversation_id,
        &title,
        &status,
        &request.messages,
        &created_at,
        &now,
    );

    let record = MemoryConversationRecord {
        id: conversation_id.to_string(),
        schema_version: MEMORY_SCHEMA_VERSION,
        title,
        status,
        model_id: request.model_id,
        cwd: request.cwd,
        created_at,
        updated_at: now,
        server_conversation_token: server_token,
        sync_state,
        root_task_id,
        tasks,
        exchanges,
        artifacts: request.artifacts,
        messages: request.messages,
        terminal_blocks: request.terminal_blocks.unwrap_or_else(|| {
            existing
                .as_ref()
                .map(|conversation| conversation.terminal_blocks.clone())
                .unwrap_or_default()
        }),
    };
    write_json_atomic(&paths.conversation_path(conversation_id), &record)?;
    upsert_conversation_summary(paths, summary_from_conversation(&record))?;

    enqueue_sync_operation_inner(
        paths,
        MemorySyncOperationRequest {
            object_uid: format!("conversation/{}", record.id),
            object_kind: "conversation".to_string(),
            operation: "upsert".to_string(),
            payload: json!({ "conversation": record }),
        },
    )?;

    let _ = app.emit(EVENT_CONVERSATION_UPDATED, &record);

    Ok(record)
}

#[tauri::command]
pub fn memory_get_conversation(
    manager: State<'_, OctomusMemoryManager>,
    request: MemoryConversationLookupRequest,
) -> Result<Option<MemoryConversationRecord>, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    manager.paths.ensure_layout()?;
    Ok(read_json_or_default::<MemoryConversationRecord>(
        &manager.paths.conversation_path(&request.conversation_id),
    ))
}

#[tauri::command]
pub fn memory_list_conversations(
    manager: State<'_, OctomusMemoryManager>,
) -> Result<Vec<MemoryConversationSummary>, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    manager.paths.ensure_layout()?;
    Ok(
        read_json_or_default::<MemoryConversationIndex>(&manager.paths.conversation_index_path())
            .unwrap_or_default()
            .conversations,
    )
}

#[tauri::command]
pub fn memory_delete_conversation(
    manager: State<'_, OctomusMemoryManager>,
    request: MemoryConversationLookupRequest,
) -> Result<bool, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    manager.paths.ensure_layout()?;

    let conversation_path = manager.paths.conversation_path(&request.conversation_id);
    if conversation_path.exists() {
        fs::remove_file(&conversation_path)
            .map_err(|error| format!("failed to delete conversation file: {error}"))?;
    }

    let mut index =
        read_json_or_default::<MemoryConversationIndex>(&manager.paths.conversation_index_path())
            .unwrap_or_default();
    index
        .conversations
        .retain(|conversation| conversation.id != request.conversation_id);
    write_json_atomic(&manager.paths.conversation_index_path(), &index)?;

    enqueue_sync_operation_inner(
        &manager.paths,
        MemorySyncOperationRequest {
            object_uid: format!("conversation/{}", request.conversation_id),
            object_kind: "conversation".to_string(),
            operation: "delete".to_string(),
            payload: json!({ "conversationId": request.conversation_id }),
        },
    )?;

    Ok(true)
}

#[tauri::command]
pub fn memory_put_cloud_object(
    manager: State<'_, OctomusMemoryManager>,
    request: MemoryCloudObjectPutRequest,
) -> Result<MemoryCloudObjectRecord, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    let paths = &manager.paths;
    paths.ensure_layout()?;

    let mut object = request.object;
    if object.uid.trim().is_empty() {
        object.uid = format!("object_{}", Uuid::new_v4());
    }
    let now = now_string();
    if object.created_at.is_none() {
        object.created_at = Some(now.clone());
    }
    object.updated_at = Some(now.clone());
    object.sync_state.status = if object.sync_state.server_token.is_some() {
        "dirty".to_string()
    } else {
        "local".to_string()
    };

    write_json_atomic(&paths.cloud_object_path(&object.uid), &object)?;
    upsert_cloud_object_summary(paths, summary_from_cloud_object(&object, &now))?;

    if request.enqueue_sync {
        enqueue_sync_operation_inner(
            paths,
            MemorySyncOperationRequest {
                object_uid: object.uid.clone(),
                object_kind: object.kind.clone(),
                operation: "upsert".to_string(),
                payload: json!({ "object": object }),
            },
        )?;
    }

    Ok(object)
}

#[tauri::command]
pub fn memory_get_cloud_object(
    manager: State<'_, OctomusMemoryManager>,
    request: MemoryCloudObjectLookupRequest,
) -> Result<Option<MemoryCloudObjectRecord>, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    manager.paths.ensure_layout()?;
    Ok(read_json_or_default::<MemoryCloudObjectRecord>(
        &manager.paths.cloud_object_path(&request.uid),
    ))
}

#[tauri::command]
pub fn memory_list_cloud_object_index(
    manager: State<'_, OctomusMemoryManager>,
    request: Option<MemoryCloudObjectIndexRequest>,
) -> Result<MemoryCloudObjectIndexResponse, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    manager.paths.ensure_layout()?;
    let index = read_json_or_default::<MemoryCloudObjectIndex>(&manager.paths.cloud_index_path())
        .unwrap_or_default();
    let ordered_uids = request
        .and_then(|request| request.location)
        .and_then(|location| index.sorted_orders_by_location.get(&location).cloned())
        .unwrap_or_else(|| {
            let mut uids = index.objects_by_uid.keys().cloned().collect::<Vec<_>>();
            uids.sort();
            uids
        });

    Ok(MemoryCloudObjectIndexResponse {
        index,
        ordered_uids,
    })
}

#[tauri::command]
pub fn memory_enqueue_sync_operation(
    manager: State<'_, OctomusMemoryManager>,
    request: MemorySyncOperationRequest,
) -> Result<MemorySyncStatus, String> {
    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    let paths = &manager.paths;
    paths.ensure_layout()?;
    enqueue_sync_operation_inner(paths, request)?;

    let meta = read_json_or_default::<MemoryMeta>(&paths.meta_path())
        .ok_or_else(|| "memory metadata is unavailable".to_string())?;
    let queue =
        read_json_or_default::<MemorySyncQueue>(&paths.sync_queue_path()).unwrap_or_default();
    Ok(sync_status_from_queue(paths, &meta, &queue, None))
}

#[tauri::command]
pub async fn memory_sync_once(
    manager: State<'_, OctomusMemoryManager>,
    request: MemorySyncRequest,
) -> Result<MemorySyncStatus, String> {
    let paths = manager.paths.clone();
    let (meta, mut queue, endpoint) = {
        let _guard = manager
            .lock
            .lock()
            .map_err(|_| "memory manager lock is poisoned".to_string())?;
        paths.ensure_layout()?;
        let meta = read_json_or_default::<MemoryMeta>(&paths.meta_path())
            .ok_or_else(|| "memory metadata is unavailable".to_string())?;
        let queue =
            read_json_or_default::<MemorySyncQueue>(&paths.sync_queue_path()).unwrap_or_default();
        let endpoint = request
            .endpoint
            .filter(|endpoint| !endpoint.trim().is_empty())
            .or_else(|| meta.sync_endpoint.clone());
        (meta, queue, endpoint)
    };

    let Some(endpoint) = endpoint else {
        return Ok(sync_status_from_queue(&paths, &meta, &queue, None));
    };

    let pending_operations = queue
        .operations
        .iter()
        .filter(|operation| operation.status != "synced")
        .cloned()
        .collect::<Vec<_>>();

    if pending_operations.is_empty() {
        return Ok(sync_status_from_queue(&paths, &meta, &queue, None));
    }

    let attempt_at = now_string();
    let payload = json!({
        "schemaVersion": MEMORY_SCHEMA_VERSION,
        "deviceId": meta.device_id,
        "operations": pending_operations,
    });

    let sync_result = reqwest::Client::new()
        .post(endpoint)
        .json(&payload)
        .send()
        .await;

    let mut last_error = None;
    match sync_result {
        Ok(response) if response.status().is_success() => {
            let synced_ids = queue
                .operations
                .iter()
                .filter(|operation| operation.status != "synced")
                .map(|operation| operation.id.clone())
                .collect::<HashSet<_>>();

            queue
                .operations
                .retain(|operation| !synced_ids.contains(&operation.id));
            queue.last_success_at = Some(now_string());
        }
        Ok(response) => {
            last_error = Some(format!("server returned {}", response.status()));
        }
        Err(error) => {
            last_error = Some(error.to_string());
        }
    }

    queue.last_attempt_at = Some(attempt_at.clone());
    if let Some(error) = &last_error {
        for operation in queue
            .operations
            .iter_mut()
            .filter(|operation| operation.status != "synced")
        {
            operation.status = "pending".to_string();
            operation.attempt_count += 1;
            operation.updated_at = attempt_at.clone();
            operation.last_error = Some(error.clone());
        }
    }

    let _guard = manager
        .lock
        .lock()
        .map_err(|_| "memory manager lock is poisoned".to_string())?;
    write_json_atomic(&paths.sync_queue_path(), &queue)?;
    Ok(sync_status_from_queue(&paths, &meta, &queue, last_error))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::memory::{conversations::derive_task_store, storage::merge_values};

    #[test]
    fn derives_root_task_exchanges_and_tool_subtasks() {
        let messages = vec![
            json!({
                "id": "user-1",
                "role": "user",
                "body": "Please inspect the repo",
                "createdAt": "2026-05-03T10:00:00Z"
            }),
            json!({
                "id": "assistant-1",
                "role": "assistant",
                "body": "I will run git status.",
                "createdAt": "2026-05-03T10:00:01Z",
                "toolCalls": [{
                    "id": "call-1",
                    "function": { "name": "propose_terminal_command" }
                }]
            }),
            json!({
                "id": "tool-1",
                "role": "tool",
                "body": "clean",
                "toolCallId": "call-1",
                "createdAt": "2026-05-03T10:00:02Z"
            }),
        ];

        let (root_task_id, tasks, exchanges) = derive_task_store(
            "conversation-01",
            "Inspect repo",
            "success",
            &messages,
            "2026-05-03T10:00:00Z",
            "2026-05-03T10:00:03Z",
        );

        assert_eq!(root_task_id, "task_root_conversation-01");
        assert_eq!(exchanges.len(), 1);
        assert_eq!(exchanges[0].input_message_ids, vec!["user-1"]);
        assert_eq!(
            exchanges[0].output_message_ids,
            vec!["assistant-1", "tool-1"]
        );
        assert_eq!(exchanges[0].tool_call_ids, vec!["call-1"]);
        assert!(tasks.iter().any(|task| task.kind == "tool"));
    }

    #[test]
    fn merge_values_preserves_existing_settings() {
        let merged = merge_values(
            json!({
                "selectedModelId": "gpt-5.3-codex-medium",
                "ui": { "sidebar": true, "theme": "dark" }
            }),
            json!({
                "ui": { "sidebar": false }
            }),
        );

        assert_eq!(merged["selectedModelId"], "gpt-5.3-codex-medium");
        assert_eq!(merged["ui"]["sidebar"], false);
        assert_eq!(merged["ui"]["theme"], "dark");
    }
}
