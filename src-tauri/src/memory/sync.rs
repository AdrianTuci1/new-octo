use uuid::Uuid;

use crate::memory::{
    paths::MemoryPaths,
    storage::{now_string, read_json_or_default, write_json_atomic},
    types::{
        MemoryMeta, MemorySyncOperation, MemorySyncOperationRequest, MemorySyncQueue,
        MemorySyncStatus,
    },
};

pub(crate) fn enqueue_sync_operation_inner(
    paths: &MemoryPaths,
    request: MemorySyncOperationRequest,
) -> Result<(), String> {
    let mut queue =
        read_json_or_default::<MemorySyncQueue>(&paths.sync_queue_path()).unwrap_or_default();
    let now = now_string();
    if let Some(existing) = queue.operations.iter_mut().rev().find(|operation| {
        operation.status != "synced"
            && operation.object_uid == request.object_uid
            && operation.object_kind == request.object_kind
            && operation.operation == request.operation
    }) {
        existing.payload = request.payload;
        existing.updated_at = now;
        existing.last_error = None;
        return write_json_atomic(&paths.sync_queue_path(), &queue);
    }

    queue.operations.push(MemorySyncOperation {
        id: format!("sync_{}", Uuid::new_v4()),
        object_uid: request.object_uid,
        object_kind: request.object_kind,
        operation: request.operation,
        payload: request.payload,
        created_at: now.clone(),
        updated_at: now,
        attempt_count: 0,
        next_attempt_at: None,
        status: "pending".to_string(),
        last_error: None,
    });
    write_json_atomic(&paths.sync_queue_path(), &queue)
}

pub(crate) fn sync_status_from_queue(
    paths: &MemoryPaths,
    meta: &MemoryMeta,
    queue: &MemorySyncQueue,
    last_error: Option<String>,
) -> MemorySyncStatus {
    let pending_count = queue
        .operations
        .iter()
        .filter(|operation| operation.status != "synced")
        .count();
    let failed_count = queue
        .operations
        .iter()
        .filter(|operation| operation.last_error.is_some())
        .count();
    let endpoint_configured = meta
        .sync_endpoint
        .as_ref()
        .is_some_and(|endpoint| !endpoint.trim().is_empty());
    let mode = if !endpoint_configured {
        "localOnly"
    } else if last_error.is_some() || failed_count > 0 {
        "retrying"
    } else if pending_count > 0 {
        "pending"
    } else {
        "synced"
    };

    MemorySyncStatus {
        mode: mode.to_string(),
        endpoint_configured,
        pending_count,
        failed_count,
        last_attempt_at: queue.last_attempt_at.clone(),
        last_success_at: queue.last_success_at.clone(),
        last_error,
        storage_path: paths.root.to_string_lossy().to_string(),
    }
}
