use std::{
    collections::{BTreeSet, HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use crate::terminal::home_dir;
use super::{CommandScope, ScopeMetadata};
use super::protocols::CompletionProtocol;
pub use super::parser::shell_split_words;
use super::utils::{
    expand_completion_pattern, is_plausible_completion_command_name, strip_completion_token,
    strip_box_prefix,
};
use super::help::{parse_entry_line, register_option_templates};

#[derive(Debug, Default)]
pub struct CompletionCatalog {
    pub scopes: HashMap<CommandScope, ScopeMetadata>,
}

pub fn completion_catalog() -> &'static CompletionCatalog {
    static CATALOG: OnceLock<CompletionCatalog> = OnceLock::new();
    CATALOG.get_or_init(build_completion_catalog)
}

pub fn build_completion_catalog() -> CompletionCatalog {
    let mut catalog = CompletionCatalog::default();

    for script_path in discover_completion_script_paths() {
        let Ok(text) = fs::read_to_string(&script_path) else {
            continue;
        };

        let parsed = parse_completion_script(&script_path, &text);
        if parsed.command_names.is_empty() {
            continue;
        }

        for command in parsed.command_names {
            let scope = CommandScope::root(&command);
            let entry = catalog.scopes.entry(scope).or_default();
            merge_scope_metadata(entry, &parsed.metadata);
        }
    }

    catalog
}

#[derive(Debug, Default)]
pub struct ParsedCompletionScript {
    pub command_names: BTreeSet<String>,
    pub metadata: ScopeMetadata,
}

pub fn parse_completion_script(path: &Path, script_text: &str) -> ParsedCompletionScript {
    let mut parsed = ParsedCompletionScript::default();
    parsed.metadata.completion_protocols = infer_completion_protocols(script_text);

    for line in script_text.lines() {
        let line = line.trim_start();
        if line.is_empty() {
            continue;
        }

        let (commands, static_words) = parse_completion_script_line(line);
        parsed.command_names.extend(commands);
        parsed
            .metadata
            .subcommands
            .extend(static_words.iter().cloned());
    }

    if parsed.command_names.is_empty() {
        if let Some(fallback) = completion_script_fallback_command(path) {
            parsed.command_names.insert(fallback);
        }
    }

    parsed
}

pub fn parse_completion_script_line(line: &str) -> (Vec<String>, Vec<String>) {
    let tokens = shell_split_words(line);
    let Some(first_token) = tokens.first().map(String::as_str) else {
        return (Vec::new(), Vec::new());
    };

    if first_token == "#compdef" || first_token == "compdef" {
        return parse_compdef_completion_line(&tokens);
    }

    if first_token == "complete"
        || line.contains(" complete ")
        || line.contains(" complete\t")
        || line.contains(" complete(")
    {
        return parse_complete_completion_line(&tokens);
    }

    (Vec::new(), Vec::new())
}

pub fn parse_compdef_completion_line(tokens: &[String]) -> (Vec<String>, Vec<String>) {
    let mut commands = Vec::new();
    let static_words = Vec::new();
    let mut index = 1;

    while let Some(token) = tokens.get(index) {
        match token.as_str() {
            "-P" | "-p" => {
                if let Some(pattern) = tokens.get(index + 1) {
                    commands.extend(expand_completion_pattern(strip_completion_token(pattern)));
                    index += 1;
                }
            }
            "-K" | "-k" => {
                index += 1;
            }
            token if token.starts_with('-') => {}
            token => {
                let candidate = strip_completion_token(token);
                if let Some((left, right)) = candidate.split_once('=') {
                    if is_plausible_completion_command_name(left) {
                        commands.push(left.to_string());
                    }
                    if is_plausible_completion_command_name(right) {
                        commands.push(right.to_string());
                    }
                } else if is_plausible_completion_command_name(candidate) {
                    commands.push(candidate.to_string());
                }
            }
        }

        index += 1;
    }

    (commands, static_words)
}

pub fn parse_complete_completion_line(tokens: &[String]) -> (Vec<String>, Vec<String>) {
    let mut commands = Vec::new();
    let mut static_words = Vec::new();
    let mut index = 1;

    while let Some(token) = tokens.get(index) {
        match token.as_str() {
            "-c" | "--command" => {
                if let Some(value) = tokens.get(index + 1) {
                    let candidate = strip_completion_token(value);
                    if is_plausible_completion_command_name(candidate) {
                        commands.push(candidate.to_string());
                    }
                    index += 1;
                }
            }
            "-F" | "-C" => {
                index += 1;
            }
            "-W" | "-a" | "--arguments" => {
                if let Some(value) = tokens.get(index + 1) {
                    static_words
                        .extend(split_static_completion_words(strip_completion_token(value)));
                    index += 1;
                }
            }
            token if token.starts_with('-') => {}
            token => {
                let candidate = strip_completion_token(token);
                if is_plausible_completion_command_name(candidate) {
                    commands.push(candidate.to_string());
                }
            }
        }

        index += 1;
    }

    (commands, static_words)
}

pub fn split_static_completion_words(value: &str) -> Vec<String> {
    if value.is_empty() {
        return Vec::new();
    }

    if value.contains('(')
        || value.contains(')')
        || value.contains('$')
        || value.contains('`')
        || value.contains(';')
        || value.contains('*')
        || value.contains('?')
        || value.contains('[')
        || value.contains(']')
    {
        return Vec::new();
    }

    value
        .split(|ch: char| ch.is_whitespace() || ch == ',' || ch == '|')
        .map(strip_completion_token)
        .filter(|token| is_plausible_completion_command_name(token))
        .map(|token| token.to_string())
        .collect()
}

pub fn infer_completion_protocols(script_text: &str) -> HashSet<CompletionProtocol> {
    let lower = script_text.to_lowercase();
    let mut protocols = HashSet::new();

    if lower.contains("__complete") || lower.contains("__completenodesc") {
        protocols.insert(CompletionProtocol::Cobra);
    }

    if lower.contains("_argcomplete") {
        protocols.insert(CompletionProtocol::ArgComplete);
    }

    if lower.contains("pip_auto_complete") {
        protocols.insert(CompletionProtocol::PipAutoComplete);
    }

    if lower.contains("npm completion --") {
        protocols.insert(CompletionProtocol::Npm);
    }

    protocols
}

pub fn completion_script_fallback_command(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_string_lossy();
    let stem = stem.trim_start_matches('_');
    if is_plausible_completion_command_name(stem) {
        Some(stem.to_string())
    } else {
        None
    }
}

pub fn merge_scope_metadata(target: &mut ScopeMetadata, source: &ScopeMetadata) {
    target
        .command_templates
        .extend(source.command_templates.iter().cloned());
    target.examples.extend(source.examples.iter().cloned());
    target.path_after_scope |= source.path_after_scope;
    target.path_after_double_dash |= source.path_after_double_dash;
    target
        .option_names
        .extend(source.option_names.iter().cloned());
    target
        .path_options
        .extend(source.path_options.iter().cloned());
    target
        .subcommands
        .extend(source.subcommands.iter().cloned());
    target
        .completion_protocols
        .extend(source.completion_protocols.iter().copied());
}

pub fn merge_completion_script_metadata(
    scope: &CommandScope,
    metadata: &mut ScopeMetadata,
    script_text: &str,
) {
    let lower = script_text.to_lowercase();

    if lower.contains("__complete") || lower.contains("__completenodesc") {
        metadata
            .completion_protocols
            .insert(CompletionProtocol::Cobra);
    }

    if lower.contains("_argcomplete") {
        metadata
            .completion_protocols
            .insert(CompletionProtocol::ArgComplete);
    }

    if lower.contains("pip_auto_complete") {
        metadata
            .completion_protocols
            .insert(CompletionProtocol::PipAutoComplete);
    }

    if lower.contains("npm completion --") {
        metadata
            .completion_protocols
            .insert(CompletionProtocol::Npm);
    }

    for line in script_text.lines() {
        let trimmed = strip_box_prefix(line).trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some((command_names, description)) = parse_entry_line(trimmed) {
            if command_names.iter().all(|name| !name.starts_with('-')) {
                for name in command_names {
                    metadata
                        .command_templates
                        .insert(format!("{} {}", scope.label(), name));
                    metadata.subcommands.insert(name);
                }
            } else {
                register_option_templates(scope, metadata, &command_names, &description);
            }
        }
    }
}

pub fn discover_completion_script_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    for directory in completion_script_directories() {
        collect_completion_script_paths(&directory, 3, &mut paths);
    }

    paths.sort();
    paths.dedup();
    paths
}

