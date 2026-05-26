use crate::{
    ai::predict::model::{CommandPrediction, PredictionKind},
    terminal::{
        fs::{terminal_list_directory_entries, ListDirectoryEntriesRequest},
        home_dir,
    },
};

use super::{command_argument_expects_path, parser::parse_shell_input};

#[derive(Debug, Clone)]
struct PathEntry {
    name: String,
    is_directory: bool,
}

pub fn predict_path_completion(
    input: &str,
    cwd: Option<&str>,
    tokens: &[&str],
) -> Option<CommandPrediction> {
    let cwd = cwd?;
    let parsed = parse_shell_input(input);
    let current_token_start = parsed.current_token_start()?;
    let current_token = input.get(current_token_start..)?.trim();
    let current_token_index = if parsed.has_trailing_whitespace {
        tokens.len()
    } else {
        tokens.len().saturating_sub(1)
    };

    if !command_argument_expects_path(tokens, current_token_index) {
        return None;
    }

    let directories_only = tokens
        .first()
        .is_some_and(|command| matches!(*command, "cd"));
    let (directory_path, partial_name, replacement_prefix, quote_prefix) =
        build_path_completion_request(current_token, cwd)?;

    let mut candidate_entries = Vec::new();
    if current_token.starts_with('.') {
        candidate_entries.push(PathEntry {
            name: ".".to_string(),
            is_directory: true,
        });
        candidate_entries.push(PathEntry {
            name: "..".to_string(),
            is_directory: true,
        });
    }

    let listing = terminal_list_directory_entries(ListDirectoryEntriesRequest {
        path: Some(directory_path),
        query: Some(partial_name.clone()),
        directories_only: Some(directories_only),
    })
    .ok()?;

    candidate_entries.extend(listing.entries.into_iter().map(|entry| PathEntry {
        name: entry.name,
        is_directory: entry.is_directory,
    }));

    let normalized_partial = partial_name.to_lowercase();
    let next_entry = candidate_entries.into_iter().find(|entry| {
        normalized_partial.is_empty() || entry.name.to_lowercase().starts_with(&normalized_partial)
    })?;

    let replacement = format!(
        "{}{}{}{}",
        quote_prefix,
        replacement_prefix,
        shell_escape_path_segment(&next_entry.name),
        if next_entry.is_directory { "/" } else { "" }
    );
    let full_command = format!("{}{}", &input[..current_token_start], replacement);
    if full_command == input {
        None
    } else {
        Some(CommandPrediction {
            input: input.trim().to_string(),
            suggestion: full_command,
            confidence: 0.8,
            kind: PredictionKind::Heuristic,
        })
    }
}

fn shell_escape_path_segment(segment: &str) -> String {
    if segment.chars().any(|ch| {
        ch.is_whitespace()
            || matches!(
                ch,
                '\'' | '"' | '\\' | '$' | '&' | '(' | ')' | '[' | ']' | '{' | '}' | ';'
            )
    }) {
        return format!("'{}'", segment.replace('\'', "'\\''"));
    }

    segment.to_string()
}

fn build_path_completion_request(
    token: &str,
    cwd: &str,
) -> Option<(String, String, String, String)> {
    let (quote_prefix, token) = strip_leading_quote(token);

    if token == "~" {
        let home = home_dir()?;
        return Some((
            home.to_string_lossy().to_string(),
            String::new(),
            "~/".to_string(),
            quote_prefix,
        ));
    }

    if token.starts_with("~/") {
        let home = home_dir()?;
        return build_nested_path_request(token, &home.to_string_lossy(), "~/")
            .map(|(a, b, c)| (a, b, c, quote_prefix));
    }

    if token == "$HOME" {
        let home = home_dir()?;
        return Some((
            home.to_string_lossy().to_string(),
            String::new(),
            "$HOME/".to_string(),
            quote_prefix,
        ));
    }

    if token.starts_with("$HOME/") {
        let home = home_dir()?;
        return build_nested_path_request(token, &home.to_string_lossy(), "$HOME/")
            .map(|(a, b, c)| (a, b, c, quote_prefix));
    }

    if token.starts_with('/') {
        return build_nested_path_request(token, "/", "/").map(|(a, b, c)| (a, b, c, quote_prefix));
    }

    if token.starts_with("./") || token.starts_with("../") || token.contains('/') {
        return build_nested_path_request(token, cwd, "").map(|(a, b, c)| (a, b, c, quote_prefix));
    }

    Some((
        cwd.to_string(),
        token.to_string(),
        String::new(),
        quote_prefix,
    ))
}

fn build_nested_path_request(
    token: &str,
    root_path: &str,
    display_root: &str,
) -> Option<(String, String, String)> {
    let trailing_slash = token.ends_with('/');
    let last_slash_index = token.rfind('/').unwrap_or(0);
    let raw_parent = if token.contains('/') {
        &token[..=last_slash_index]
    } else {
        ""
    };
    let partial_name = if trailing_slash {
        ""
    } else {
        &token[last_slash_index + usize::from(token.contains('/'))..]
    };
    let parent_segment = if trailing_slash { token } else { raw_parent };
    let normalized_parent = if display_root.is_empty() {
        parent_segment.trim_end_matches('/')
    } else {
        parent_segment
            .strip_prefix(display_root)
            .unwrap_or(parent_segment)
            .trim_end_matches('/')
    };
    let directory_path = if display_root == "/" {
        if parent_segment.is_empty() {
            "/".to_string()
        } else {
            parent_segment.trim_end_matches('/').to_string()
        }
    } else if normalized_parent.is_empty() {
        root_path.to_string()
    } else {
        format!(
            "{}/{}",
            root_path.trim_end_matches('/'),
            normalized_parent.trim_start_matches('/')
        )
    };
    let replacement_prefix = if trailing_slash {
        token.to_string()
    } else if raw_parent.is_empty() {
        display_root.to_string()
    } else {
        raw_parent.to_string()
    };

    Some((directory_path, partial_name.to_string(), replacement_prefix))
}

fn strip_leading_quote(token: &str) -> (String, &str) {
    match token.chars().next() {
        Some('"') | Some('\'') => (token[..1].to_string(), token.get(1..).unwrap_or("")),
        _ => (String::new(), token),
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use uuid::Uuid;

    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("octomus-path-engine-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn predicts_hidden_files_for_dot_prefix() {
        let cwd = temp_dir();
        fs::write(cwd.join(".hidden"), b"test").unwrap();
        fs::create_dir_all(cwd.join("src")).unwrap();

        let cwd_str = cwd.to_string_lossy().to_string();
        let prediction = predict_path_completion("cat .h", Some(&cwd_str), &["cat", ".h"])
            .expect("hidden file should be suggested");

        assert!(prediction.suggestion.contains(".hidden"));
    }

    #[test]
    fn predicts_self_and_parent_for_dot_path() {
        let cwd = temp_dir();
        let cwd_str = cwd.to_string_lossy().to_string();

        let prediction = predict_path_completion("cd .", Some(&cwd_str), &["cd", "."])
            .expect("dot path should be suggested");

        assert!(prediction.suggestion.ends_with("./"));
    }
}
