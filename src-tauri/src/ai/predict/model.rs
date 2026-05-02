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
    use std::collections::HashMap;
    use chrono::{DateTime, Utc};
    
    // 1. Filter and group by command value to count frequency and collect metadata
    // Map: command -> (frequency, is_same_dir, last_executed_at)
    let mut stats_map: HashMap<String, (usize, bool, DateTime<Utc>)> = HashMap::new();
    
    for entry in history {
        if entry.value.to_lowercase().starts_with(&normalized_input) && entry.value.len() > input.len() {
            let is_same_dir = cwd.map_or(false, |dir| entry.pwd.as_ref().map_or(false, |p| p == dir));
            let executed_at = DateTime::parse_from_rfc3339(&entry.executed_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            let stats = stats_map.entry(entry.value.clone()).or_insert((0, false, executed_at));
            stats.0 += 1;
            if is_same_dir {
                stats.1 = true;
            }
            if executed_at > stats.2 {
                stats.2 = executed_at;
            }
        }
    }

    if stats_map.is_empty() {
        return None;
    }

    // 2. Rank based on our scoring module
    let now = Utc::now();
    let mut ranked_matches: Vec<_> = stats_map.into_iter().collect();
    ranked_matches.sort_by(|(val_a, (freq_a, same_dir_a, last_a)), (val_b, (freq_b, same_dir_b, last_b))| {
        let hours_a = (now - *last_a).num_hours() as f32;
        let hours_b = (now - *last_b).num_hours() as f32;
        
        let score_a = super::scoring::PredictionScore::calculate(val_a, *freq_a, *same_dir_a, hours_a).total_score;
        let score_b = super::scoring::PredictionScore::calculate(val_b, *freq_b, *same_dir_b, hours_b).total_score;
        
        score_b.partial_cmp(&score_a).unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| val_b.len().cmp(&val_a.len())) // Prefer LONGER (more complete) commands
    });

    let (suggestion, (freq, is_same_dir, _)) = ranked_matches.first()?;

    // 3. Disk Validation - Disabled for history matches to trust user's past actions
    /*
    if !is_command_still_valid(suggestion) {
        return None;
    }
    */

    Some(CommandPrediction {
        input: input.to_string(),
        suggestion: suggestion.clone(),
        confidence: if *is_same_dir { 0.95 } else { 0.85 + (0.1 * (*freq as f32 / 100.0).min(1.0)) },
        kind: PredictionKind::History,
    })
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

    // Look for occurrences of last_cmd in history and see what follows it
    for i in 0..history.len().saturating_sub(1) {
        if history[i].value.trim() == last_cmd {
            let next_val = history[i + 1].value.trim().to_string();
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

pub fn predict_next_command(input: &str, last_command: Option<&str>) -> Option<CommandPrediction> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let suggestion = match trimmed {
        "git" => match last_command {
            Some(command) if command.starts_with("git add") => "git commit -m \"describe changes\"",
            Some(command) if command.starts_with("git commit") => "git push",
            _ => "git status",
        },
        "npm" => "npm run dev",
        "cargo" => "cargo test",
        "rg" => "rg --files",
        "ls" => "ls -la",
        "pip" => "pip install ",
        "docker" => "docker ps",
        "python" => "python3 ",
        "python3" => "python3 main.py",
        "cd" => "cd ..",
        _ if trimmed.starts_with("git pu") => "git push -u origin HEAD",
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

pub fn predict_from_executables(input: &str, available_commands: &[String]) -> Option<CommandPrediction> {
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