fn collect_completion_script_paths(directory: &Path, depth: usize, output: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            output.push(path);
        } else if depth > 0 && path.is_dir() {
            collect_completion_script_paths(&path, depth.saturating_sub(1), output);
        }
    }
}

pub fn completion_script_directories() -> Vec<PathBuf> {
    let mut directories = vec![
        PathBuf::from("/opt/homebrew/share/zsh/site-functions"),
        PathBuf::from("/usr/local/share/zsh/site-functions"),
        PathBuf::from("/usr/share/zsh/site-functions"),
        PathBuf::from("/opt/homebrew/share/fish/vendor_completions.d"),
        PathBuf::from("/usr/local/share/fish/vendor_completions.d"),
        PathBuf::from("/usr/share/fish/vendor_completions.d"),
        PathBuf::from("/opt/homebrew/share/bash-completion/completions"),
        PathBuf::from("/usr/local/share/bash-completion/completions"),
        PathBuf::from("/usr/share/bash-completion/completions"),
        PathBuf::from("/opt/homebrew/etc/bash_completion.d"),
        PathBuf::from("/usr/local/etc/bash_completion.d"),
    ];

    if let Some(prefix) = std::env::var_os("HOMEBREW_PREFIX") {
        let prefix = PathBuf::from(prefix);
        directories.push(prefix.join("share/zsh/site-functions"));
        directories.push(prefix.join("share/fish/vendor_completions.d"));
        directories.push(prefix.join("share/bash-completion/completions"));
    }

    if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
        let data_home = PathBuf::from(data_home);
        directories.push(data_home.join("fish/vendor_completions.d"));
        directories.push(data_home.join("bash-completion/completions"));
        directories.push(data_home.join("zsh/site-functions"));
    }

    if let Some(data_dirs) = std::env::var_os("XDG_DATA_DIRS") {
        for data_dir in std::env::split_paths(&data_dirs) {
            directories.push(data_dir.join("fish/vendor_completions.d"));
            directories.push(data_dir.join("bash-completion/completions"));
            directories.push(data_dir.join("zsh/site-functions"));
        }
    }

    if let Some(home) = home_dir() {
        directories.push(home.join(".config/fish/completions"));
        directories.push(home.join(".local/share/fish/vendor_completions.d"));
        directories.push(home.join(".local/share/bash-completion/completions"));
        directories.push(home.join(".local/share/zsh/site-functions"));
        directories.push(home.join(".local/share/zsh/completions"));
        directories.push(home.join(".zfunc"));
        directories.push(home.join(".oh-my-zsh/completions"));
    }

    directories
}
