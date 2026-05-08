use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PredictionKind {
    History,
    Heuristic,
    AgentTip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandContext {
    pub pwd: Option<String>,
    pub git_branch: Option<String>,
    pub exit_code: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextMessageInput {
    pub input: String,
    pub output: String,
    pub context: CommandContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPrediction {
    pub input: String,
    pub suggestion: String,
    pub confidence: f32,
    pub kind: PredictionKind,
}

pub fn predict_from_history(
    input: &str,
    cwd: Option<&str>,
    history: &[crate::terminal::ShellHistoryEntry],
) -> Option<CommandPrediction> {
    let normalized_input = input.to_lowercase();
    let mut same_dir_matches = Vec::new();
    let mut other_matches = Vec::new();

    for entry in history {
        if !entry.value.to_lowercase().starts_with(&normalized_input) {
            continue;
        }
        if entry.value.trim().len() <= input.trim().len() {
            continue;
        }

        let prediction = CommandPrediction {
            input: input.to_string(),
            suggestion: entry.value.trim().to_string(),
            confidence: if is_same_working_directory(cwd, entry.pwd.as_deref()) {
                0.95
            } else {
                0.85
            },
            kind: PredictionKind::History,
        };

        if is_same_working_directory(cwd, entry.pwd.as_deref()) {
            same_dir_matches.push(prediction);
        } else {
            other_matches.push(prediction);
        }
    }

    same_dir_matches.into_iter().chain(other_matches).next()
}

pub fn get_zero_state_suggestions(cwd: &str) -> Vec<String> {
    let mut suggestions = Vec::new();
    let path = std::path::Path::new(cwd);

    // Context-based zero state suggestions
    if path.join("package.json").exists() {
        suggestions.push("npm run dev".to_string());
        suggestions.push("npm install".to_string());
    }
    if path.join("Cargo.toml").exists() {
        suggestions.push("cargo run".to_string());
        suggestions.push("cargo build".to_string());
    }
    if path.join(".git").exists() {
        suggestions.push("git status".to_string());
        suggestions.push("git pull".to_string());
    }
    if path.join("requirements.txt").exists() || path.join("main.py").exists() {
        suggestions.push("python3 main.py".to_string());
    }
    if path.join("docker-compose.yml").exists() || path.join("docker-compose.yaml").exists() {
        suggestions.push("docker-compose up".to_string());
    }

    // Always suggest a few common ones if empty
    if suggestions.is_empty() {
        suggestions.push("ls -la".to_string());
        suggestions.push("cd ..".to_string());
    }

    suggestions
}

fn is_command_still_valid(command: &str) -> bool {
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return false;
    }

    // Check if the primary executable exists in PATH or at absolute path
    let exec = parts[0];
    if exec.starts_with('/') || exec.starts_with("./") || exec.starts_with("../") {
        std::path::Path::new(exec).exists()
    } else {
        // If it's a simple command name, it was once in history so it was valid.
        // We'll trust it for now unless we want to do a full PATH lookup here.
        true
    }
}

pub fn predict_from_sequences(
    last_command: Option<&str>,
    history: &[crate::terminal::ShellHistoryEntry],
) -> Option<CommandPrediction> {
    let last_cmd = last_command?.trim();
    if last_cmd.is_empty() {
        return None;
    }

    use std::collections::HashMap;
    let mut successors: HashMap<String, usize> = HashMap::new();

    // History is stored in reverse chronological order, so each pair is
    // (newer_command, older_command). To learn what followed `last_cmd`,
    // we need to treat the older entry as the antecedent and the newer one
    // as the successor.
    for pair in history.windows(2) {
        let newer = &pair[0];
        let older = &pair[1];
        if older.value.trim() == last_cmd {
            let next_val = newer.value.trim().to_string();
            if !next_val.is_empty() && next_val != last_cmd {
                *successors.entry(next_val).or_insert(0) += 1;
            }
        }
    }

    let (best_successor, count) = successors.into_iter().max_by_key(|&(_, count)| count)?;

    // Only suggest if it happened more than once to avoid noise
    if count < 2 {
        return None;
    }

    Some(CommandPrediction {
        input: "".to_string(),
        suggestion: best_successor,
        confidence: 0.7,
        kind: PredictionKind::History,
    })
}

pub fn git_push_target(git_branch: Option<&str>) -> Option<String> {
    let branch = normalize_git_branch(git_branch)?;
    Some(format!("git push -u origin {branch}"))
}

pub fn is_same_working_directory(current: Option<&str>, candidate: Option<&str>) -> bool {
    let Some(current) = current.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let Some(candidate) = candidate.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };

    current == candidate
}

fn normalize_git_branch(git_branch: Option<&str>) -> Option<&str> {
    git_branch.map(str::trim).filter(|value| {
        !value.is_empty() && *value != "HEAD" && *value != "(no branch)" && *value != "detached"
    })
}

pub fn predict_next_command(input: &str, last_command: Option<&str>) -> Option<CommandPrediction> {
    predict_next_command_with_context(input, last_command, None)
}

pub fn predict_next_command_with_context(
    input: &str,
    last_command: Option<&str>,
    git_branch: Option<&str>,
) -> Option<CommandPrediction> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let git_push_target = git_push_target(git_branch);
    let suggestion = match trimmed {
        "git" => {
            if let Some(target) = git_push_target.as_deref() {
                target
            } else {
                match last_command {
                    Some(command) if command.starts_with("git add") => "git commit",
                    Some(command) if command.starts_with("git commit") => "git push",
                    _ => "git status",
                }
            }
        }
        "npm" => "npm run dev",
        "cargo" => "cargo test",
        "rg" => "rg --files",
        "ls" => "ls -la",
        "pip" => "pip install ",
        "docker" => "docker ps",
        "python" => "python3 ",
        "python3" => "python3 main.py",
        "cd" => "cd ..",
        _ if trimmed.starts_with("git pu") => git_push_target.as_deref().unwrap_or("git push"),
        _ if trimmed.starts_with("git sta") => "git status",
        _ if trimmed.starts_with("pip i") => "pip install -r requirements.txt",
        _ if trimmed.starts_with("docker r") => "docker run -it ",
        _ => return None,
    };

    Some(CommandPrediction {
        input: trimmed.to_string(),
        suggestion: suggestion.to_string(),
        confidence: 0.7,
        kind: PredictionKind::Heuristic,
    })
}

pub fn predict_from_executables(
    input: &str,
    available_commands: &[String],
) -> Option<CommandPrediction> {
    let normalized_input = input.to_lowercase();
    if input.contains(' ') {
        return None;
    }

    available_commands
        .iter()
        .find(|c| c.to_lowercase().starts_with(&normalized_input))
        .map(|cmd| CommandPrediction {
            input: input.to_string(),
            suggestion: cmd.clone(),
            confidence: 0.6,
            kind: PredictionKind::Heuristic,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn predicts_branch_push_for_bare_git_when_branch_is_known() {
        let prediction =
            predict_next_command_with_context("git", None, Some("feature/new-branch")).unwrap();

        assert_eq!(
            prediction.suggestion,
            "git push -u origin feature/new-branch"
        );
    }

    #[test]
    fn falls_back_to_git_status_without_branch_context() {
        let prediction = predict_next_command("git", None).unwrap();

        assert_eq!(prediction.suggestion, "git status");
    }

    #[test]
    fn prefers_exact_working_directory_matches() {
        assert!(is_same_working_directory(Some("/user"), Some("/user")));
        assert!(!is_same_working_directory(
            Some("/user"),
            Some("/tmp/other")
        ));
    }
}
