#![allow(dead_code)]

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
pub struct CommandPrediction {
    pub input: String,
    pub suggestion: String,
    pub confidence: f32,
    pub kind: PredictionKind,
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
        _ if trimmed.starts_with("git pu") => "git push -u origin HEAD",
        _ if trimmed.starts_with("git sta") => "git status",
        _ => return None,
    };

    Some(CommandPrediction {
        input: trimmed.to_string(),
        suggestion: suggestion.to_string(),
        confidence: if trimmed == "git" { 0.84 } else { 0.61 },
        kind: PredictionKind::Heuristic,
    })
}

pub fn recommended_tip(last_exit_code: Option<i32>) -> Option<&'static str> {
    match last_exit_code {
        Some(code) if code != 0 => {
            Some("Explain the latest terminal error and suggest the safest next step.")
        }
        _ => None,
    }
}
