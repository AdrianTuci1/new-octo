use crate::terminal::fs::resolve_request_path;

use super::{
    fallback::{build_fallback_search_results, build_listing_results},
    formatting::{display_workspace_path, summarize_workspace_exploration},
    lsp::run_semantic_exploration,
    types::{
        ExplorationMode, WorkspaceExplorationArtifact, WorkspaceExplorationEntry,
        WorkspaceExplorationFile, WorkspaceExplorationRequest, WorkspaceExplorationResponse,
        WorkspaceExplorationSearch, WorkspaceExplorationSegment,
    },
};

pub(super) async fn run_workspace_exploration(
    request: WorkspaceExplorationRequest,
) -> Result<WorkspaceExplorationResponse, String> {
    let mode = ExplorationMode::from_request(&request);
    let cwd = request.cwd.clone();
    let query = request
        .query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            request
                .symbol
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        });
    let target_path = resolve_request_path(request.path.clone(), cwd.clone())?;
    let include_files = request.include_files.unwrap_or(true);
    let include_directories = request
        .include_directories
        .unwrap_or(mode == ExplorationMode::List);
    let recursive = request.recursive.unwrap_or(mode != ExplorationMode::List);
    let max_results = request
        .max_results
        .unwrap_or(if mode == ExplorationMode::List { 24 } else { 8 })
        .clamp(1, 50);
    let created_at = chrono::Utc::now().to_rfc3339();

    let mut searches = Vec::new();
    let mut entries = Vec::new();
    let mut files = Vec::new();
    let mut directories = Vec::new();
    let mut warnings = Vec::new();

    match mode {
        ExplorationMode::List => {
            build_listing_results(
                &created_at,
                &target_path,
                &cwd,
                query.as_deref(),
                include_files,
                include_directories,
                max_results,
                &mut searches,
                &mut entries,
                &mut files,
                &mut directories,
            )?;
        }
        ExplorationMode::Search
        | ExplorationMode::Symbols
        | ExplorationMode::Definition
        | ExplorationMode::References
        | ExplorationMode::Diagnostics => {
            let semantic_query = query
                .clone()
                .or_else(|| request.symbol.clone())
                .unwrap_or_default();

            let semantic = run_semantic_exploration(
                mode,
                &semantic_query,
                &target_path,
                request.file_path.as_deref(),
                request.line,
                request.column,
                max_results,
            )
            .await;

            match semantic {
                Ok(semantic_result) if !semantic_result.matches.is_empty() => {
                    searches.push(WorkspaceExplorationSearch {
                        mode: mode.as_str().to_string(),
                        source: semantic_result.source.clone(),
                        query: semantic_query.clone(),
                        result_count: semantic_result.matches.len(),
                        path: Some(target_path.to_string_lossy().to_string()),
                    });
                    entries.push(WorkspaceExplorationEntry {
                        id: format!("workspace-exploration-{created_at}-semantic"),
                        kind: "search".to_string(),
                        text: semantic_result.title,
                        detail: Some(format!(
                            "{} semantic match{}",
                            semantic_result.matches.len(),
                            if semantic_result.matches.len() == 1 {
                                ""
                            } else {
                                "es"
                            }
                        )),
                        path: None,
                        created_at: created_at.clone(),
                    });

                    for (index, matched) in semantic_result.matches.iter().take(max_results).enumerate() {
                        files.push(WorkspaceExplorationFile {
                            path: matched.path.clone(),
                            source: matched.source.clone(),
                            snippet: matched.snippet.clone(),
                        });
                        entries.push(WorkspaceExplorationEntry {
                            id: format!("workspace-exploration-{created_at}-semantic-file-{index}"),
                            kind: "read".to_string(),
                            text: matched.display_name.clone(),
                            detail: Some(matched.detail.clone()),
                            path: Some(matched.path.clone()),
                            created_at: created_at.clone(),
                        });
                    }
                }
                Ok(_) => warnings.push(format!("No semantic matches found for `{}`.", semantic_query)),
                Err(error) => warnings.push(error),
            }

            if files.is_empty() && mode == ExplorationMode::Search {
                build_fallback_search_results(
                    &created_at,
                    &target_path,
                    &cwd,
                    query.as_deref().unwrap_or_default(),
                    include_files,
                    include_directories,
                    recursive,
                    max_results,
                    &mut searches,
                    &mut entries,
                    &mut files,
                    &mut directories,
                    &mut warnings,
                )?;
            }
        }
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));
    files.dedup_by(|left, right| left.path == right.path);
    directories.sort_by(|left, right| left.path.cmp(&right.path));
    directories.dedup_by(|left, right| left.path == right.path);

    let summary = summarize_workspace_exploration(
        mode,
        files.len(),
        directories.len(),
        searches.len(),
        target_path.to_string_lossy().as_ref(),
        cwd.as_deref(),
    );
    let mut formatted_lines = vec![summary.clone()];
    formatted_lines.push(format!(
        "Path: {}",
        display_workspace_path(target_path.to_string_lossy().as_ref(), cwd.as_deref())
            .unwrap_or_else(|| ".".to_string())
    ));

    if !files.is_empty() {
        formatted_lines.push("Files:".to_string());
        for file in &files {
            formatted_lines.push(format!(
                "- {}",
                display_workspace_path(&file.path, cwd.as_deref())
                    .unwrap_or_else(|| file.path.clone())
            ));
            if let Some(snippet) = file.snippet.as_deref().filter(|value| !value.is_empty()) {
                formatted_lines.push(format!("  {}", snippet.trim()));
            }
        }
    }

    if !directories.is_empty() {
        formatted_lines.push("Directories:".to_string());
        for directory in &directories {
            formatted_lines.push(format!(
                "- {}",
                display_workspace_path(&directory.path, cwd.as_deref())
                    .unwrap_or_else(|| directory.path.clone())
            ));
        }
    }

    if !warnings.is_empty() {
        formatted_lines.push(format!("Notes: {}", warnings.join(" | ")));
    }

    let segment = WorkspaceExplorationSegment {
        id: format!("workspace-exploration-{created_at}"),
        created_at: created_at.clone(),
        summary: Some(summary.clone()),
        entries,
        searches: searches.clone(),
        files: files.clone(),
        directories: directories.clone(),
    };
    let artifact = WorkspaceExplorationArtifact {
        query,
        mode: Some(mode.as_str().to_string()),
        path: Some(target_path.to_string_lossy().to_string()),
        summary: Some(summary),
        segments: vec![segment],
        searches,
        files,
        directories,
    };

    Ok(WorkspaceExplorationResponse {
        formatted: formatted_lines.join("\n"),
        artifact,
    })
}
