use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Duration, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::fs::{home_dir, resolve_request_path, PathRequest};
use super::manager::TerminalManager;

const MAX_TERMINAL_GHOST_SUGGESTIONS: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellHistoryEntry {
    pub value: String,
    pub executed_at: String,
    pub source: String,
    pub pwd: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalRuntimeContext {
    pub node_version: Option<String>,
    pub target_os: String,
    pub target_arch: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalPredictionRequest {
    pub session_id: Option<String>,
    pub input: String,
    pub cwd: Option<String>,
    pub available_commands: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalGhostPrediction {
    pub input: String,
    pub suggestion: String,
    pub confidence: f32,
    pub kind: crate::ai::predict::model::PredictionKind,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhostConversationTerminalBlock {
    command: Option<String>,
    started_at: Option<String>,
    finished_at: Option<String>,
}

pub fn terminal_get_runtime_context(
    request: PathRequest,
) -> Result<TerminalRuntimeContext, String> {
    let cwd = resolve_request_path(request.path, request.cwd)?;

    Ok(TerminalRuntimeContext {
        node_version: read_command_version("node", &cwd),
        target_os: std::env::consts::OS.to_string(),
        target_arch: std::env::consts::ARCH.to_string(),
    })
}

pub async fn terminal_get_prediction(
    terminal_manager: State<'_, TerminalManager>,
    memory_manager: State<'_, crate::memory::OctomusMemoryManager>,
    request: TerminalPredictionRequest,
) -> Result<Option<TerminalGhostPrediction>, String> {
    build_terminal_ghost_prediction(terminal_manager.inner(), memory_manager.inner(), request).await
}

pub async fn terminal_get_composer_intelligence(
    ai_manager: State<'_, crate::ai::AgentHarnessManager>,
    composer_manager: State<'_, crate::ai::predict::composer::ComposerIntelligenceManager>,
    request: crate::ai::predict::composer::ComposerIntelligenceRequest,
) -> Result<crate::ai::predict::composer::ComposerIntelligenceResponse, String> {
    Ok(crate::ai::predict::composer::get_composer_intelligence(
        composer_manager.inner(),
        ai_manager.inner(),
        request,
    )
    .await)
}

pub fn terminal_get_recent_history() -> Result<Vec<ShellHistoryEntry>, String> {
    let cutoff = Utc::now() - Duration::days(180);
    let mut entries = load_global_shell_history(cutoff);

    // Keep enough ordered history to preserve command sequences for prediction
    // while still bounding the payload size sent to the frontend.
    if entries.len() > 5_000 {
        entries.truncate(5_000);
    }

    Ok(entries)
}

pub fn terminal_get_prediction_shell_history() -> Vec<ShellHistoryEntry> {
    let cutoff = Utc.timestamp_opt(0, 0).single().unwrap_or_else(Utc::now);
    load_global_shell_history(cutoff)
}

fn load_global_shell_history(cutoff: DateTime<Utc>) -> Vec<ShellHistoryEntry> {
    let mut raw_entries = Vec::new();

    raw_entries.extend(read_zsh_history(cutoff));
    raw_entries.extend(read_bash_history(cutoff));
    raw_entries.extend(read_fish_history(cutoff));
    sort_history_entries_by_recency(&mut raw_entries);

    raw_entries
        .into_iter()
        .filter_map(|entry| {
            let normalized_value = entry.value.trim().to_string();
            if normalized_value.is_empty() {
                return None;
            }

            Some(ShellHistoryEntry {
                value: normalized_value,
                executed_at: entry.executed_at,
                source: entry.source,
                pwd: entry.pwd,
            })
        })
        .collect()
}

async fn build_terminal_ghost_prediction(
    terminal_manager: &TerminalManager,
    memory_manager: &crate::memory::OctomusMemoryManager,
    request: TerminalPredictionRequest,
) -> Result<Option<TerminalGhostPrediction>, String> {
    let TerminalPredictionRequest {
        session_id,
        input,
        cwd,
        available_commands,
    } = request;
    let available_commands = merge_available_commands(available_commands);
    let query = input;
    let cutoff = Utc.timestamp_opt(0, 0).single().unwrap_or_else(Utc::now);
    let mut history_entries = Vec::<ShellHistoryEntry>::new();

    history_entries.extend(terminal_get_prediction_shell_history());
    history_entries.extend(load_application_history(memory_manager, cutoff));
    history_entries.extend(load_session_history(
        terminal_manager,
        session_id.as_deref(),
    ));
    sort_history_entries_by_recency(&mut history_entries);

    let (terminal_blocks, session_cwd) =
        collect_session_context(terminal_manager, session_id.as_deref(), cwd.as_deref());

    let cwd = session_cwd.or(cwd);
    let last_command = terminal_blocks
        .iter()
        .rev()
        .find(|block| block.status == "finished")
        .map(|block| block.command.as_str());

    let prediction = predict_terminal_ghost_from_history_with_commands(
        &query,
        cwd.as_deref(),
        last_command,
        &history_entries,
        &available_commands,
    );

    Ok(prediction.map(|prediction| {
        let history_suggestions = collect_terminal_ghost_suggestions(
            &query,
            cwd.as_deref(),
            &history_entries,
            &available_commands,
            &prediction.suggestion,
        );
        TerminalGhostPrediction::from_prediction(prediction, history_suggestions)
    }))
}

fn merge_available_commands(available_commands: Vec<String>) -> Vec<String> {
    let mut commands = available_commands
        .into_iter()
        .map(|command| command.trim().to_string())
        .filter(|command| !command.is_empty())
        .collect::<BTreeSet<_>>();

    commands.extend(super::fs::discover_shell_command_names());
    commands.into_iter().collect()
}

#[cfg(test)]
fn predict_terminal_ghost_from_history(
    input: &str,
    cwd: Option<&str>,
    last_command: Option<&str>,
    history_entries: &[ShellHistoryEntry],
) -> Option<crate::ai::predict::CommandPrediction> {
    predict_terminal_ghost_from_history_with_commands(
        input,
        cwd,
        last_command,
        history_entries,
        &[],
    )
}

#[cfg(test)]
fn predict_terminal_ghost_response_from_history(
    input: &str,
    cwd: Option<&str>,
    last_command: Option<&str>,
    history_entries: &[ShellHistoryEntry],
) -> Option<TerminalGhostPrediction> {
    let prediction =
        predict_terminal_ghost_from_history(input, cwd, last_command, history_entries)?;
    let suggestions = collect_terminal_ghost_suggestions(
        input,
        cwd,
        history_entries,
        &[],
        &prediction.suggestion,
    );

    Some(TerminalGhostPrediction::from_prediction(
        prediction,
        suggestions,
    ))
}

fn predict_terminal_ghost_from_history_with_commands(
    input: &str,
    cwd: Option<&str>,
    last_command: Option<&str>,
    history_entries: &[ShellHistoryEntry],
    available_commands: &[String],
) -> Option<crate::ai::predict::CommandPrediction> {
    crate::shell_signatures::context::TerminalCompletionContext::new(
        input,
        cwd,
        last_command,
        history_entries,
        available_commands,
    )
    .predict()
}

fn collect_terminal_ghost_suggestions(
    input: &str,
    cwd: Option<&str>,
    history_entries: &[ShellHistoryEntry],
    available_commands: &[String],
    primary_suggestion: &str,
) -> Vec<String> {
    let ranked_history = crate::ai::predict::model::collect_ranked_history_prefix_matches(
        input,
        cwd,
        history_entries,
        MAX_TERMINAL_GHOST_SUGGESTIONS,
    );
    let mut suggestions = Vec::new();
    push_unique_suggestion(&mut suggestions, primary_suggestion);
    for suggestion in ranked_history {
        push_unique_suggestion(&mut suggestions, &suggestion);
    }
    for suggestion in crate::ai::predict::model::collect_executable_prefix_matches(
        input,
        available_commands,
        MAX_TERMINAL_GHOST_SUGGESTIONS,
    ) {
        push_unique_suggestion(&mut suggestions, &suggestion);
    }
    suggestions
}

fn push_unique_suggestion(suggestions: &mut Vec<String>, value: &str) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return;
    }

    if suggestions.iter().any(|existing| existing == trimmed) {
        return;
    }

    suggestions.push(trimmed.to_string());
}

impl TerminalGhostPrediction {
    fn from_prediction(
        prediction: crate::ai::predict::CommandPrediction,
        mut suggestions: Vec<String>,
    ) -> Self {
        if suggestions.is_empty() {
            suggestions.push(prediction.suggestion.clone());
        }

        Self {
            input: prediction.input,
            suggestion: prediction.suggestion,
            confidence: prediction.confidence,
            kind: prediction.kind,
            suggestions,
        }
    }
}

#[cfg(test)]
fn predict_terminal_path_completion(
    input: &str,
    cwd: Option<&str>,
) -> Option<crate::ai::predict::CommandPrediction> {
    let cwd = cwd?;
    let parsed = crate::shell_signatures::parser::parse_shell_input(input);
    let tokens = parsed.tokens.iter().map(String::as_str).collect::<Vec<_>>();
    crate::shell_signatures::path_engine::predict_path_completion(input, Some(cwd), &tokens)
}

fn collect_session_context(
    terminal_manager: &TerminalManager,
    session_id: Option<&str>,
    fallback_cwd: Option<&str>,
) -> (
    Vec<crate::ai::predict::composer::ComposerTerminalBlockInput>,
    Option<String>,
) {
    let Some(session_id) = session_id.filter(|value| !value.trim().is_empty()) else {
        return (Vec::new(), fallback_cwd.map(str::to_string));
    };

    let Ok(session) = terminal_manager.get(session_id) else {
        return (Vec::new(), fallback_cwd.map(str::to_string));
    };

    let cwd = session.cwd().or_else(|| fallback_cwd.map(str::to_string));
    let snapshot = session.blocks_snapshot();
    let blocks = snapshot
        .iter()
        .cloned()
        .map(
            |block| crate::ai::predict::composer::ComposerTerminalBlockInput {
                command: block.command,
                output: Some(block.output),
                exit_code: block.exit_code,
                status: if block.finished_at.is_some() {
                    "finished".to_string()
                } else {
                    "running".to_string()
                },
            },
        )
        .collect::<Vec<_>>();
    (blocks, cwd)
}

fn load_session_history(
    terminal_manager: &TerminalManager,
    session_id: Option<&str>,
) -> Vec<ShellHistoryEntry> {
    let Some(session_id) = session_id.filter(|value| !value.trim().is_empty()) else {
        return Vec::new();
    };

    let Ok(session) = terminal_manager.get(session_id) else {
        return Vec::new();
    };

    let cwd = session.cwd();
    session
        .blocks_snapshot()
        .into_iter()
        .filter(|block| !block.command.trim().is_empty())
        .map(|block| ShellHistoryEntry {
            value: block.command,
            executed_at: block.finished_at.unwrap_or(block.started_at).to_rfc3339(),
            source: "session".to_string(),
            pwd: cwd.clone(),
        })
        .collect()
}

fn load_application_history(
    memory_manager: &crate::memory::OctomusMemoryManager,
    cutoff: DateTime<Utc>,
) -> Vec<ShellHistoryEntry> {
    let Some(index) = crate::memory::read_json_or_default::<crate::memory::MemoryConversationIndex>(
        &memory_manager.paths.conversation_index_path(),
    ) else {
        return Vec::new();
    };

    let mut summaries = index.conversations;
    summaries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));

    let mut history = Vec::new();
    for summary in summaries.into_iter().take(40) {
        let Some(record) = crate::memory::read_json_or_default::<
            crate::memory::MemoryConversationRecord,
        >(&memory_manager.paths.conversation_path(&summary.id)) else {
            continue;
        };

        let record_cwd = record.cwd.clone();
        let record_updated_at = record.updated_at.clone();

        for entry in record.terminal_blocks.into_iter() {
            let Ok(block) = serde_json::from_value::<GhostConversationTerminalBlock>(entry) else {
                continue;
            };
            let Some(command) = block
                .command
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
            else {
                continue;
            };

            let executed_at = block
                .finished_at
                .or(block.started_at)
                .unwrap_or_else(|| record_updated_at.clone());
            let parsed_at = chrono::DateTime::parse_from_rfc3339(&executed_at)
                .map(|value| value.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            if parsed_at < cutoff {
                continue;
            }

            history.push(ShellHistoryEntry {
                value: command,
                executed_at: executed_at.clone(),
                source: "app".to_string(),
                pwd: record_cwd.clone(),
            });
        }
    }

    history
}

fn read_zsh_history(cutoff: DateTime<Utc>) -> Vec<ShellHistoryEntry> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    let path = home.join(".zsh_history");
    let Ok(contents) = fs::read_to_string(&path) else {
        return Vec::new();
    };

    let logical_lines = collect_history_logical_lines(&contents);
    let count = logical_lines.len();
    println!(
        "[History] Reading Zsh history: {} lines from {:?}",
        count, path
    );

    let mut current_working_dir: Option<PathBuf> = None;
    let mut previous_working_dir: Option<PathBuf> = None;
    let mut entries = Vec::new();

    for (index, line) in logical_lines.iter().enumerate() {
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() {
            continue;
        }

        let fallback_timestamp =
            Utc::now() - Duration::seconds((count.saturating_sub(index)) as i64);
        let (executed_at, value) = if trimmed_line.starts_with(": ") {
            // Extended format: : 1234567890:0;command
            if let Some(rest) = trimmed_line.strip_prefix(": ") {
                if let Some((timestamp, command_part)) = rest.split_once(':') {
                    if let Some((_, command)) = command_part.split_once(';') {
                        let timestamp = timestamp.parse::<i64>().ok().unwrap_or(0);
                        let time = Utc
                            .timestamp_opt(timestamp, 0)
                            .single()
                            .unwrap_or_else(Utc::now);
                        (time, command.trim())
                    } else {
                        (fallback_timestamp, command_part.trim())
                    }
                } else {
                    (fallback_timestamp, rest.trim())
                }
            } else {
                (fallback_timestamp, trimmed_line)
            }
        } else {
            // Simple format: command
            (fallback_timestamp, trimmed_line)
        };

        if executed_at < cutoff {
            continue;
        }

        if value.is_empty() {
            continue;
        }

        entries.push(ShellHistoryEntry {
            value: value.to_string(),
            executed_at: executed_at.to_rfc3339(),
            source: "zsh".to_string(),
            pwd: current_working_dir
                .as_ref()
                .map(|cwd| cwd.to_string_lossy().to_string()),
        });

        update_history_working_directory(
            &mut current_working_dir,
            &mut previous_working_dir,
            value,
            Some(home.as_path()),
        );
    }

    entries
}

