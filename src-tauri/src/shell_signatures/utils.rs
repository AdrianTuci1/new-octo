use std::{
    collections::{BTreeSet, HashSet},
    fs,
    sync::OnceLock,
};

use super::{CommandScope, ScopeMetadata};
use crate::terminal::ShellHistoryEntry;

pub fn collect_history_prefix_candidates(
    input: &str,
    history_entries: &[ShellHistoryEntry],
) -> Vec<String> {
    let normalized_input = input.to_lowercase();
    let mut seen = HashSet::new();
    let mut same_dir_matches = Vec::new();
    let mut other_matches = Vec::new();

    for entry in history_entries.iter() {
        let value = entry.value.trim();
        if value.is_empty() || !value.to_lowercase().starts_with(&normalized_input) {
            continue;
        }

        if !seen.insert(value.to_string()) {
            continue;
        }

        if entry.pwd.as_deref().is_some() {
            same_dir_matches.push(value.to_string());
        } else {
            other_matches.push(value.to_string());
        }
    }

    same_dir_matches.extend(other_matches);
    same_dir_matches
}

pub fn looks_like_cli_with_subcommands(command: &str) -> bool {
    matches!(command, "cargo" | "docker" | "git" | "modal" | "npm")
}

pub fn should_skip_candidate(scope: &CommandScope, candidate: &str) -> bool {
    let lower = candidate.to_lowercase();
    if lower.ends_with(" -h") || lower.ends_with(" --help") {
        return true;
    }

    if scope.command == "git" && scope.subcommand.is_none() {
        let tokens = candidate.split_whitespace().collect::<Vec<_>>();
        if tokens.len() == 2 && tokens.get(1).is_some_and(|token| !token.starts_with('-')) {
            return true;
        }
    }

    false
}

pub fn is_plausible_signature_candidate(
    scope: &CommandScope,
    metadata: &ScopeMetadata,
    candidate: &str,
) -> bool {
    let candidate = candidate.trim();
    if candidate.is_empty() {
        return false;
    }

    let scope_label = scope.label();
    let lower_candidate = candidate.to_lowercase();
    let lower_scope_label = scope_label.to_lowercase();
    if !lower_candidate.starts_with(&lower_scope_label) {
        return false;
    }

    let remainder = candidate[scope_label.len()..].trim_start();
    if remainder.is_empty() {
        return false;
    }

    let first_token = remainder.split_whitespace().next().unwrap_or_default();
    if first_token.starts_with('-')
        || first_token.contains('/')
        || first_token.contains("://")
        || first_token.contains("::")
        || first_token.contains('=')
        || first_token.ends_with('.')
    {
        return true;
    }

    if scope.token_count() == 1 && metadata.subcommands.contains(first_token) {
        return true;
    }

    false
}

pub fn command_exists_in_path(command: &str) -> bool {
    if let Ok(paths) = std::env::var("PATH") {
        for path in std::env::split_paths(&paths) {
            let candidate = path.join(command);
            if candidate.exists() {
                return true;
            }
        }
    }

    false
}

pub fn strip_wrapping_quotes(token: &str) -> &str {
    token.trim().trim_matches('"').trim_matches('\'')
}

pub fn looks_like_path_keyword(value: &str) -> bool {
    let lower = value.to_lowercase();
    lower.contains("path")
        || lower.contains("file")
        || lower.contains("directory")
        || lower.contains("folder")
        || lower.contains("module")
        || lower.contains("script")
        || lower.contains("app_ref")
        || lower.contains("func_ref")
}

pub fn strip_completion_token(token: &str) -> &str {
    token
        .trim()
        .trim_matches('\'')
        .trim_matches('"')
        .trim_matches('`')
}

pub fn is_plausible_completion_command_name(token: &str) -> bool {
    let token = strip_completion_token(token);
    if token.is_empty() || token.starts_with('-') || token.starts_with('_') {
        return false;
    }

    if token.chars().any(char::is_whitespace) {
        return false;
    }

    token
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '+' | '@'))
}

pub fn path_command_names() -> &'static BTreeSet<String> {
    static CACHE: OnceLock<BTreeSet<String>> = OnceLock::new();
    CACHE.get_or_init(discover_path_command_names)
}

pub fn discover_path_command_names() -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    let Some(path_var) = std::env::var_os("PATH") else {
        return names;
    };

    for directory in std::env::split_paths(&path_var) {
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if is_plausible_completion_command_name(name) {
                names.insert(name.to_string());
            }
        }
    }

    names
}

pub fn expand_completion_pattern(pattern: &str) -> Vec<String> {
    let pattern = strip_completion_token(pattern).trim();
    if pattern.is_empty() {
        return Vec::new();
    }

    let normalized = pattern.trim_matches('"').trim_matches('\'');
    let regex_pattern = zsh_pattern_to_regex(normalized);
    let Ok(regex) = regex::Regex::new(&regex_pattern) else {
        return Vec::new();
    };

    path_command_names()
        .iter()
        .filter(|candidate| regex.is_match(candidate))
        .cloned()
        .collect()
}

fn zsh_pattern_to_regex(pattern: &str) -> String {
    let mut regex = String::from("^");
    let mut chars = pattern.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '#' => {
                regex.push_str(".*");
            }
            '.' | '+' | '(' | ')' | '{' | '}' | '^' | '$' | '|' | '\\' => {
                regex.push('\\');
                regex.push(ch);
            }
            '*' => regex.push_str(".*"),
            '?' => regex.push('.'),
            _ => regex.push(ch),
        }
    }

    regex.push('$');
    regex
}

pub fn strip_box_prefix(line: &str) -> &str {
    let trimmed = line.trim();
    let trimmed = trimmed
        .trim_start_matches('│')
        .trim_start_matches('┃')
        .trim_start_matches('|')
        .trim_start_matches('╭')
        .trim_start_matches('╰')
        .trim_start_matches('╭')
        .trim_start_matches('╯')
        .trim_start();
    trimmed
}
