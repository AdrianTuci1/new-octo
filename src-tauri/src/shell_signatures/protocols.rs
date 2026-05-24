use std::{fs, process::Command};

use super::utils::command_exists_in_path;
use super::CommandScope;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CompletionProtocol {
    Cobra,
    ArgComplete,
    PipAutoComplete,
    Npm,
}

pub fn run_completion_protocol(
    protocol: &CompletionProtocol,
    scope: &CommandScope,
    input: &str,
    tokens: &[&str],
) -> Vec<String> {
    match protocol {
        CompletionProtocol::Cobra => run_cobra_completion(scope.command.as_str(), input, tokens),
        CompletionProtocol::ArgComplete => {
            run_argcomplete_completion(scope.command.as_str(), input, tokens)
        }
        CompletionProtocol::Npm => run_npm_completion(input, tokens),
        CompletionProtocol::PipAutoComplete => {
            run_python_pip_completion(input, tokens).unwrap_or_default()
        }
    }
}

pub fn compose_completion_candidate(input: &str, fragment: &str) -> Option<String> {
    let fragment = fragment.trim();
    if fragment.is_empty() {
        return None;
    }

    let token_start = input
        .rfind(char::is_whitespace)
        .map(|index| index + 1)
        .unwrap_or(0);
    let prefix = &input[..token_start];
    let candidate = format!("{}{}", prefix, fragment);
    if candidate.trim() == input.trim() {
        None
    } else {
        Some(candidate)
    }
}

pub fn run_cobra_completion(command: &str, input: &str, tokens: &[&str]) -> Vec<String> {
    if tokens.first().copied() != Some(command) || !command_exists_in_path(command) {
        return Vec::new();
    }

    let mut args = tokens
        .iter()
        .skip(1)
        .map(|token| token.to_string())
        .collect::<Vec<_>>();
    if input.chars().last().is_some_and(char::is_whitespace) {
        args.push(String::new());
    }

    let output = Command::new(command).arg("__complete").args(&args).output();

    parse_completion_output(output.ok())
        .into_iter()
        .filter(|fragment| !fragment.chars().any(char::is_whitespace))
        .collect()
}

pub fn run_argcomplete_completion(command: &str, input: &str, tokens: &[&str]) -> Vec<String> {
    if tokens.first().copied() != Some(command) || !command_exists_in_path(command) {
        return Vec::new();
    }

    let current_index = if input.chars().last().is_some_and(char::is_whitespace) {
        tokens.len()
    } else {
        tokens.len().saturating_sub(1)
    };

    let mut cmd = Command::new("sh");
    apply_completion_runtime_env(&mut cmd, command, "argcomplete");

    let output = cmd
        .arg("-c")
        .arg(format!("{command} 8>&1 9>&2 1>/dev/null 2>&1"))
        .env("_ARGCOMPLETE", "1")
        .env("_ARGCOMPLETE_SHELL", "zsh")
        .env("_ARGCOMPLETE_SUPPRESS_SPACE", "1")
        .env("_ARGCOMPLETE_DFS", "\u{0b}")
        .env("_ARGCOMPLETE_IFS", "\n")
        .env("COMP_LINE", input)
        .env("COMP_POINT", input.chars().count().to_string())
        .env("COMP_CWORD", current_index.to_string())
        .output();

    parse_completion_output(output.ok())
        .into_iter()
        .filter(|fragment| !fragment.chars().any(char::is_whitespace))
        .collect()
}

pub fn run_npm_completion(input: &str, tokens: &[&str]) -> Vec<String> {
    if tokens.first().copied() != Some("npm") || !command_exists_in_path("npm") {
        return Vec::new();
    }

    let current_index = if input.chars().last().is_some_and(char::is_whitespace) {
        tokens.len()
    } else {
        tokens.len().saturating_sub(1)
    };

    let mut args = vec!["completion".to_string(), "--".to_string()];
    args.extend(tokens.iter().map(|token| token.to_string()));

    let output = Command::new("npm")
        .args(&args)
        .env("COMP_LINE", input)
        .env("COMP_POINT", input.chars().count().to_string())
        .env("COMP_CWORD", current_index.to_string())
        .env("COMP_WORDS", tokens.join(" "))
        .output();

    parse_completion_output(output.ok())
}