fn collect_history_logical_lines(contents: &str) -> Vec<String> {
    let mut logical_lines = Vec::new();
    let mut pending = String::new();

    for raw_line in contents.lines() {
        let trimmed_end = raw_line.trim_end();
        if trimmed_end.trim().is_empty() {
            continue;
        }

        let has_continuation = trimmed_end.ends_with('\\');
        let segment = trimmed_end.trim_end_matches('\\').trim();
        if segment.is_empty() {
            continue;
        }

        if pending.is_empty() {
            pending.push_str(segment);
        } else {
            pending.push(' ');
            pending.push_str(segment);
        }

        if has_continuation {
            continue;
        }

        logical_lines.push(std::mem::take(&mut pending));
    }

    if !pending.is_empty() {
        logical_lines.push(pending);
    }

    logical_lines
}

fn read_bash_history(cutoff: DateTime<Utc>) -> Vec<ShellHistoryEntry> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    let path = home.join(".bash_history");
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };

    let mut current_timestamp: Option<i64> = None;
    let mut current_working_dir: Option<PathBuf> = None;
    let mut previous_working_dir: Option<PathBuf> = None;
    let mut entries = Vec::new();

    for line in contents.lines() {
        if let Some(timestamp) = line
            .strip_prefix('#')
            .and_then(|value| value.parse::<i64>().ok())
        {
            current_timestamp = Some(timestamp);
            continue;
        }

        let Some(timestamp) = current_timestamp.take() else {
            continue;
        };
        let Some(executed_at) = Utc.timestamp_opt(timestamp, 0).single() else {
            continue;
        };
        if executed_at < cutoff {
            continue;
        }

        let value = line.trim();
        if value.is_empty() {
            continue;
        }

        entries.push(ShellHistoryEntry {
            value: value.to_string(),
            executed_at: executed_at.to_rfc3339(),
            source: "bash".to_string(),
            pwd: current_working_dir
                .as_ref()
                .map(|cwd| cwd.to_string_lossy().to_string()),
        });

        update_history_working_directory(
            &mut current_working_dir,
            &mut previous_working_dir,
            value,
            Some(home.as_path()),
        );
    }

    entries
}

