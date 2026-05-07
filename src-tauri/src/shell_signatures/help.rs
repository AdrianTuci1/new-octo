use std::process::Command;

use super::{CommandScope, ScopeMetadata};
use super::scripts::completion_catalog;
use super::utils::{
    command_exists_in_path, strip_box_prefix, looks_like_path_keyword,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HelpSection {
    None,
    Commands,
    Options,
    Examples,
    EnvVars,
}

pub fn probe_scope_metadata(scope: &CommandScope) -> ScopeMetadata {
    let mut metadata = completion_catalog()
        .scopes
        .get(scope)
        .cloned()
        .unwrap_or_default();
    let invocations = help_invocations(scope);

    for invocation in invocations {
        if let Some(output) = run_help_invocation(&invocation) {
            merge_help_output(scope, &mut metadata, &output);
        }
    }

    metadata
}

pub fn help_invocations(scope: &CommandScope) -> Vec<Vec<String>> {
    let command = scope.command.as_str();

    match (command, scope.subcommand.as_deref()) {
        ("git", Some(subcommand)) => vec![
            vec![
                command.to_string(),
                subcommand.to_string(),
                "-h".to_string(),
            ],
            vec![
                command.to_string(),
                subcommand.to_string(),
                "--help".to_string(),
            ],
        ],
        ("git", None) => vec![
            vec![command.to_string(), "-h".to_string()],
            vec![command.to_string(), "help".to_string(), "-a".to_string()],
        ],
        (_, Some(subcommand)) => vec![
            vec![
                command.to_string(),
                subcommand.to_string(),
                "-h".to_string(),
            ],
            vec![
                command.to_string(),
                subcommand.to_string(),
                "--help".to_string(),
            ],
        ],
        _ => vec![
            vec![command.to_string(), "--help".to_string()],
            vec![command.to_string(), "-h".to_string()],
        ],
    }
}

pub fn run_help_invocation(args: &[String]) -> Option<String> {
    let first = args.first()?;
    if !command_exists_in_path(first) {
        return None;
    }

    let output = Command::new(first)
        .args(&args[1..])
        .env("TERM", "dumb")
        .env("PAGER", "cat")
        .env("GIT_PAGER", "cat")
        .env("NO_COLOR", "1")
        .env("COLUMNS", "120")
        .output()
        .ok()?;

    let text = if output.stdout.is_empty() {
        String::from_utf8(output.stderr).ok()?
    } else {
        String::from_utf8(output.stdout).ok()?
    };

    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn merge_help_output(scope: &CommandScope, metadata: &mut ScopeMetadata, help_text: &str) {
    let mut section = HelpSection::None;
    let mut in_code_block = false;

    for raw_line in help_text.lines() {
        let line = raw_line.trim_end();
        let normalized = strip_box_prefix(line).trim();
        let header = help_heading(normalized);
        let lower = header.to_lowercase();

        if lower.starts_with("examples") {
            section = HelpSection::Examples;
            in_code_block = false;
            continue;
        }

        if lower.starts_with("options and arguments")
            || lower.starts_with("options")
            || lower.starts_with("global options")
        {
            section = HelpSection::Options;
        } else if lower.starts_with("commands")
            || lower.starts_with("common commands")
            || lower.starts_with("management commands")
            || lower.starts_with("swarm commands")
            || lower.starts_with("main porcelain commands")
            || lower.starts_with("ancillary commands")
            || lower.starts_with("low-level commands")
            || lower.starts_with("user-facing repository")
            || lower.starts_with("developer-facing file formats")
        {
            section = HelpSection::Commands;
        } else if lower.starts_with("other environment variables:") {
            section = HelpSection::EnvVars;
        } else if lower.starts_with("usage:") {
            section = HelpSection::None;
        }

        if lower.starts_with("options")
            || lower.starts_with("global options")
            || lower.starts_with("commands")
            || lower.starts_with("common commands")
            || lower.starts_with("management commands")
            || lower.starts_with("swarm commands")
            || lower.starts_with("main porcelain commands")
            || lower.starts_with("ancillary commands")
            || lower.starts_with("low-level commands")
            || lower.starts_with("user-facing repository")
            || lower.starts_with("developer-facing file formats")
        {
            in_code_block = false;
        }

        if line.contains("```") {
            if section == HelpSection::Examples {
                let stripped = line.replace("```", "").trim().to_string();
                if let Some(example) = extract_example_command(scope, &stripped) {
                    metadata.examples.insert(example);
                }
            }
            in_code_block = !in_code_block;
            continue;
        }

        if section == HelpSection::Examples || in_code_block {
            if let Some(example) = extract_example_command(scope, line) {
                metadata.examples.insert(example);
            }
        }

        if matches!(section, HelpSection::Commands | HelpSection::Options) {
            if section == HelpSection::Options && !normalized.starts_with('-') {
                continue;
            }
            if let Some((command_names, description)) = parse_entry_line(normalized) {
                if command_names.iter().all(|name| !name.starts_with('-')) {
                    for name in command_names {
                        let template = format!("{} {}", scope.label(), name);
                        metadata.command_templates.insert(template);
                        metadata.subcommands.insert(name);
                    }
                } else if command_names.iter().any(|name| name.starts_with('-')) {
                    register_option_templates(scope, metadata, &command_names, &description);
                }
            }
        }

        if looks_like_usage_line(normalized) {
            merge_usage_hints(scope, metadata, normalized);
        }

        if section == HelpSection::Options && looks_like_option_line(normalized) {
            register_option_templates(scope, metadata, &parse_option_names(normalized), normalized);
        }
    }
}

pub fn parse_entry_line(line: &str) -> Option<(Vec<String>, String)> {
    let line = strip_box_prefix(line);
    if line.is_empty() || line.starts_with("usage:") || line.starts_with("options:") {
        return None;
    }

    let (head, tail) = line.split_once("  ")?;
    let head = head.trim();
    let tail = tail.trim().to_string();
    if head.is_empty() || head.starts_with('-') {
        return None;
    }

    if !entry_head_looks_like_commands(head) {
        return None;
    }

    let names = head
        .split(',')
        .map(|value| value.trim().trim_end_matches('*').to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if names.is_empty() {
        return None;
    }

    Some((names, tail))
}

fn entry_head_looks_like_commands(head: &str) -> bool {
    let token_count = head.split_whitespace().count();
    if token_count <= 4 {
        return true;
    }

    head.contains(',')
        || head.contains('=')
        || head.contains('/')
        || head.contains("::")
        || head.starts_with('-')
}

pub fn parse_option_names(line: &str) -> Vec<String> {
    let line = strip_box_prefix(line);
    let head = line.split_whitespace().next().unwrap_or_default();
    head.split(',')
        .map(|value| value.trim().trim_end_matches('*').to_string())
        .filter(|value| value.starts_with('-'))
        .collect()
}

pub fn register_option_templates(
    scope: &CommandScope,
    metadata: &mut ScopeMetadata,
    option_names: &[String],
    description: &str,
) {
    let description_lower = description.to_lowercase();
    let option_arg_is_path = description_lower.contains("path")
        || description_lower.contains("file")
        || description_lower.contains("directory")
        || description_lower.contains("folder")
        || description_lower.contains("module")
        || description_lower.contains("script");

    for option in option_names {
        if option.is_empty() {
            continue;
        }

        metadata.option_names.insert(option.clone());
        metadata
            .command_templates
            .insert(format!("{} {} ", scope.label(), option));

        if option_arg_is_path {
            metadata.path_options.insert(option.clone());
        }
    }
}

pub fn merge_usage_hints(scope: &CommandScope, metadata: &mut ScopeMetadata, line: &str) {
    let lower = line.to_lowercase();
    if lower.contains("path")
        || lower.contains("file")
        || lower.contains("directory")
        || lower.contains("folder")
        || lower.contains("module")
        || lower.contains("script")
        || lower.contains("pathspec")
        || lower.contains("app_ref")
        || lower.contains("func_ref")
        || lower.contains("ref]")
        || lower.contains("ref>")
    {
        metadata.path_after_scope = true;
    }

    if lower.contains("-- <file")
        || lower.contains("-- <path")
        || lower.contains("-- <pathspec")
        || lower.contains("-- <directory")
        || lower.contains("-- <folder")
        || lower.contains("[--] <file")
        || lower.contains("[--] <path")
        || lower.contains("[--] <pathspec")
        || lower.contains("[--] <directory")
        || lower.contains("[--] <folder")
    {
        metadata.path_after_double_dash = true;
    }

    if let Some(example) = extract_template_from_usage(scope, line) {
        metadata.command_templates.insert(example);
    }
}

pub fn extract_template_from_usage(scope: &CommandScope, line: &str) -> Option<String> {
    let lower = line.to_lowercase();
    let prefix = scope.label().to_lowercase();
    if !lower.contains(&prefix) {
        return None;
    }

    let mut template = scope.label();
    let remainder = line
        .split_once(scope.command.as_str())
        .map(|(_, rest)| rest.trim())
        .unwrap_or_default();
    if remainder.is_empty() {
        return None;
    }

    let pieces = remainder
        .split_whitespace()
        .take_while(|piece| !piece.starts_with('[') || !piece.contains("OPTIONS"))
        .collect::<Vec<_>>();
    if pieces.is_empty() {
        return None;
    }

    for piece in pieces {
        if piece.eq_ignore_ascii_case("options") || piece.eq_ignore_ascii_case("[options]") {
            continue;
        }
        if piece.starts_with('[') || piece.starts_with('<') || piece.ends_with(']') {
            if looks_like_path_keyword(piece) {
                metadata_path_after_scope_hint(&mut template);
            }
            break;
        }
        template.push(' ');
        template.push_str(piece.trim_matches(|ch| ch == '[' || ch == ']' || ch == '.'));
    }

    if template == scope.label() {
        None
    } else {
        Some(template)
    }
}

pub fn metadata_path_after_scope_hint(template: &mut String) {
    if !template.ends_with(' ') {
        template.push(' ');
    }
}

pub fn extract_example_command(scope: &CommandScope, line: &str) -> Option<String> {
    let line = line.trim().trim_matches('`').trim();
    if line.is_empty() {
        return None;
    }

    let lower = line.to_lowercase();
    if !lower.starts_with(&scope.command.to_lowercase()) {
        return None;
    }

    if lower.contains("usage:") || lower.contains("options:") {
        return None;
    }

    Some(line.to_string())
}

pub fn looks_like_usage_line(line: &str) -> bool {
    strip_box_prefix(line).to_lowercase().starts_with("usage:")
}

pub fn looks_like_option_line(line: &str) -> bool {
    let line = strip_box_prefix(line);
    line.trim_start().starts_with('-')
}

pub fn help_heading(line: &str) -> String {
    let mut heading = String::new();
    let mut started = false;

    for ch in line.trim().chars() {
        if !started {
            if ch.is_ascii_alphanumeric() {
                started = true;
                heading.push(ch);
            }
            continue;
        }

        if ch.is_ascii_alphanumeric() || matches!(ch, ' ' | ':' | '-' | '(' | ')' | '.') {
            heading.push(ch);
            continue;
        }

        break;
    }

    heading.trim().to_string()
}
