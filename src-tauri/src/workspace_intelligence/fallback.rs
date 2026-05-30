use std::path::Path;

use crate::terminal::fs::{
    terminal_list_directory_entries, terminal_search_directory_entries, ListDirectoryEntriesRequest,
    SearchDirectoryEntriesRequest,
};

use super::{
    formatting::{build_workspace_search_queries, display_workspace_path},
    types::{
        WorkspaceExplorationDirectory, WorkspaceExplorationEntry, WorkspaceExplorationFile,
        WorkspaceExplorationSearch,
    },
};

pub(super) fn build_listing_results(
    created_at: &str,
    target_path: &Path,
    cwd: &Option<String>,
    query: Option<&str>,
    include_files: bool,
    include_directories: bool,
    max_results: usize,
    searches: &mut Vec<WorkspaceExplorationSearch>,
    entries: &mut Vec<WorkspaceExplorationEntry>,
    files: &mut Vec<WorkspaceExplorationFile>,
    directories: &mut Vec<WorkspaceExplorationDirectory>,
) -> Result<(), String> {
    let listing = terminal_list_directory_entries(ListDirectoryEntriesRequest {
        path: Some(target_path.to_string_lossy().to_string()),
        cwd: cwd.clone(),
        query: query.map(str::to_string),
        directories_only: Some(false),
    })?;

    searches.push(WorkspaceExplorationSearch {
        mode: "list".to_string(),
        source: "filesystem".to_string(),
        query: query.unwrap_or(".").to_string(),
        result_count: listing.entries.len(),
        path: Some(listing.current_path.clone()),
    });
    entries.push(WorkspaceExplorationEntry {
        id: format!("workspace-exploration-{created_at}-list"),
        kind: "search".to_string(),
        text: format!(
            "Listed {}",
            display_workspace_path(target_path.to_string_lossy().as_ref(), cwd.as_deref())
                .unwrap_or_else(|| ".".to_string())
        ),
        detail: Some(format!(
            "{} visible entr{}",
            listing.entries.len(),
            if listing.entries.len() == 1 { "y" } else { "ies" }
        )),
        path: None,
        created_at: created_at.to_string(),
    });

    for entry in listing.entries.iter().take(max_results) {
        if entry.is_directory {
            if include_directories {
                directories.push(WorkspaceExplorationDirectory {
                    path: entry.path.clone(),
                    source: "filesystem".to_string(),
                });
            }
            continue;
        }

        if include_files {
            files.push(WorkspaceExplorationFile {
                path: entry.path.clone(),
                source: "filesystem".to_string(),
                snippet: None,
            });
        }
    }

    Ok(())
}

pub(super) fn build_fallback_search_results(
    created_at: &str,
    target_path: &Path,
    cwd: &Option<String>,
    query: &str,
    include_files: bool,
    include_directories: bool,
    recursive: bool,
    max_results: usize,
    searches: &mut Vec<WorkspaceExplorationSearch>,
    entries: &mut Vec<WorkspaceExplorationEntry>,
    files: &mut Vec<WorkspaceExplorationFile>,
    directories: &mut Vec<WorkspaceExplorationDirectory>,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    let queries = build_workspace_search_queries(query, 4);
    if queries.is_empty() {
        return Ok(());
    }

    let local_listing = terminal_list_directory_entries(ListDirectoryEntriesRequest {
        path: Some(target_path.to_string_lossy().to_string()),
        cwd: cwd.clone(),
        query: Some(query.to_string()),
        directories_only: Some(false),
    })?;
    let local_matches = local_listing
        .entries
        .iter()
        .filter(|entry| {
            (entry.is_directory && include_directories) || (!entry.is_directory && include_files)
        })
        .take(max_results)
        .cloned()
        .collect::<Vec<_>>();

    searches.push(WorkspaceExplorationSearch {
        mode: "search".to_string(),
        source: "filesystem".to_string(),
        query: query.to_string(),
        result_count: local_matches.len(),
        path: Some(local_listing.current_path.clone()),
    });
    entries.push(WorkspaceExplorationEntry {
        id: format!("workspace-exploration-{created_at}-fallback-local"),
        kind: "search".to_string(),
        text: format!(
            "Filtered {}",
            display_workspace_path(local_listing.current_path.as_str(), cwd.as_deref())
                .unwrap_or_else(|| ".".to_string())
        ),
        detail: Some(format!(
            "locally with \"{}\" ({} match{})",
            query,
            local_matches.len(),
            if local_matches.len() == 1 { "" } else { "es" }
        )),
        path: None,
        created_at: created_at.to_string(),
    });

    for entry in local_matches {
        if entry.is_directory {
            directories.push(WorkspaceExplorationDirectory {
                path: entry.path,
                source: "filesystem".to_string(),
            });
        } else {
            files.push(WorkspaceExplorationFile {
                path: entry.path,
                source: "filesystem".to_string(),
                snippet: None,
            });
        }
    }

    if files.is_empty() && directories.is_empty() && recursive {
        for query_value in queries {
            let recursive_listing = terminal_search_directory_entries(SearchDirectoryEntriesRequest {
                path: Some(target_path.to_string_lossy().to_string()),
                cwd: cwd.clone(),
                query: query_value.clone(),
            })?;
            let matched = recursive_listing
                .entries
                .iter()
                .filter(|entry| {
                    (entry.is_directory && include_directories) || (!entry.is_directory && include_files)
                })
                .take(max_results)
                .cloned()
                .collect::<Vec<_>>();
            searches.push(WorkspaceExplorationSearch {
                mode: "search".to_string(),
                source: "filesystem".to_string(),
                query: query_value.clone(),
                result_count: matched.len(),
                path: Some(recursive_listing.current_path.clone()),
            });
            entries.push(WorkspaceExplorationEntry {
                id: format!(
                    "workspace-exploration-{created_at}-fallback-recursive-{}",
                    searches.len()
                ),
                kind: "search".to_string(),
                text: format!("Searched for {}", query_value),
                detail: Some(format!(
                    "recursively in {} ({} match{})",
                    display_workspace_path(
                        recursive_listing.current_path.as_str(),
                        cwd.as_deref()
                    )
                    .unwrap_or_else(|| ".".to_string()),
                    matched.len(),
                    if matched.len() == 1 { "" } else { "es" }
                )),
                path: None,
                created_at: created_at.to_string(),
            });

            for entry in matched {
                if entry.is_directory {
                    directories.push(WorkspaceExplorationDirectory {
                        path: entry.path,
                        source: "filesystem".to_string(),
                    });
                } else {
                    files.push(WorkspaceExplorationFile {
                        path: entry.path,
                        source: "filesystem".to_string(),
                        snippet: None,
                    });
                }
            }
        }
    }

    if files.is_empty() && directories.is_empty() {
        warnings.push(format!(
            "No filesystem matches found for `{query}` inside `{}`.",
            target_path.display()
        ));
    }

    Ok(())
}
