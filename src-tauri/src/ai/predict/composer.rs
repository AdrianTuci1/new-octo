use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};

use crate::terminal::{
    home_dir, terminal_list_directory_entries, ListDirectoryEntriesRequest, ShellHistoryEntry,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerMessageInput {
    pub role: String,
    pub body: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerTerminalBlockInput {
    pub command: String,
    pub output: Option<String>,
    pub exit_code: Option<i32>,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerIntelligenceRequest {
    pub context_key: String,
    pub query: String,
    pub cwd: Option<String>,
    pub available_commands: Vec<String>,
    pub history_entries: Vec<ShellHistoryEntry>,
    pub terminal_blocks: Vec<ComposerTerminalBlockInput>,
    pub messages: Vec<ComposerMessageInput>,
    pub locked_mode: Option<String>,
    pub autodetect_enabled: bool,
    pub allow_single_character_prediction: bool,
    pub force_shell_mode: bool,
    pub enable_zero_state_prediction: bool,
    pub surface: String,
}

#[derive(Clone, Default)]
pub struct ComposerIntelligenceManager {
    sessions: Arc<Mutex<HashMap<String, ComposerSessionState>>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum SuggestionType {
    ShellCommand,
    AiQuery,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct IgnoredSuggestionKey {
    suggestion: String,
    suggestion_type: SuggestionType,
}

#[derive(Clone, Default)]
struct ComposerSessionState {
    previous_mode: Option<String>,
    rejected_suggestions: HashSet<IgnoredSuggestionKey>,
    cached_zero_state_suggestion: Option<String>,
    cached_zero_state_anchor: Option<String>,
    last_query: String,
    last_prediction: Option<String>,
    last_prediction_type: Option<SuggestionType>,
}

impl ComposerIntelligenceManager {
    fn take_state(&self, context_key: &str) -> ComposerSessionState {
        self.sessions
            .lock()
            .ok()
            .and_then(|sessions| sessions.get(context_key).cloned())
            .unwrap_or_default()
    }

    fn store_state(&self, context_key: String, state: ComposerSessionState) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.insert(context_key, state);
            if sessions.len() > 32 {
                if let Some(key) = sessions.keys().next().cloned() {
                    sessions.remove(&key);
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerPredictionResponse {
    pub suggestion: String,
    pub suggestions: Vec<String>,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerRecommendedActionResponse {
    pub id: String,
    pub label: String,
    pub value: String,
    pub description: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerIntelligenceResponse {
    pub mode: String,
    pub shell_source: Option<String>,
    pub prediction: Option<ComposerPredictionResponse>,
    pub recommended_action: Option<ComposerRecommendedActionResponse>,
}

pub async fn get_composer_intelligence(
    manager: &ComposerIntelligenceManager,
    ai_manager: &crate::ai::AgentHarnessManager,
    request: ComposerIntelligenceRequest,
) -> ComposerIntelligenceResponse {
    let mut state = manager.take_state(&request.context_key);
    let current_zero_state_anchor = zero_state_anchor(&request);
    if let Some(last_prediction) = state.last_prediction.clone() {
        if !state.last_query.trim().is_empty()
            && request.query.starts_with(&state.last_query)
            && !last_prediction.starts_with(&request.query)
        {
            state.rejected_suggestions.insert(IgnoredSuggestionKey {
                suggestion: last_prediction,
                suggestion_type: state
                    .last_prediction_type
                    .unwrap_or(SuggestionType::ShellCommand),
            });
        }
    }

    if state.cached_zero_state_anchor.as_ref() != current_zero_state_anchor.as_ref() {
        state.cached_zero_state_suggestion = None;
        state.cached_zero_state_anchor = current_zero_state_anchor.clone();
    }

    let mode = resolve_composer_mode(&request, state.previous_mode.as_deref());
    let shell_source = match request.locked_mode.as_deref() {
        Some("shell") => Some("manual".to_string()),
        Some("chat") => None,
        _ if mode == "shell" => {
            if request.force_shell_mode {
                Some("manual".to_string())
            } else {
                Some("autodetected".to_string())
            }
        }
        _ => None,
    };
    let prediction = build_composer_prediction(&request, &mode, &state, ai_manager).await;
    let recommended_action = build_recommended_action(&request, &mode);
    state.previous_mode = Some(mode.clone());
    state.last_query = request.query.clone();
    state.last_prediction = prediction.as_ref().map(|value| value.suggestion.clone());
    state.last_prediction_type = prediction.as_ref().map(|value| match value.kind.as_str() {
        "ai_query" => SuggestionType::AiQuery,
        _ => SuggestionType::ShellCommand,
    });
    if request.query.trim().is_empty() {
        state.cached_zero_state_anchor = current_zero_state_anchor;
        state.cached_zero_state_suggestion =
            prediction.as_ref().map(|value| value.suggestion.clone());
    }
    manager.store_state(request.context_key.clone(), state);

    ComposerIntelligenceResponse {
        mode,
        shell_source,
        prediction,
        recommended_action,
    }
}

fn resolve_composer_mode(
    request: &ComposerIntelligenceRequest,
    previous_mode: Option<&str>,
) -> String {
    if request.force_shell_mode {
        return "shell".to_string();
    }

    match request.locked_mode.as_deref() {
        Some("shell") => return "shell".to_string(),
        Some("chat") => return "chat".to_string(),
        _ => {}
    }

    if !request.autodetect_enabled {
        return "chat".to_string();
    }

    if is_likely_shell_command(
        request.query.trim(),
        &request.available_commands,
        &request.history_entries,
        &request.messages,
        previous_mode,
    ) {
        "shell".to_string()
    } else {
        "chat".to_string()
    }
}

async fn build_composer_prediction(
    request: &ComposerIntelligenceRequest,
    mode: &str,
    state: &ComposerSessionState,
    ai_manager: &crate::ai::AgentHarnessManager,
) -> Option<ComposerPredictionResponse> {
    if mode != "shell" {
        return None;
    }

    let trimmed = request.query.trim();
    if trimmed.starts_with('/') {
        return None;
    }

    let rejected: HashSet<&str> = state
        .rejected_suggestions
        .iter()
        .filter(|key| key.suggestion_type == SuggestionType::ShellCommand)
        .map(|key| key.suggestion.as_str())
        .collect();
    let mut suggestions = Vec::<(String, &'static str)>::new();
    let last_command = request
        .terminal_blocks
        .iter()
        .rev()
        .find(|block| block.status == "finished")
        .map(|block| block.command.as_str());

    if trimmed.is_empty() {
        if !request.enable_zero_state_prediction {
            return None;
        }

        if let Some(cached) = state.cached_zero_state_suggestion.as_ref() {
            push_unique_candidate(&mut suggestions, cached.trim().to_string(), "history");
        }

        for suggestion in collect_sequence_candidates(
            last_command,
            None,
            &request.history_entries,
            request.cwd.as_deref(),
        ) {
            push_unique_candidate(&mut suggestions, suggestion, "history");
        }

        if let Some(prediction) =
            super::model::predict_from_sequences(last_command, &request.history_entries)
        {
            push_unique_candidate(&mut suggestions, prediction.suggestion, "history");
        }

        for suggestion in super::model::get_zero_state_suggestions(
            request.cwd.as_deref().unwrap_or("."),
        ) {
            push_unique_candidate(&mut suggestions, suggestion, "heuristic");
        }
    } else {
        if !request.allow_single_character_prediction && trimmed.len() == 1 {
            return None;
        }

        for suggestion in collect_sequence_candidates(
            last_command,
            Some(trimmed),
            &request.history_entries,
            request.cwd.as_deref(),
        ) {
            push_unique_candidate(&mut suggestions, suggestion, "history");
        }

        for suggestion in collect_history_prefix_matches(trimmed, &request.history_entries, request.cwd.as_deref()) {
            push_unique_candidate(&mut suggestions, suggestion, "history");
        }

        if let Some(path_suggestion) = predict_path_completion(trimmed, request.cwd.as_deref()) {
            push_unique_candidate(&mut suggestions, path_suggestion, "completion");
        }

        if let Some(prediction) = super::model::predict_next_command(trimmed, last_command) {
            push_unique_candidate(&mut suggestions, prediction.suggestion, "heuristic");
        }

        if let Some(prediction) =
            super::model::predict_from_executables(trimmed, &request.available_commands)
        {
            push_unique_candidate(&mut suggestions, prediction.suggestion, "completion");
        }
    }

    if suggestions.is_empty() {
        if let Some(prediction) =
            build_ai_prediction(request, ai_manager, last_command, &request.history_entries).await
        {
            push_unique_candidate(&mut suggestions, prediction.suggestion, "ai");
        }
    }

    suggestions.retain(|(suggestion, _)| {
        let candidate = suggestion.trim();
        !candidate.is_empty()
            && candidate != trimmed
            && !rejected.contains(candidate)
            && (trimmed.is_empty() || candidate.to_lowercase().starts_with(&trimmed.to_lowercase()))
    });

    let Some((suggestion, kind)) = suggestions.first().cloned() else {
        return None;
    };

    Some(ComposerPredictionResponse {
        suggestion,
        suggestions: suggestions.into_iter().map(|(value, _)| value).collect(),
        kind: kind.to_string(),
    })
}

async fn build_ai_prediction(
    request: &ComposerIntelligenceRequest,
    ai_manager: &crate::ai::AgentHarnessManager,
    last_command: Option<&str>,
    history_entries: &[ShellHistoryEntry],
) -> Option<super::model::CommandPrediction> {
    let provider_config = ai_manager
        .load_provider_config_from_disk()
        .ok()
        .flatten()
        .or_else(|| ai_manager.provider_config().ok().flatten())
        .or_else(crate::ai::agent::openai::OpenAiCompatibleConfig::from_env)?;
    let history_context = build_history_context(last_command, history_entries, request.cwd.as_deref());
    let context_messages = request
        .terminal_blocks
        .iter()
        .rev()
        .filter(|block| block.status == "finished")
        .take(5)
        .map(|block| super::model::ContextMessageInput {
            input: block.command.clone(),
            output: summarize_output(block.output.as_deref().unwrap_or_default()),
            context: super::model::CommandContext {
                pwd: request.cwd.clone(),
                git_branch: None,
                exit_code: i64::from(block.exit_code.unwrap_or_default()),
            },
        })
        .collect::<Vec<_>>();
    let last_command = request
        .terminal_blocks
        .iter()
        .rev()
        .find(|block| block.status == "finished")
        .map(|block| block.command.as_str());

    super::ai_client::predict_with_llm(
        &request.query,
        last_command,
        context_messages,
        history_context,
        &provider_config.api_key,
        &provider_config.base_url,
        &provider_config.model_id,
    )
    .await
}

fn summarize_output(output: &str) -> String {
    let lines = output.lines().collect::<Vec<_>>();
    if lines.len() <= 12 {
        return output.to_string();
    }

    let mut summary = lines
        .iter()
        .take(5)
        .map(|line| (*line).to_string())
        .collect::<Vec<_>>();
    summary.push("...".to_string());
    summary.extend(
        lines
            .iter()
            .skip(lines.len().saturating_sub(5))
            .map(|line| (*line).to_string()),
    );
    summary.join("\n")
}

fn build_recommended_action(
    request: &ComposerIntelligenceRequest,
    mode: &str,
) -> Option<ComposerRecommendedActionResponse> {
    if !request.query.trim().is_empty() {
        return None;
    }

    let last_finished_block = request
        .terminal_blocks
        .iter()
        .rev()
        .find(|block| block.status == "finished");
    let last_user_message = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user");

    if request.surface == "terminal" {
        let block = last_finished_block?;
        if matches!(block.exit_code, Some(code) if code != 0) {
            return Some(recommended_action(
                "terminal-explain-last-failure",
                "Explain this failure",
                format!(
                    "Explain why `{}` failed and suggest the safest next command.",
                    block.command
                ),
                "Turn the latest command failure into an actionable fix.",
                "chat",
            ));
        }

        let command = block.command.trim();
        if command.starts_with("git add") || command.starts_with("git restore --staged") {
            return Some(recommended_action(
                "terminal-git-commit",
                "Commit staged changes",
                "git commit -m \"describe changes\"".to_string(),
                "A common next step after updating the git index.",
                "shell",
            ));
        }

        if command.starts_with("git commit") {
            return Some(recommended_action(
                "terminal-git-push",
                "Push the branch",
                "git push".to_string(),
                "Follow the latest commit by pushing it upstream.",
                "shell",
            ));
        }

        if command.starts_with("git status") {
            return Some(recommended_action(
                "terminal-git-summarize",
                "Review repo status",
                "Summarize the current git status and recommend the next safe command."
                    .to_string(),
                "Ask the agent to turn git status into a concrete next step.",
                "chat",
            ));
        }

        if command.starts_with("cargo build") {
            return Some(recommended_action(
                "terminal-run-tests",
                "Run the test suite",
                "cargo test".to_string(),
                "Validate the latest Rust build with tests.",
                "shell",
            ));
        }

        if command.starts_with("docker compose up") || command.starts_with("docker-compose up") {
            let next_command = if command.starts_with("docker compose") {
                "docker compose logs -f"
            } else {
                "docker-compose logs -f"
            };
            return Some(recommended_action(
                "terminal-docker-logs",
                "Tail container logs",
                next_command.to_string(),
                "Inspect live output from the containers you just started.",
                "shell",
            ));
        }

        return None;
    }

    if mode != "chat" {
        return None;
    }

    if let Some(block) = last_finished_block {
        if matches!(block.exit_code, Some(code) if code != 0) {
            return Some(recommended_action(
                "explain-last-command-failure",
                "Explain last failure",
                format!(
                    "Explain why `{}` failed and suggest the safest next step.",
                    block.command
                ),
                "Turn the latest failed command into an actionable explanation.",
                "chat",
            ));
        }

        if block.command.starts_with("git status") {
            return Some(recommended_action(
                "summarize-git-status",
                "Summarize repo status",
                "Summarize the current git status and recommend the next safe command."
                    .to_string(),
                "Use the latest git status block as context.",
                "chat",
            ));
        }

        if block.command.starts_with("git add") {
            return Some(recommended_action(
                "draft-commit-message",
                "Draft commit message",
                "Review the staged changes and draft a concise git commit message.".to_string(),
                "Useful after staging work but before committing it.",
                "chat",
            ));
        }

        if block.command.starts_with("git commit") {
            return Some(recommended_action(
                "prepare-push",
                "Prepare the push",
                "Check whether this branch is ready to push and call out any final risks."
                    .to_string(),
                "Helpful right after a local commit.",
                "chat",
            ));
        }

        if block.command.starts_with("cargo test") || block.command.starts_with("npm test") {
            return Some(recommended_action(
                "review-latest-tests",
                "Review test results",
                "Review the latest test output and point out the most important failures first."
                    .to_string(),
                "Useful after a recent test run.",
                "chat",
            ));
        }

        return Some(recommended_action(
            "explain-last-command-output",
            "Recommend the next step",
            format!(
                "Review the latest terminal command `{}` and recommend the next high-impact action.",
                block.command
            ),
            "Uses the most recent terminal activity as context.",
            "chat",
        ));
    }

    if let Some(message) = last_user_message {
        if message.body.to_lowercase().contains("mcp") {
            return Some(recommended_action(
                "continue-mcp-setup",
                "Continue MCP setup",
                "/create-mcp ".to_string(),
                "Resume the MCP setup flow from the chat composer.",
                "chat",
            ));
        }
    }

    Some(recommended_action(
        "plan-next-step",
        "Recommend the next step",
        "Review this repository and recommend the next high-impact improvement.".to_string(),
        "A lightweight prompt when the composer is idle.",
        "chat",
    ))
}

fn recommended_action(
    id: &str,
    label: &str,
    value: String,
    description: &str,
    mode: &str,
) -> ComposerRecommendedActionResponse {
    ComposerRecommendedActionResponse {
        id: id.to_string(),
        label: label.to_string(),
        value,
        description: description.to_string(),
        mode: mode.to_string(),
    }
}

fn zero_state_anchor(request: &ComposerIntelligenceRequest) -> Option<String> {
    request
        .terminal_blocks
        .iter()
        .rev()
        .find(|block| block.status == "finished")
        .map(|block| {
            format!(
                "{}::{}",
                request.cwd.as_deref().unwrap_or_default(),
                block.command.trim()
            )
        })
}

fn push_unique_candidate(
    candidates: &mut Vec<(String, &'static str)>,
    candidate: String,
    kind: &'static str,
) {
    let trimmed = candidate.trim();
    if trimmed.is_empty() || candidates.iter().any(|(existing, _)| existing == trimmed) {
        return;
    }

    candidates.push((trimmed.to_string(), kind));
}

fn build_history_context(
    last_command: Option<&str>,
    history_entries: &[ShellHistoryEntry],
    cwd: Option<&str>,
) -> String {
    collect_sequence_candidates(last_command, None, history_entries, cwd)
        .into_iter()
        .take(5)
        .enumerate()
        .map(|(index, suggestion)| {
            format!(
                "Example {}:\nPrevious command: {}\nNext command: {}",
                index + 1,
                last_command.unwrap_or("none"),
                suggestion
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn collect_sequence_candidates(
    last_command: Option<&str>,
    prefix: Option<&str>,
    history_entries: &[ShellHistoryEntry],
    cwd: Option<&str>,
) -> Vec<String> {
    let Some(last_command) = last_command.map(str::trim).filter(|value| !value.is_empty()) else {
        return Vec::new();
    };
    let prefix = prefix.map(str::to_lowercase);
    let mut counts = HashMap::<String, usize>::new();
    let mut same_dir_counts = HashMap::<String, usize>::new();
    let mut latest_timestamp = HashMap::<String, &str>::new();

    for pair in history_entries.windows(2) {
        let newer = &pair[0];
        let older = &pair[1];
        if older.value.trim() != last_command {
            continue;
        }

        let candidate = newer.value.trim();
        if candidate.is_empty() || candidate == last_command {
            continue;
        }

        if let Some(prefix) = prefix.as_deref() {
            if !candidate.to_lowercase().starts_with(prefix) {
                continue;
            }
        }

        *counts.entry(candidate.to_string()).or_insert(0) += 1;
        if cwd.is_some() && newer.pwd.as_deref() == cwd {
            *same_dir_counts.entry(candidate.to_string()).or_insert(0) += 1;
        }

        let timestamp = newer.executed_at.as_str();
        latest_timestamp
            .entry(candidate.to_string())
            .and_modify(|current| {
                if timestamp > *current {
                    *current = timestamp;
                }
            })
            .or_insert(timestamp);
    }

    let mut ranked = counts.into_iter().collect::<Vec<_>>();
    ranked.sort_by(|(left_value, left_count), (right_value, right_count)| {
        let left_same_dir = same_dir_counts.get(left_value).copied().unwrap_or_default();
        let right_same_dir = same_dir_counts.get(right_value).copied().unwrap_or_default();
        right_same_dir
            .cmp(&left_same_dir)
            .then_with(|| right_count.cmp(left_count))
            .then_with(|| {
                latest_timestamp
                    .get(right_value)
                    .cmp(&latest_timestamp.get(left_value))
            })
            .then_with(|| right_value.len().cmp(&left_value.len()))
    });

    ranked.into_iter().map(|(value, _)| value).collect()
}

fn collect_history_prefix_matches(
    input: &str,
    history_entries: &[ShellHistoryEntry],
    cwd: Option<&str>,
) -> Vec<String> {
    let normalized_input = input.to_lowercase();
    let mut matches = history_entries
        .iter()
        .filter(|entry| entry.value.to_lowercase().starts_with(&normalized_input))
        .collect::<Vec<_>>();

    matches.sort_by(|left, right| {
        let left_same_dir = cwd.is_some() && left.pwd.as_deref() == cwd;
        let right_same_dir = cwd.is_some() && right.pwd.as_deref() == cwd;
        right_same_dir
            .cmp(&left_same_dir)
            .then_with(|| right.executed_at.cmp(&left.executed_at))
    });

    matches
        .into_iter()
        .map(|entry| entry.value.trim().to_string())
        .collect()
}

fn is_likely_shell_command(
    query: &str,
    available_commands: &[String],
    history_entries: &[ShellHistoryEntry],
    messages: &[ComposerMessageInput],
    previous_mode: Option<&str>,
) -> bool {
    if query.is_empty() || query.contains('\n') {
        return false;
    }

    let tokens = query.split_whitespace().collect::<Vec<_>>();
    if tokens.is_empty() {
        return false;
    }

    let first_token = tokens[0].to_lowercase();
    let sticky_ai_words = [
        "yes", "no", "ok", "okay", "thanks", "thank", "sure", "please", "help", "again",
    ];
    if previous_mode == Some("chat") && sticky_ai_words.contains(&first_token.as_str()) && tokens.len() <= 2 {
        return false;
    }

    if messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
        .is_some()
        && matches!(
            query.trim().to_lowercase().as_str(),
            "yes" | "no" | "ok" | "okay" | "thanks" | "please" | "do it" | "try again" | "go ahead" | "sounds good" | "continue"
        )
    {
        return false;
    }

    if query.contains('?')
        || query.contains('ă')
        || query.contains('â')
        || query.contains('î')
        || query.contains('ș')
        || query.contains('ş')
        || query.contains('ț')
        || query.contains('ţ')
    {
        return false;
    }

    let natural_language_tokens = [
        "cum", "ce", "de", "nu", "sa", "sunt", "este", "vreau", "putem", "please", "how",
        "what", "why", "can", "could",
    ];
    if tokens
        .iter()
        .any(|token| natural_language_tokens.contains(&token.to_lowercase().as_str()))
    {
        return false;
    }

    if !query
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || "_./:@~\"'=+- *#$&|<>".contains(ch))
    {
        return false;
    }

    if query.starts_with("~/")
        || query.starts_with("./")
        || query.starts_with("../")
        || query.starts_with('#')
        || query.starts_with('$')
        || query.starts_with('*')
        || query.contains(" && ")
        || query.contains(" | ")
        || query.contains(" > ")
        || query.contains(" < ")
    {
        return true;
    }

    if available_commands
        .iter()
        .any(|command| command.eq_ignore_ascii_case(&first_token))
    {
        return true;
    }

    if has_close_history_match(query, history_entries) {
        return true;
    }

    if tokens.len() > 1
        && first_token
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | '/'))
    {
        return true;
    }

    if first_token.len() >= 2 {
        return available_commands
            .iter()
            .any(|command| command.to_lowercase().starts_with(&first_token));
    }

    false
}

fn has_close_history_match(query: &str, history_entries: &[ShellHistoryEntry]) -> bool {
    let normalized_query = normalize_similarity_text(query);
    if normalized_query.is_empty() {
        return false;
    }

    history_entries.iter().any(|entry| {
        let normalized_entry = normalize_similarity_text(&entry.value);
        !normalized_entry.is_empty()
            && (normalized_entry.starts_with(&normalized_query)
                || similarity(&normalized_query, &normalized_entry) >= 0.9)
    })
}

fn normalize_similarity_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn similarity(left: &str, right: &str) -> f32 {
    let longer_length = left.len().max(right.len());
    if longer_length == 0 {
        return 1.0;
    }

    1.0 - (levenshtein(left, right) as f32 / longer_length as f32)
}

fn levenshtein(left: &str, right: &str) -> usize {
    let left_chars = left.chars().collect::<Vec<_>>();
    let right_chars = right.chars().collect::<Vec<_>>();
    let mut prev = (0..=right_chars.len()).collect::<Vec<_>>();
    let mut current = vec![0; right_chars.len() + 1];

    for (row_index, left_char) in left_chars.iter().enumerate() {
        current[0] = row_index + 1;
        for (col_index, right_char) in right_chars.iter().enumerate() {
            let substitution_cost = usize::from(left_char != right_char);
            current[col_index + 1] = (current[col_index] + 1)
                .min(prev[col_index + 1] + 1)
                .min(prev[col_index] + substitution_cost);
        }
        std::mem::swap(&mut prev, &mut current);
    }

    prev[right_chars.len()]
}

fn predict_path_completion(input: &str, cwd: Option<&str>) -> Option<String> {
    let cwd = cwd?;
    let token_start = input.rfind(char::is_whitespace).map(|index| index + 1).unwrap_or(0);
    let token = input.get(token_start..)?.trim();
    if token.is_empty() {
        return None;
    }

    let (directory_path, partial_name, replacement_prefix) =
        build_path_completion_request(token, cwd)?;
    let listing = terminal_list_directory_entries(ListDirectoryEntriesRequest {
        path: Some(directory_path),
        query: Some(partial_name),
        directories_only: Some(false),
    })
    .ok()?;
    let next_entry = listing.entries.into_iter().next()?;
    let replacement = format!(
        "{}{}{}",
        replacement_prefix,
        next_entry.name,
        if next_entry.is_directory { "/" } else { "" }
    );
    let full_command = format!("{}{}", &input[..token_start], replacement);
    if full_command == input {
        None
    } else {
        Some(full_command)
    }
}

fn build_path_completion_request(
    token: &str,
    cwd: &str,
) -> Option<(String, String, String)> {
    if token.starts_with("~/") {
        let home = home_dir()?;
        return build_nested_path_request(token, &home.to_string_lossy(), "~/");
    }

    if token.starts_with('/') {
        return build_nested_path_request(token, "/", "/");
    }

    if token.starts_with("./") || token.starts_with("../") || token.contains('/') {
        return build_nested_path_request(token, cwd, "");
    }

    None
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

    Some((
        directory_path,
        partial_name.to_string(),
        replacement_prefix,
    ))
}