pub fn run_python_pip_completion(input: &str, tokens: &[&str]) -> Option<Vec<String>> {
    let (command, command_args) = if tokens.len() >= 3
        && matches!(tokens.first().copied(), Some("python" | "python3"))
        && tokens.get(1).copied() == Some("-m")
        && tokens.get(2).copied() == Some("pip")
    {
        (tokens[0], vec!["-m".to_string(), "pip".to_string()])
    } else if tokens.first().copied() == Some("pip") {
        ("pip", Vec::new())
    } else {
        return None;
    };

    if !command_exists_in_path(command) && command != "python" && command != "python3" {
        return None;
    }

    let current_index = if input.chars().last().is_some_and(char::is_whitespace) {
        tokens.len()
    } else {
        tokens.len().saturating_sub(1)
    };

    let mut cmd = Command::new(command);
    apply_completion_runtime_env(&mut cmd, command, "pip");

    let output = if command_args.is_empty() {
        cmd.env("PIP_AUTO_COMPLETE", "1")
            .env("COMP_WORDS", tokens.join(" "))
            .env("COMP_CWORD", current_index.to_string())
            .output()
    } else {
        cmd.args(&command_args)
            .env("PIP_AUTO_COMPLETE", "1")
            .env("COMP_WORDS", tokens.join(" "))
            .env("COMP_CWORD", current_index.to_string())
            .output()
    };

    Some(
        parse_completion_output(output.ok())
            .into_iter()
            .flat_map(|fragment| {
                fragment
                    .split_whitespace()
                    .map(|value| value.to_string())
                    .collect::<Vec<_>>()
            })
            .collect(),
    )
}

pub fn apply_completion_runtime_env(command: &mut Command, command_name: &str, protocol: &str) {
    let root = std::env::temp_dir()
        .join("launcher-shell-completions")
        .join(protocol)
        .join(command_name);
    let home = root.join("home");
    let cache = root.join("cache");
    let state = root.join("state");

    let _ = fs::create_dir_all(&home);
    let _ = fs::create_dir_all(&cache);
    let _ = fs::create_dir_all(&state);

    command
        .env("HOME", &home)
        .env("XDG_CACHE_HOME", &cache)
        .env("XDG_STATE_HOME", &state)
        .env("PIP_DISABLE_PIP_VERSION_CHECK", "1")
        .env("NO_COLOR", "1");

    if command_name == "pipx" {
        command
            .env("PIPX_HOME", root.join("pipx-home"))
            .env("PIPX_GLOBAL_HOME", root.join("pipx-global-home"))
            .env("PIPX_BIN_DIR", root.join("pipx-bin"))
            .env("PIPX_GLOBAL_BIN_DIR", root.join("pipx-global-bin"));
    }

    if command_name == "python" || command_name == "python3" {
        command.env("PIP_CACHE_DIR", cache.join("pip"));
    }
}

pub fn parse_completion_output(output: Option<std::process::Output>) -> Vec<String> {
    let Some(output) = output else {
        return Vec::new();
    };

    let mut text = String::new();
    if !output.stdout.is_empty() {
        if let Ok(stdout) = String::from_utf8(output.stdout) {
            text.push_str(&stdout);
        }
    }
    if !output.stderr.is_empty() {
        if let Ok(stderr) = String::from_utf8(output.stderr) {
            if !text.is_empty() && !text.ends_with('\n') {
                text.push('\n');
            }
            text.push_str(&stderr);
        }
    }

    text = text.replace('\u{0b}', "\n");
    let mut candidates = Vec::new();
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty()
            || line.starts_with("Completion ended with directive")
            || (line.starts_with(':') && line[1..].chars().all(|ch| ch.is_ascii_digit()))
        {
            continue;
        }

        let candidate = line
            .split_once('\t')
            .map(|(head, _)| head)
            .or_else(|| line.split_once(':').map(|(head, _)| head))
            .unwrap_or(line)
            .trim();
        if !candidate.is_empty() {
            candidates.push(candidate.to_string());
        }
    }

    candidates
}