fn read_fish_history(cutoff: DateTime<Utc>) -> Vec<ShellHistoryEntry> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    let path = home.join(".local/share/fish/fish_history");
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };

    let mut current_command: Option<String> = None;
    let mut current_working_dir: Option<PathBuf> = None;
    let mut previous_working_dir: Option<PathBuf> = None;
    let mut entries = Vec::new();

    for line in contents.lines() {
        let trimmed = line.trim();
        if let Some(command) = trimmed.strip_prefix("- cmd: ") {
            current_command = Some(command.to_string());
            continue;
        }

        let Some(timestamp) = trimmed
            .strip_prefix("when: ")
            .and_then(|value| value.parse::<i64>().ok())
        else {
            continue;
        };
        let Some(command) = current_command.take() else {
            continue;
        };
        let Some(executed_at) = Utc.timestamp_opt(timestamp, 0).single() else {
            continue;
        };
        if executed_at < cutoff {
            continue;
        }

        let value = command.trim();
        if value.is_empty() {
            continue;
        }

        entries.push(ShellHistoryEntry {
            value: value.to_string(),
            executed_at: executed_at.to_rfc3339(),
            source: "fish".to_string(),
            pwd: current_working_dir
                .as_ref()
                .map(|cwd| cwd.to_string_lossy().to_string()),
        });

        update_history_working_directory(
            &mut current_working_dir,
            &mut previous_working_dir,
            value,
            Some(home.as_path()),
        );
    }

    entries
}

