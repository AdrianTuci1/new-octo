use std::collections::{HashMap, HashSet};

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
    let suggestion = collect_ranked_history_prefix_matches(input, cwd, history, 1)
        .into_iter()
        .next()?;
    let same_dir = history.iter().any(|entry| {
        entry.value.trim() == suggestion && is_same_working_directory(cwd, entry.pwd.as_deref())
    });

    Some(CommandPrediction {
        input: input.to_string(),
        suggestion,
        confidence: if same_dir { 0.95 } else { 0.85 },
        kind: PredictionKind::History,
    })
}

pub fn collect_ranked_history_prefix_matches(
    input: &str,
    cwd: Option<&str>,
    history: &[crate::terminal::ShellHistoryEntry],
    limit: usize,
) -> Vec<String> {
    let trimmed_input = input.trim();
    if trimmed_input.is_empty() || limit == 0 {
        return Vec::new();
    }

    let normalized_input = trimmed_input.to_lowercase();
    let mut aggregates = HashMap::<String, HistoryPrefixAggregate>::new();

    for entry in history {
        let candidate = entry.value.trim();
        if candidate.len() <= trimmed_input.len()
            || candidate.ends_with('\\')
            || !is_plausible_history_command_candidate(candidate)
            || !candidate.to_lowercase().starts_with(&normalized_input)
        {
            continue;
        }

        let parsed_at = chrono::DateTime::parse_from_rfc3339(&entry.executed_at)
            .map(|value| value.timestamp())
            .unwrap_or(0);
        let same_dir = is_same_working_directory(cwd, entry.pwd.as_deref());
        let aggregate =
            aggregates
                .entry(candidate.to_string())
                .or_insert_with(|| HistoryPrefixAggregate {
                    value: candidate.to_string(),
                    count: 0,
                    same_dir_count: 0,
                    latest_timestamp: i64::MIN,
                });

        aggregate.count += 1;
        if same_dir {
            aggregate.same_dir_count += 1;
        }
        aggregate.latest_timestamp = aggregate.latest_timestamp.max(parsed_at);
    }

    let mut ranked = aggregates.into_values().collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| right.latest_timestamp.cmp(&left.latest_timestamp))
            .then_with(|| right.same_dir_count.cmp(&left.same_dir_count))
            .then_with(|| right.value.len().cmp(&left.value.len()))
            .then_with(|| left.value.cmp(&right.value))
    });

    ranked
        .into_iter()
        .take(limit)
        .map(|entry| entry.value)
        .collect()
}

#[derive(Debug, Clone)]
struct HistoryPrefixAggregate {
    value: String,
    count: usize,
    same_dir_count: usize,
    latest_timestamp: i64,
}

fn is_plausible_history_command_candidate(candidate: &str) -> bool {
    if candidate.contains('\n') || candidate.len() > 4_000 {
        return false;
    }

    let lower = candidate.to_ascii_lowercase();
    !(lower.starts_with("error:")
        || lower.starts_with("traceback")
        || lower.starts_with("typeerror")
        || lower.starts_with("referenceerror")
        || lower.starts_with("syntaxerror")
        || lower.contains(" cannot read properties ")
        || lower.contains("npm error cannot"))
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
    if input.contains(' ') {
        return None;
    }

    collect_executable_prefix_matches(input, available_commands, 1)
        .into_iter()
        .next()
        .map(|cmd| CommandPrediction {
            input: input.to_string(),
            suggestion: cmd,
            confidence: 0.6,
            kind: PredictionKind::Heuristic,
        })
}

