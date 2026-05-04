use std::collections::HashMap;

use crate::memory::{
    paths::MemoryPaths,
    storage::{read_json_or_default, write_json_atomic},
    types::{
        MemoryCloudObjectIndex, MemoryCloudObjectRecord, MemoryCloudObjectSummary,
    },
};

pub(crate) fn upsert_cloud_object_summary(
    paths: &MemoryPaths,
    summary: MemoryCloudObjectSummary,
) -> Result<(), String> {
    let mut index = read_json_or_default::<MemoryCloudObjectIndex>(&paths.cloud_index_path())
        .unwrap_or_default();
    index.objects_by_uid.insert(summary.uid.clone(), summary);
    rebuild_sorted_orders(&mut index);
    write_json_atomic(&paths.cloud_index_path(), &index)
}

pub(crate) fn rebuild_sorted_orders(index: &mut MemoryCloudObjectIndex) {
    let mut by_location: HashMap<String, Vec<MemoryCloudObjectSummary>> = HashMap::new();
    for summary in index.objects_by_uid.values() {
        by_location
            .entry(summary.location.clone())
            .or_default()
            .push(summary.clone());
    }

    index.sorted_orders_by_location.clear();
    for (location, mut summaries) in by_location {
        summaries.sort_by(|left, right| {
            left.title
                .to_lowercase()
                .cmp(&right.title.to_lowercase())
                .then_with(|| right.updated_at.cmp(&left.updated_at))
        });
        index.sorted_orders_by_location.insert(
            location,
            summaries.into_iter().map(|summary| summary.uid).collect(),
        );
    }
}

pub(crate) fn summary_from_cloud_object(
    object: &MemoryCloudObjectRecord,
    fallback_updated_at: &str,
) -> MemoryCloudObjectSummary {
    MemoryCloudObjectSummary {
        uid: object.uid.clone(),
        kind: object.kind.clone(),
        location: object.location.clone(),
        title: object.title.clone(),
        updated_at: object
            .updated_at
            .clone()
            .unwrap_or_else(|| fallback_updated_at.to_string()),
        sync_state: object.sync_state.clone(),
    }
}