fn update_history_working_directory(
    current_working_dir: &mut Option<PathBuf>,
    previous_working_dir: &mut Option<PathBuf>,
    command: &str,
    home: Option<&Path>,
) {
    let mut parts = command.split_whitespace();
    let Some(first) = parts.next() else {
        return;
    };

    let new_working_dir = match first {
        "cd" | "pushd" => resolve_history_directory_target(
            parts.next(),
            current_working_dir.as_deref(),
            previous_working_dir.as_deref(),
            home,
        ),
        "popd" => previous_working_dir
            .clone()
            .or_else(|| current_working_dir.clone()),
        _ => None,
    };

    if let Some(new_working_dir) = new_working_dir {
        *previous_working_dir = current_working_dir.clone();
        *current_working_dir = Some(new_working_dir);
    }
}

pub fn sort_history_entries_by_recency(entries: &mut [ShellHistoryEntry]) {
    entries.sort_by(|left, right| {
        let left_ts = chrono::DateTime::parse_from_rfc3339(&left.executed_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());
        let right_ts = chrono::DateTime::parse_from_rfc3339(&right.executed_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        right_ts.cmp(&left_ts)
    });
}

fn resolve_history_directory_target(
    target: Option<&str>,
    current_working_dir: Option<&Path>,
    previous_working_dir: Option<&Path>,
    home: Option<&Path>,
) -> Option<PathBuf> {
    let target = target.unwrap_or_default().trim();
    if target.is_empty() {
        return home.map(Path::to_path_buf);
    }

    if target == "-" {
        return previous_working_dir
            .map(Path::to_path_buf)
            .or_else(|| current_working_dir.map(Path::to_path_buf));
    }

    if target == "~" {
        return home.map(Path::to_path_buf);
    }

    if let Some(rest) = target.strip_prefix("~/") {
        return home.map(|home| normalize_history_path(home.join(rest)));
    }

    let target_path = Path::new(target);
    if target_path.is_absolute() {
        return Some(normalize_history_path(target_path.to_path_buf()));
    }

    let base = current_working_dir
        .map(Path::to_path_buf)
        .or_else(|| home.map(Path::to_path_buf))?;
    Some(normalize_history_path(base.join(target_path)))
}

fn normalize_history_path(path: PathBuf) -> PathBuf {
    use std::path::Component;

    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }

    normalized
}