pub fn collect_executable_prefix_matches(
    input: &str,
    available_commands: &[String],
    limit: usize,
) -> Vec<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.contains(' ') || limit == 0 {
        return Vec::new();
    }

    let normalized_input = trimmed.to_lowercase();
    let mut seen = HashSet::new();
    let mut matches = Vec::new();

    for command in available_commands.iter().map(|command| command.trim()) {
        if command.len() <= trimmed.len() || !command.to_lowercase().starts_with(&normalized_input)
        {
            continue;
        }

        if !seen.insert(command.to_lowercase()) {
            continue;
        }

        matches.push(command.to_string());
        if matches.len() >= limit {
            break;
        }
    }

    matches
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

    #[test]
    fn executable_prefix_matches_keep_global_commands_and_skip_exact_noop() {
        let commands = vec![
            "python3".to_string(),
            "python".to_string(),
            "modal".to_string(),
            "npm".to_string(),
        ];

        assert_eq!(
            collect_executable_prefix_matches("mod", &commands, 10),
            vec!["modal"]
        );
        assert!(collect_executable_prefix_matches("modal", &commands, 10).is_empty());
        assert_eq!(
            predict_from_executables("pyth", &commands)
                .expect("python command should be suggested")
                .suggestion,
            "python3"
        );
    }

    #[test]
    fn history_prefix_matches_ignore_error_output_lines() {
        let history = vec![
            crate::terminal::ShellHistoryEntry {
                value: "npm run npm error Cannot read properties of undefined".to_string(),
                executed_at: "2026-05-24T18:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            crate::terminal::ShellHistoryEntry {
                value: "npm run dev".to_string(),
                executed_at: "2026-05-24T17:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
        ];

        let matches =
            collect_ranked_history_prefix_matches("npm run ", Some("/repo"), &history, 10);

        assert_eq!(matches, vec!["npm run dev"]);
    }

    #[test]
    fn ranks_history_prefix_matches_by_full_command_frequency_then_recency() {
        let history = vec![
            crate::terminal::ShellHistoryEntry {
                value: "npm run deploy:frontend".to_string(),
                executed_at: "2026-05-24T18:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            crate::terminal::ShellHistoryEntry {
                value: "npm run clean".to_string(),
                executed_at: "2026-05-24T17:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            crate::terminal::ShellHistoryEntry {
                value: "npm run clean".to_string(),
                executed_at: "2026-05-24T16:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            crate::terminal::ShellHistoryEntry {
                value: "npm run deploy:backend".to_string(),
                executed_at: "2026-05-23T18:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
        ];

        let matches = collect_ranked_history_prefix_matches("npm", Some("/repo"), &history, 10);

        assert_eq!(
            matches,
            vec![
                "npm run clean",
                "npm run deploy:frontend",
                "npm run deploy:backend"
            ]
        );
    }

    #[test]
    fn ranks_history_prefix_matches_by_frequency_when_recency_ties() {
        let history = vec![
            crate::terminal::ShellHistoryEntry {
                value: "modal run modal_training.py --bundle-r2-uri s3://latest".to_string(),
                executed_at: "2026-05-24T18:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            crate::terminal::ShellHistoryEntry {
                value: "modal run models/train.py".to_string(),
                executed_at: "2026-05-24T18:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            crate::terminal::ShellHistoryEntry {
                value: "modal run models/train.py".to_string(),
                executed_at: "2026-05-24T17:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
        ];

        let matches = collect_ranked_history_prefix_matches("modal", Some("/repo"), &history, 10);

        assert_eq!(matches[0], "modal run models/train.py");
        assert_eq!(matches.len(), 2);
    }

    #[test]
    fn ranks_history_prefix_matches_by_path_when_frequency_and_recency_tie() {
        let history = vec![
            crate::terminal::ShellHistoryEntry {
                value: "npm run build:app".to_string(),
                executed_at: "2026-05-24T18:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            crate::terminal::ShellHistoryEntry {
                value: "npm run build:docs".to_string(),
                executed_at: "2026-05-24T18:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/other".to_string()),
            },
        ];

        let matches = collect_ranked_history_prefix_matches("npm", Some("/repo"), &history, 10);

        assert_eq!(matches[0], "npm run build:app");
        assert_eq!(matches[1], "npm run build:docs");
    }
}
