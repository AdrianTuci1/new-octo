use super::{
    formatting::{build_workspace_search_queries, display_workspace_path, summarize_workspace_exploration},
    lsp::collect_workspace_languages,
    service::run_workspace_exploration,
    types::{ExplorationMode, WorkspaceExplorationRequest, WorkspaceLanguage},
};
use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
fn build_workspace_queries_generates_symbol_friendly_variants() {
    let queries = build_workspace_search_queries("refactorizarea AgentExecutionState", 4);
    assert!(queries.iter().any(|query| query == "refactorizarea AgentExecutionState"));
    assert!(queries.iter().any(|query| query.to_lowercase().contains("agentexecutionstate")));
}

#[test]
fn display_workspace_path_relativizes_from_cwd() {
    let value = display_workspace_path("/tmp/project/src/main.rs", Some("/tmp/project"));
    assert_eq!(value.as_deref(), Some("src/main.rs"));
}

#[test]
fn summarize_semantic_modes_is_specific() {
    let summary = summarize_workspace_exploration(
        ExplorationMode::Definition,
        2,
        0,
        1,
        "/tmp/project",
        Some("/tmp/project"),
    );
    assert!(summary.contains("definition"));
}

#[test]
fn collect_workspace_languages_prefers_requested_file_extension() {
    let languages = collect_workspace_languages(std::path::Path::new("/tmp"), Some("src/main.rs"));
    assert_eq!(languages, vec![WorkspaceLanguage::Rust]);
}

#[test]
fn collect_workspace_languages_scans_workspace() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("octomus-lsp-scan-{unique}"));
    fs::create_dir_all(root.join("src")).expect("workspace should be created");
    fs::write(root.join("src/lib.rs"), "pub fn demo() {}\n").expect("rust file");
    fs::write(root.join("src/app.ts"), "export const demo = 1;\n").expect("ts file");

    let languages = collect_workspace_languages(&root, None);
    assert!(languages.contains(&WorkspaceLanguage::Rust));
    assert!(languages.contains(&WorkspaceLanguage::TypeScript));

    let _ = fs::remove_dir_all(root);
}

#[test]
fn list_mode_returns_directory_entries() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("octomus-lsp-list-{unique}"));
    fs::create_dir_all(root.join("src")).expect("workspace should be created");
    fs::write(root.join("src/lib.rs"), "pub fn demo() {}\n").expect("rust file");

    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime should start");
    let response = runtime
        .block_on(run_workspace_exploration(WorkspaceExplorationRequest {
            mode: Some("list".to_string()),
            query: None,
            path: Some(root.to_string_lossy().to_string()),
            cwd: Some(root.to_string_lossy().to_string()),
            max_results: Some(10),
            include_files: Some(true),
            include_directories: Some(true),
            recursive: Some(false),
            file_path: None,
            symbol: None,
            line: None,
            column: None,
        }))
        .expect("workspace listing should succeed");

    assert_eq!(response.artifact.mode.as_deref(), Some("list"));
    assert!(!response.artifact.directories.is_empty());

    let _ = fs::remove_dir_all(root);
}

#[test]
fn search_mode_falls_back_to_filesystem_when_no_supported_lsp_exists() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("octomus-lsp-fallback-{unique}"));
    fs::create_dir_all(root.join("docs")).expect("workspace should be created");
    fs::write(root.join("docs/README.txt"), "agent semantic fallback\n").expect("text file");

    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime should start");
    let response = runtime
        .block_on(run_workspace_exploration(WorkspaceExplorationRequest {
            mode: Some("search".to_string()),
            query: Some("README".to_string()),
            path: Some(root.to_string_lossy().to_string()),
            cwd: Some(root.to_string_lossy().to_string()),
            max_results: Some(10),
            include_files: Some(true),
            include_directories: Some(true),
            recursive: Some(true),
            file_path: None,
            symbol: None,
            line: None,
            column: None,
        }))
        .expect("workspace fallback search should succeed");

    assert_eq!(response.artifact.mode.as_deref(), Some("search"));
    assert!(response
        .artifact
        .files
        .iter()
        .any(|file| file.path.ends_with("README.txt")));
    assert!(response.formatted.contains("README.txt"));

    let _ = fs::remove_dir_all(root);
}