fn read_command_version(command: &str, cwd: &Path) -> Option<String> {
    let output = std::process::Command::new(command)
        .arg("--version")
        .current_dir(cwd)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return Some(stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        None
    } else {
        Some(stderr)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracks_directory_changes_from_history_commands() {
        let home = Path::new("/user");
        let mut current_working_dir = None;
        let mut previous_working_dir = None;

        update_history_working_directory(
            &mut current_working_dir,
            &mut previous_working_dir,
            "cd /user",
            Some(home),
        );

        update_history_working_directory(
            &mut current_working_dir,
            &mut previous_working_dir,
            "cd /user/projects/ml-training",
            Some(home),
        );

        assert_eq!(
            current_working_dir.as_deref(),
            Some(Path::new("/user/projects/ml-training"))
        );

        let cwd_for_modal = current_working_dir.clone();
        update_history_working_directory(
            &mut current_working_dir,
            &mut previous_working_dir,
            "modal run train",
            Some(home),
        );

        assert_eq!(
            cwd_for_modal.as_deref(),
            Some(Path::new("/user/projects/ml-training"))
        );
        assert_eq!(
            current_working_dir.as_deref(),
            Some(Path::new("/user/projects/ml-training"))
        );

        update_history_working_directory(
            &mut current_working_dir,
            &mut previous_working_dir,
            "cd -",
            Some(home),
        );

        assert_eq!(current_working_dir.as_deref(), Some(Path::new("/user")));
    }

    #[test]
    fn terminal_ghost_does_not_fall_back_to_git_heuristics_without_history() {
        let prediction = predict_terminal_ghost_from_history("git", Some("/user"), None, &[]);
        assert!(prediction.is_none());
    }

    #[test]
    fn terminal_ghost_prefers_real_history_for_modal() {
        let history = vec![ShellHistoryEntry {
            value: "modal run train".to_string(),
            executed_at: "2026-05-03T10:00:00Z".to_string(),
            source: "app".to_string(),
            pwd: Some("/user/projects/ml-training".to_string()),
        }];

        let prediction = predict_terminal_ghost_from_history(
            "modal",
            Some("/user/projects/ml-training"),
            None,
            &history,
        )
        .expect("history match should exist");

        assert_eq!(prediction.suggestion, "modal run train");
        assert_eq!(
            prediction.kind,
            crate::ai::predict::model::PredictionKind::History
        );
    }

    #[test]
    fn terminal_ghost_response_includes_ranked_full_history_suggestions_for_bare_npm() {
        let history = vec![
            ShellHistoryEntry {
                value: "npm run deploy:frontend".to_string(),
                executed_at: "2026-05-24T18:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            ShellHistoryEntry {
                value: "npm run deploy:backend".to_string(),
                executed_at: "2026-05-24T17:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            ShellHistoryEntry {
                value: "npm run clean".to_string(),
                executed_at: "2026-05-23T18:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
            ShellHistoryEntry {
                value: "npm run clean".to_string(),
                executed_at: "2026-05-23T17:00:00Z".to_string(),
                source: "zsh".to_string(),
                pwd: Some("/repo".to_string()),
            },
        ];

        let prediction =
            predict_terminal_ghost_response_from_history("npm", Some("/repo"), None, &history)
                .expect("terminal ghost should expose history suggestions");

        assert_eq!(prediction.suggestion, "npm run clean");
        assert_eq!(
            prediction.suggestions,
            vec![
                "npm run clean",
                "npm run deploy:frontend",
                "npm run deploy:backend"
            ]
        );
    }

    #[test]
    fn terminal_ghost_suggestions_include_available_global_commands() {
        let suggestions = collect_terminal_ghost_suggestions(
            "mod",
            Some("/repo"),
            &[],
            &["modal".to_string(), "modular-cli".to_string()],
            "modal",
        );

        assert_eq!(suggestions[0], "modal");
        assert!(suggestions.contains(&"modular-cli".to_string()));
    }

    #[test]
    fn terminal_ghost_completes_modal_run_with_real_path_entries() {
        let temp_root =
            std::env::temp_dir().join(format!("octomus-ghost-path-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_root).expect("temp directory should be created");

        let script_path = temp_root.join("train.py");
        std::fs::write(&script_path, "print('hello')").expect("script should be written");

        let prediction = predict_terminal_path_completion(
            "modal run ",
            Some(temp_root.to_string_lossy().as_ref()),
        )
        .expect("path completion should exist");

        assert!(prediction.suggestion.starts_with("modal run "));
        assert!(prediction.suggestion.contains("train.py"));

        let _ = std::fs::remove_file(&script_path);
        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn terminal_ghost_prefers_path_completion_for_modal_run_over_history() {
        let temp_root = std::env::temp_dir().join(format!(
            "octomus-ghost-path-priority-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_root).expect("temp directory should be created");

        let script_path = temp_root.join("train.py");
        std::fs::write(&script_path, "print('hello')").expect("script should be written");

        let history = vec![ShellHistoryEntry {
            value: "modal run train --epochs 10".to_string(),
            executed_at: "2026-05-03T10:00:00Z".to_string(),
            source: "app".to_string(),
            pwd: Some("/user/projects/ml-training".to_string()),
        }];

        let prediction = predict_terminal_ghost_from_history(
            "modal run ",
            Some(temp_root.to_string_lossy().as_ref()),
            None,
            &history,
        )
        .expect("path completion should win");

        assert!(prediction.suggestion.starts_with("modal run "));
        assert!(prediction.suggestion.contains("train.py"));
        assert_ne!(prediction.suggestion, "modal run train --epochs 10");

        let _ = std::fs::remove_file(&script_path);
        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn terminal_ghost_uses_signature_completion_for_multi_token_modal_without_path_completion() {
        let history = vec![ShellHistoryEntry {
            value: "modal run train --epochs 10".to_string(),
            executed_at: "2026-05-03T10:00:00Z".to_string(),
            source: "app".to_string(),
            pwd: Some("/user/projects/ml-training".to_string()),
        }];

        let prediction = predict_terminal_ghost_from_history(
            "modal run",
            Some("/user/projects/ml-training"),
            None,
            &history,
        )
        .expect("history completion should exist");

        assert_eq!(prediction.suggestion, "modal run train --epochs 10");
        assert_eq!(
            prediction.kind,
            crate::ai::predict::model::PredictionKind::History
        );
    }

    #[test]
    fn terminal_ghost_prefers_full_history_over_partial_path_completion_when_token_is_started() {
        let temp_root = std::env::temp_dir().join(format!(
            "octomus-ghost-history-priority-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_root).expect("temp directory should be created");

        let script_path = temp_root.join("modal_training.py");
        std::fs::write(&script_path, "print('hello')").expect("script should be written");

        let cwd = temp_root.to_string_lossy().to_string();
        let history = vec![ShellHistoryEntry {
            value: "modal run modal_training.py --bundle-r2-uri s3://statsparrot-data/system/r2-system/training/sentinel/generated/latest".to_string(),
            executed_at: "2026-05-24T10:00:00Z".to_string(),
            source: "zsh".to_string(),
            pwd: Some(cwd.clone()),
        }];

        let prediction =
            predict_terminal_ghost_from_history("modal run modal_t", Some(&cwd), None, &history)
                .expect("history completion should win once the file token has started");

        assert_eq!(
            prediction.suggestion,
            "modal run modal_training.py --bundle-r2-uri s3://statsparrot-data/system/r2-system/training/sentinel/generated/latest"
        );

        let _ = std::fs::remove_file(&script_path);
        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn zsh_history_collapses_multiline_commands_into_single_entry() {
        let contents = "python3 -m modal run modal_training.py \\\\\n  --executor gpu-a10g \\\\\n  --epochs 50\nnpm run dev\n";

        let lines = collect_history_logical_lines(contents);

        assert_eq!(lines.len(), 2);
        assert_eq!(
            lines[0],
            "python3 -m modal run modal_training.py --executor gpu-a10g --epochs 50"
        );
        assert_eq!(lines[1], "npm run dev");
    }

    #[test]
    fn terminal_ghost_predicts_python3_option_completion() {
        let registry = crate::shell_signatures::ShellSignatureRegistry::global();
        let scope = crate::shell_signatures::CommandScope::root("python3");
        let mut metadata = crate::shell_signatures::ScopeMetadata::default();
        metadata.command_templates.insert("python3 -c ".to_string());
        metadata.command_templates.insert("python3 -m ".to_string());
        metadata.option_names.insert("-c".to_string());
        metadata.option_names.insert("-m".to_string());

        if let Ok(mut state) = registry.state.lock() {
            state.scopes.insert(scope.clone(), metadata.clone());
        }
        registry.command_registry.register_signature(
            crate::shell_signatures::registry::CommandSignature { scope, metadata },
        );

        let prediction = predict_terminal_ghost_from_history("python3 -", Some("/tmp"), None, &[])
            .expect("python3 signature completion should exist");

        assert!(prediction.suggestion.starts_with("python3 -"));
    }

    #[test]
    fn terminal_ghost_uses_available_commands_as_last_resort() {
        let prediction = predict_terminal_ghost_from_history_with_commands(
            "pyth",
            Some("/user/projects/ml-training"),
            None,
            &[],
            &["python3".to_string(), "python".to_string()],
        )
        .expect("available commands should provide a suggestion");

        assert_eq!(prediction.suggestion, "python3");
        assert_eq!(
            prediction.kind,
            crate::ai::predict::model::PredictionKind::Heuristic
        );
    }
}
