use std::{collections::HashSet, fs, path::Path};

use super::types::ExplorationMode;

pub(crate) fn lsp_symbol_kind_label(kind: u32) -> &'static str {
    match kind {
        1 => "file",
        2 => "module",
        3 => "namespace",
        4 => "package",
        5 => "class",
        6 => "method",
        7 => "property",
        8 => "field",
        9 => "constructor",
        10 => "enum",
        11 => "interface",
        12 => "function",
        13 => "variable",
        14 => "constant",
        15 => "string",
        16 => "number",
        17 => "boolean",
        18 => "array",
        19 => "object",
        20 => "key",
        21 => "null",
        22 => "enum member",
        23 => "struct",
        24 => "event",
        25 => "operator",
        26 => "type parameter",
        _ => "symbol",
    }
}

pub(crate) fn diagnostic_severity_label(severity: Option<u32>) -> &'static str {
    match severity {
        Some(1) => "Error",
        Some(2) => "Warning",
        Some(3) => "Information",
        Some(4) => "Hint",
        _ => "Diagnostic",
    }
}

pub(crate) fn semantic_title(mode: ExplorationMode, query: &str) -> String {
    match mode {
        ExplorationMode::Search => format!("Semantic workspace search for {query}"),
        ExplorationMode::Symbols => format!("Workspace symbols for {query}"),
        ExplorationMode::Definition => format!("Definition lookup for {query}"),
        ExplorationMode::References => format!("Reference lookup for {query}"),
        ExplorationMode::Diagnostics => "Workspace diagnostics".to_string(),
        ExplorationMode::List => "Workspace listing".to_string(),
    }
}

pub(crate) fn snippet_for_file_line(path: &Path, zero_based_line: u32) -> Result<String, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("failed to read '{}': {error}", path.display()))?;
    let lines = content.lines().collect::<Vec<_>>();
    let index = zero_based_line as usize;
    let snippet = lines.get(index).copied().unwrap_or_default().trim();
    if snippet.is_empty() {
        return Ok(format!("line {}", zero_based_line + 1));
    }
    Ok(format!("line {}: {}", zero_based_line + 1, snippet))
}

pub(crate) fn build_workspace_search_queries(query: &str, max_queries: usize) -> Vec<String> {
    const STOP_WORDS: &[&str] = &[
        "the", "for", "with", "from", "into", "care", "este", "sunt", "despre", "this", "that",
        "and", "sau", "din", "fisier", "folder", "directory", "function", "class",
    ];

    let normalized_query = query.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut queries = Vec::new();
    let mut seen = HashSet::new();

    if !normalized_query.is_empty() && normalized_query.split_whitespace().count() <= 6 {
        push_workspace_query(&mut queries, &mut seen, normalized_query.clone());
    }

    let tokens = normalized_query
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || character == '_' || character == '-' {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .flat_map(|token| {
            normalize_workspace_token(token)
                .split_whitespace()
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .flat_map(|token| {
            token
                .split_whitespace()
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .filter(|token| token.len() >= 2 && !STOP_WORDS.contains(&token.as_str()))
        .collect::<Vec<_>>();

    for token in tokens.iter().filter(|token| token.len() >= 4) {
        push_workspace_query(&mut queries, &mut seen, token.clone());
    }

    if tokens.len() >= 2 {
        push_workspace_query(&mut queries, &mut seen, format!("{} {}", tokens[0], tokens[1]));
    }

    if queries.is_empty() && !normalized_query.is_empty() {
        push_workspace_query(&mut queries, &mut seen, normalized_query);
    }

    queries.truncate(max_queries.max(1));
    queries
}

fn push_workspace_query(queries: &mut Vec<String>, seen: &mut HashSet<String>, value: String) {
    let cleaned = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let key = cleaned.to_lowercase();
    if cleaned.is_empty() || seen.contains(&key) {
        return;
    }
    seen.insert(key);
    queries.push(cleaned);
}

fn normalize_workspace_token(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    trimmed
        .split(['-', '_'])
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
        .replace("ului", "")
        .replace("elor", "")
        .replace("ilor", "")
        .replace("urilor", "")
        .replace("urile", "")
        .replace("ul", "")
        .replace("le", "")
        .replace("lor", "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn display_workspace_path(path: &str, cwd: Option<&str>) -> Option<String> {
    let normalized_path = path.trim();
    let normalized_cwd = cwd.map(str::trim).unwrap_or_default();
    if normalized_path.is_empty() {
        return None;
    }
    if normalized_cwd.is_empty() {
        return Some(normalized_path.to_string());
    }
    if normalized_path == normalized_cwd {
        return Some(".".to_string());
    }
    let prefix = if normalized_cwd.ends_with('/') {
        normalized_cwd.to_string()
    } else {
        format!("{normalized_cwd}/")
    };
    if normalized_path.starts_with(&prefix) {
        return Some(normalized_path[prefix.len()..].to_string());
    }
    Some(normalized_path.to_string())
}

pub(crate) fn summarize_workspace_exploration(
    mode: ExplorationMode,
    file_count: usize,
    directory_count: usize,
    search_count: usize,
    target_path: &str,
    cwd: Option<&str>,
) -> String {
    let display_path = display_workspace_path(target_path, cwd).unwrap_or_else(|| ".".to_string());
    match mode {
        ExplorationMode::List => format!(
            "Listed {} director{} and {} file{} in {}.",
            directory_count,
            if directory_count == 1 { "y" } else { "ies" },
            file_count,
            if file_count == 1 { "" } else { "s" },
            display_path
        ),
        ExplorationMode::Definition => format!(
            "Found {} definition{} in {}.",
            file_count,
            if file_count == 1 { "" } else { "s" },
            display_path
        ),
        ExplorationMode::References => format!(
            "Found {} reference{} in {}.",
            file_count,
            if file_count == 1 { "" } else { "s" },
            display_path
        ),
        ExplorationMode::Diagnostics => format!(
            "Collected {} diagnostic{} in {}.",
            file_count,
            if file_count == 1 { "" } else { "s" },
            display_path
        ),
        ExplorationMode::Search | ExplorationMode::Symbols => format!(
            "Explored {} file{}, {} director{}, {} search{} in {}.",
            file_count,
            if file_count == 1 { "" } else { "s" },
            directory_count,
            if directory_count == 1 { "y" } else { "ies" },
            search_count,
            if search_count == 1 { "" } else { "es" },
            display_path
        ),
    }
}
