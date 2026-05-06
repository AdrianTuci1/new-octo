use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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
    #[serde(default)]
    pub git_branch: Option<String>,
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
    cached_zero_state_candidates: Vec<String>,
    cached_zero_state_anchor: Option<String>,
    cached_recommended_action: Option<ComposerRecommendedActionResponse>,
    cached_recommended_action_anchor: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    let current_recommended_action_anchor = recommended_action_anchor(&request);
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
        state.cached_zero_state_candidates.clear();
        state.cached_zero_state_anchor = current_zero_state_anchor.clone();
    }
    if state.cached_recommended_action_anchor.as_ref() != current_recommended_action_anchor.as_ref()
    {
        state.cached_recommended_action = None;
        state.cached_recommended_action_anchor = current_recommended_action_anchor.clone();
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
    let recommended_action = build_recommended_action(&request, &mode, &state, ai_manager).await;
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
        state.cached_zero_state_candidates = prediction
            .as_ref()
            .map(|value| value.suggestions.clone())
            .unwrap_or_default();
        state.cached_recommended_action_anchor = current_recommended_action_anchor;
        state.cached_recommended_action = recommended_action.clone();
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

    let raw_query = request.query.trim_start();
    let trimmed = raw_query.trim_end();
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
    let prediction_history = build_prediction_history(request);
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
            &prediction_history,
            request.cwd.as_deref(),
        ) {
            push_unique_candidate(&mut suggestions, suggestion, "history");
        }

        if let Some(prediction) =
            super::model::predict_from_sequences(last_command, &prediction_history)
        {
            push_unique_candidate(&mut suggestions, prediction.suggestion, "history");
        }

        for suggestion in
            super::model::get_zero_state_suggestions(request.cwd.as_deref().unwrap_or("."))
        {
            push_unique_candidate(&mut suggestions, suggestion, "heuristic");
        }
    } else {
        if !request.allow_single_character_prediction && trimmed.len() == 1 {
            return None;
        }

        for suggestion in collect_sequence_candidates(
            last_command,
            Some(trimmed),
            &prediction_history,
            request.cwd.as_deref(),
        ) {
            push_unique_candidate(&mut suggestions, suggestion, "history");
        }

        for suggestion in
            collect_history_prefix_matches(trimmed, &prediction_history, request.cwd.as_deref())
        {
            push_unique_candidate(&mut suggestions, suggestion, "history");
        }

        for suggestion in collect_completion_candidates(raw_query, request) {
            push_unique_candidate(&mut suggestions, suggestion, "completion");
        }

        for suggestion in collect_git_command_candidates(trimmed, request, last_command) {
            push_unique_candidate(&mut suggestions, suggestion, "completion");
        }

        for suggestion in state
            .cached_zero_state_candidates
            .iter()
            .filter(|candidate| {
                candidate
                    .to_lowercase()
                    .starts_with(&trimmed.to_lowercase())
            })
        {
            push_unique_candidate(&mut suggestions, suggestion.clone(), "history");
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

    if suggestions.is_empty() && should_use_ai_shell_prediction(request, trimmed) {
        if let Some(prediction) = build_ai_prediction(
            request,
            state,
            ai_manager,
            last_command,
            &prediction_history,
        )
        .await
        {
            push_unique_candidate(&mut suggestions, prediction.suggestion, "ai");
        }
    }

    let overlay_prefix = if raw_query.chars().last().is_some_and(char::is_whitespace) {
        raw_query.to_lowercase()
    } else {
        trimmed.to_lowercase()
    };
    suggestions.retain(|(suggestion, _)| {
        let candidate = suggestion.trim();
        !candidate.is_empty()
            && candidate != trimmed
            && !rejected.contains(candidate)
            && (trimmed.is_empty() || candidate.to_lowercase().starts_with(&overlay_prefix))
            && is_command_candidate_valid(candidate, request)
    });
    rank_shell_candidates(
        &mut suggestions,
        request,
        &prediction_history,
        trimmed,
        last_command,
    );

    let Some((suggestion, kind)) = suggestions.first().cloned() else {
        return None;
    };

    Some(ComposerPredictionResponse {
        suggestion,
        suggestions: suggestions.into_iter().map(|(value, _)| value).collect(),
        kind: kind.to_string(),
    })
}

fn should_use_ai_shell_prediction(request: &ComposerIntelligenceRequest, input: &str) -> bool {
    request.surface == "terminal" && (input.is_empty() || input.len() >= 3)
}

async fn build_ai_prediction(
    request: &ComposerIntelligenceRequest,
    state: &ComposerSessionState,
    ai_manager: &crate::ai::AgentHarnessManager,
    last_command: Option<&str>,
    history_entries: &[ShellHistoryEntry],
) -> Option<super::model::CommandPrediction> {
    let provider_config = ai_manager
        .load_provider_config_from_disk()
        .ok()
        .flatten()
        .filter(|config| !config.api_key.trim().is_empty())
        .or_else(|| ai_manager.provider_config().ok().flatten())
        .filter(|config| !config.api_key.trim().is_empty())
        .or_else(crate::ai::agent::openai::OpenAiCompatibleConfig::from_env)?;
    let history_context =
        build_history_context(last_command, history_entries, request.cwd.as_deref());
    let rejected_suggestions = state
        .rejected_suggestions
        .iter()
        .filter(|key| key.suggestion_type == SuggestionType::ShellCommand)
        .map(|key| key.suggestion.clone())
        .collect::<Vec<_>>();
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
        rejected_suggestions,
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

async fn build_ai_recommended_action(
    request: &ComposerIntelligenceRequest,
    mode: &str,
    ai_manager: &crate::ai::AgentHarnessManager,
) -> Option<ComposerRecommendedActionResponse> {
    let has_terminal_context = request
        .terminal_blocks
        .iter()
        .any(|block| block.status == "finished");
    let has_conversation_context = request
        .messages
        .iter()
        .any(|message| message.role == "user" && !message.body.trim().is_empty());
    if !has_terminal_context && !has_conversation_context {
        return None;
    }

    let provider_config = ai_manager
        .load_provider_config_from_disk()
        .ok()
        .flatten()
        .filter(|config| !config.api_key.trim().is_empty())
        .or_else(|| ai_manager.provider_config().ok().flatten())
        .filter(|config| !config.api_key.trim().is_empty())
        .or_else(crate::ai::agent::openai::OpenAiCompatibleConfig::from_env)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .ok()?;
    let endpoint = resolve_chat_endpoint(&provider_config.base_url);
    let last_finished_block = request
        .terminal_blocks
        .iter()
        .rev()
        .find(|block| block.status == "finished");
    let terminal_context = request
        .terminal_blocks
        .iter()
        .rev()
        .take(5)
        .map(|block| {
            format!(
                "Command: {}\nStatus: {}\nExit code: {}\nOutput:\n{}",
                block.command.trim(),
                block.status,
                block
                    .exit_code
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string()),
                summarize_output(block.output.as_deref().unwrap_or_default())
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");
    let conversation_context = request
        .messages
        .iter()
        .rev()
        .take(6)
        .rev()
        .map(|message| format!("{}: {}", message.role, message.body.trim()))
        .collect::<Vec<_>>()
        .join("\n");
    let preferred_mode = if request.surface == "terminal" {
        "This is a terminal recommendation. Return the single best AI prompt the user should run next based on the latest terminal context. It can be imperative, for example 'Explain why <command> failed and suggest the safest next step.' label must be a short version of that prompt, not a topic or summary. Do not return a shell command. mode must be \"chat\"."
    } else if mode == "chat" {
        "This is an AI composer recommendation. Return the single best follow-up request that should come next after the previous user requirement or terminal action. label must be a short version of that follow-up, not a topic or summary. Do not return a shell command. mode must be \"chat\"."
    } else {
        "Return the single best follow-up prompt for the AI assistant. label must be a short version of that follow-up, not a topic or summary. Do not return a shell command. mode must be \"chat\"."
    };
    let latest_summary = last_finished_block
        .map(|block| {
            format!(
                "Latest completed terminal action: `{}` (exit code {}).",
                block.command.trim(),
                block
                    .exit_code
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            )
        })
        .unwrap_or_else(|| "No completed terminal action is available.".to_string());

    let request_body = json!({
        "model": provider_config.model_id,
        "messages": [
            {
                "role": "system",
                "content": "You produce exactly one high-signal recommended AI follow-up for a developer assistant launcher. Respond with a single JSON object only. The object must contain: id, label, value, description, mode. mode must always be \"chat\". label must be a compact version of the actual follow-up, at most 10 words, suitable for a small UI chip. It must not be just a topic or generic text like 'continue task', 'recommend next step', or 'help further'. value must be the full natural-language follow-up to insert into the AI composer, grounded in the current context. On terminal surfaces, value should usually be an imperative AI prompt about the latest terminal context. On normal AI composer surfaces, value should usually be the smart follow-up that comes next after the previous requirement or command. Never return a shell command, code block, markdown, or multiple options. description must be one sentence explaining why this follow-up is the best next move. Match the user's recent language when it is clear."
            },
            {
                "role": "user",
                "content": format!(
                    "Surface: {}\nResolved mode: {}\nWorking directory: {}\n{}\n{}\n\nRecent conversation:\n{}\n\nRecent terminal context:\n{}\n\nReturn one JSON object only.",
                    request.surface,
                    mode,
                    request.cwd.as_deref().unwrap_or("unknown"),
                    preferred_mode,
                    latest_summary,
                    if conversation_context.is_empty() { "none" } else { &conversation_context },
                    if terminal_context.is_empty() { "none" } else { &terminal_context },
                )
            }
        ],
        "temperature": 0.2,
        "max_tokens": 180
    });

    let response = client
        .post(endpoint)
        .bearer_auth(&provider_config.api_key)
        .json(&request_body)
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }

    let value: Value = response.json().await.ok()?;
    let content = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)?
        .trim()
        .to_string();
    let payload = extract_json_object(&content)?;
    let action = parse_ai_recommended_action(payload)?;
    if action.mode != "chat" {
        return None;
    }
    Some(action)
}

async fn build_recommended_action(
    request: &ComposerIntelligenceRequest,
    mode: &str,
    state: &ComposerSessionState,
    ai_manager: &crate::ai::AgentHarnessManager,
) -> Option<ComposerRecommendedActionResponse> {
    if !request.query.trim().is_empty() {
        return None;
    }

    if let Some(cached) = state.cached_recommended_action.clone() {
        return Some(cached);
    }

    if let Some(action) = build_ai_recommended_action(request, mode, ai_manager).await {
        return Some(action);
    }

    build_heuristic_recommended_action(request, mode)
}

fn build_heuristic_recommended_action(
    request: &ComposerIntelligenceRequest,
    mode: &str,
) -> Option<ComposerRecommendedActionResponse> {
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
            return Some(recommended_prompt_action(
                "terminal-explain-last-failure",
                format!(
                    "Explain why `{}` failed and suggest the safest next step.",
                    block.command
                ),
                "Turn the latest command failure into an actionable fix.",
            ));
        }

        let command = block.command.trim();
        if command.starts_with("git add") || command.starts_with("git restore --staged") {
            return Some(recommended_prompt_action(
                "terminal-review-staged-changes",
                "Review the staged changes, draft a concise commit message, and tell me if anything important is still unstaged.".to_string(),
                "Useful right after updating the git index.",
            ));
        }

        if command.starts_with("git commit") {
            return Some(recommended_prompt_action(
                "terminal-prepare-push",
                "Check whether this branch is ready to push and call out any final risks or follow-up checks before I do it.".to_string(),
                "Helpful right after a local commit.",
            ));
        }

        if command.starts_with("git status") {
            return Some(recommended_prompt_action(
                "terminal-git-summarize",
                "Summarize the current git status and recommend the next safe step.".to_string(),
                "Ask the agent to turn git status into a concrete next step.",
            ));
        }

        if command.starts_with("cargo build") {
            return Some(recommended_prompt_action(
                "terminal-review-build-result",
                "Review the latest Rust build result and tell me the best next step, including whether I should run tests or fix something first.".to_string(),
                "Useful after a successful or noisy Rust build.",
            ));
        }

        if command.starts_with("docker compose up") || command.starts_with("docker-compose up") {
            return Some(recommended_prompt_action(
                "terminal-review-containers",
                "Look at the latest container startup context and tell me what I should inspect next, especially logs, health checks, or failing services.".to_string(),
                "Helpful after starting containers locally.",
            ));
        }

        return Some(recommended_prompt_action(
            "terminal-next-step",
            format!(
                "Review the latest terminal command `{}` and recommend the next concrete thing I should ask you to do.",
                command
            ),
            "Grounds the next action in the latest terminal activity.",
        ));
    }

    if mode != "chat" {
        return None;
    }

    if let Some(block) = last_finished_block {
        if matches!(block.exit_code, Some(code) if code != 0) {
            return Some(recommended_prompt_action(
                "explain-last-command-failure",
                format!(
                    "After `{}` failed, what should we investigate or fix next?",
                    block.command
                ),
                "Turn the latest failed command into an actionable explanation.",
            ));
        }

        if block.command.starts_with("git status") {
            return Some(recommended_prompt_action(
                "summarize-git-status",
                "Based on this git status, what should we handle next?".to_string(),
                "Use the latest git status block as context.",
            ));
        }

        if block.command.starts_with("git add") {
            return Some(recommended_prompt_action(
                "draft-commit-message",
                "After staging these changes, what should we do next before committing?"
                    .to_string(),
                "Useful after staging work but before committing it.",
            ));
        }

        if block.command.starts_with("git commit") {
            return Some(recommended_prompt_action(
                "prepare-push",
                "Now that this commit exists, what should we verify or do next?".to_string(),
                "Helpful right after a local commit.",
            ));
        }

        if block.command.starts_with("cargo test") || block.command.starts_with("npm test") {
            return Some(recommended_prompt_action(
                "review-latest-tests",
                "Given these test results, which failure should we tackle first?".to_string(),
                "Useful after a recent test run.",
            ));
        }

        return Some(recommended_prompt_action(
            "explain-last-command-output",
            format!(
                "Based on the latest terminal command `{}`, what should we ask or do next?",
                block.command
            ),
            "Uses the most recent terminal activity as context.",
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

        return None;
    }

    None
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

fn recommended_prompt_action(
    id: &str,
    value: String,
    description: &str,
) -> ComposerRecommendedActionResponse {
    let label = normalize_recommended_label("", &value);
    recommended_action(id, &label, value, description, "chat")
}

fn resolve_chat_endpoint(base_url: &str) -> String {
    if base_url.ends_with("/chat/completions") || base_url.ends_with("/responses") {
        return base_url.to_string();
    }

    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

fn extract_json_object(content: &str) -> Option<Value> {
    if let Ok(value) = serde_json::from_str::<Value>(content) {
        return Some(value);
    }

    let start = content.find('{')?;
    let end = content.rfind('}')?;
    if end < start {
        return None;
    }

    serde_json::from_str::<Value>(&content[start..=end]).ok()
}

fn parse_ai_recommended_action(payload: Value) -> Option<ComposerRecommendedActionResponse> {
    let raw_label = payload.get("label")?.as_str()?.trim().to_string();
    let value = payload.get("value")?.as_str()?.trim().to_string();
    let description = payload
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let mode = payload
        .get("mode")
        .and_then(Value::as_str)
        .unwrap_or("chat")
        .trim()
        .to_lowercase();
    let id = payload
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| slugify_identifier(&raw_label));

    let label = normalize_recommended_label(&raw_label, &value);

    if label.is_empty() || value.is_empty() || !matches!(mode.as_str(), "chat" | "shell") {
        return None;
    }

    Some(ComposerRecommendedActionResponse {
        id,
        label,
        value,
        description: if description.is_empty() {
            "Recommended from the latest terminal and conversation context.".to_string()
        } else {
            description
        },
        mode,
    })
}

fn normalize_recommended_label(label: &str, value: &str) -> String {
    let derived = compact_display_label(value, 10);
    if !derived.is_empty() {
        return derived;
    }

    let cleaned_label = compact_display_label(label, 10);
    if !cleaned_label.is_empty() && !is_generic_recommendation_label(&cleaned_label) {
        return cleaned_label;
    }

    "Review latest context".to_string()
}

fn is_generic_recommendation_label(label: &str) -> bool {
    matches!(
        label.to_lowercase().as_str(),
        "recommend next step"
            | "recommend the next step"
            | "next step"
            | "continue current task"
            | "continue this task"
            | "continue task"
    )
}

fn compact_display_label(value: &str, max_words: usize) -> String {
    let sanitized = value
        .replace('\n', " ")
        .replace('`', " ")
        .replace('"', " ")
        .replace('\'', " ")
        .replace(':', " ");
    let words = sanitized
        .split_whitespace()
        .map(|word| {
            word.trim_matches(|ch: char| {
                !ch.is_ascii_alphanumeric() && ch != '-' && ch != '/' && ch != '?'
            })
        })
        .filter(|word| !word.is_empty())
        .take(max_words)
        .map(|word| word.to_string())
        .collect::<Vec<_>>();

    if words.is_empty() {
        return String::new();
    }

    let mut words = words;
    if let Some(first) = words.first_mut() {
        let mut chars = first.chars();
        if let Some(initial) = chars.next() {
            *first = format!("{}{}", initial.to_uppercase(), chars.as_str());
        }
    }

    words.join(" ")
}

fn slugify_identifier(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_was_dash = false;
        } else if !last_was_dash {
            slug.push('-');
            last_was_dash = true;
        }
    }

    let normalized = slug.trim_matches('-').to_string();
    if normalized.is_empty() {
        "next-action".to_string()
    } else {
        normalized
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

fn recommended_action_anchor(request: &ComposerIntelligenceRequest) -> Option<String> {
    if !request.query.trim().is_empty() {
        return None;
    }

    let last_block = request
        .terminal_blocks
        .iter()
        .rev()
        .find(|block| block.status == "finished")
        .map(|block| {
            format!(
                "{}:{}:{}",
                block.command.trim(),
                block
                    .exit_code
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string()),
                summarize_output(block.output.as_deref().unwrap_or_default())
            )
        })
        .unwrap_or_default();
    let last_message = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
        .map(|message| message.body.trim().to_string())
        .unwrap_or_default();

    if last_block.is_empty() && last_message.is_empty() {
        return Some(format!(
            "{}::{}",
            request.surface,
            request.cwd.as_deref().unwrap_or_default()
        ));
    }

    Some(format!(
        "{}::{}::{}::{}",
        request.surface,
        request.cwd.as_deref().unwrap_or_default(),
        last_block,
        last_message
    ))
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

fn build_prediction_history(request: &ComposerIntelligenceRequest) -> Vec<ShellHistoryEntry> {
    let mut entries = request
        .terminal_blocks
        .iter()
        .rev()
        .filter(|block| block.status == "finished" && !block.command.trim().is_empty())
        .enumerate()
        .map(|(index, block)| ShellHistoryEntry {
            value: block.command.trim().to_string(),
            executed_at: format!("9999-12-31T23:59:{:02}Z", 59usize.saturating_sub(index)),
            source: "session".to_string(),
            pwd: request.cwd.clone(),
        })
        .collect::<Vec<_>>();

    entries.extend(request.history_entries.iter().cloned());
    entries
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
    let Some(last_command) = last_command
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
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
        let right_same_dir = same_dir_counts
            .get(right_value)
            .copied()
            .unwrap_or_default();
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
    let mut seen = HashSet::new();
    let mut same_dir_matches = Vec::new();
    let mut other_matches = Vec::new();

    // Warp scans reverse-chronological history and promotes matches from the
    // current working directory before falling back to matches from elsewhere.
    for entry in history_entries.iter() {
        let value = entry.value.trim();
        if value.is_empty() || !value.to_lowercase().starts_with(&normalized_input) {
            continue;
        }

        if !seen.insert(value.to_string()) {
            continue;
        }

        if cwd.is_some() && entry.pwd.as_deref() == cwd {
            same_dir_matches.push(value.to_string());
        } else {
            other_matches.push(value.to_string());
        }
    }

    same_dir_matches.extend(other_matches);
    same_dir_matches
}

fn rank_shell_candidates(
    candidates: &mut [(String, &'static str)],
    request: &ComposerIntelligenceRequest,
    history_entries: &[ShellHistoryEntry],
    input: &str,
    last_command: Option<&str>,
) {
    candidates.sort_by(|(left_value, left_kind), (right_value, right_kind)| {
        let left_score = shell_candidate_score(
            left_value,
            left_kind,
            request,
            history_entries,
            input,
            last_command,
        );
        let right_score = shell_candidate_score(
            right_value,
            right_kind,
            request,
            history_entries,
            input,
            last_command,
        );

        right_score
            .cmp(&left_score)
            .then_with(|| right_value.len().cmp(&left_value.len()))
    });
}

fn shell_candidate_score(
    candidate: &str,
    kind: &str,
    request: &ComposerIntelligenceRequest,
    history_entries: &[ShellHistoryEntry],
    input: &str,
    last_command: Option<&str>,
) -> i64 {
    let token_count = candidate.split_whitespace().count() as i64;
    let input_is_command_token = !input.is_empty() && !input.contains(char::is_whitespace);
    let mut score = match kind {
        "history" => 5_000,
        "completion" => 4_500,
        "ai" => 3_800,
        "heuristic" => 2_500,
        _ => 1_000,
    };

    score += history_candidate_score(candidate, history_entries, request.cwd.as_deref());
    score += git_workflow_candidate_score(candidate, request.git_branch.as_deref(), last_command);

    if input_is_command_token {
        score += token_count.saturating_sub(1) * 850;
        score += candidate.len().min(140) as i64 * 7;
    } else {
        score += token_count.saturating_sub(1) * 180;
    }

    if candidate_completes_path_argument(input, candidate) {
        score += 4_000;
    }

    if input_is_command_token && input.len() <= 3 && is_low_information_shell_command(candidate) {
        score -= 12_000;
    } else if is_low_information_shell_command(candidate) {
        score -= 2_000;
    }

    score
}

fn history_candidate_score(
    candidate: &str,
    history_entries: &[ShellHistoryEntry],
    cwd: Option<&str>,
) -> i64 {
    let mut score = 0i64;
    let mut total_count = 0i64;
    let mut same_dir_count = 0i64;
    let mut latest_executed_at = "";
    let mut from_current_session = false;

    for entry in history_entries
        .iter()
        .filter(|entry| entry.value.trim() == candidate)
    {
        total_count += 1;
        same_dir_count += i64::from(cwd.is_some() && entry.pwd.as_deref() == cwd);
        from_current_session = from_current_session || entry.source == "session";
        if entry.executed_at.as_str() > latest_executed_at {
            latest_executed_at = entry.executed_at.as_str();
        }
    }

    score += same_dir_count * 3_000;
    score += total_count.min(8) * 350;
    if from_current_session {
        score += 3_500;
    }
    if latest_executed_at.starts_with("9999-") {
        score += 2_500;
    } else if !latest_executed_at.is_empty() {
        score += 500;
    }

    score
}

fn git_workflow_candidate_score(
    candidate: &str,
    git_branch: Option<&str>,
    last_command: Option<&str>,
) -> i64 {
    let branch = git_branch.map(str::trim).filter(|value| {
        !value.is_empty() && *value != "HEAD" && *value != "(no branch)" && *value != "detached"
    });
    let last = last_command.unwrap_or_default().trim();

    if let Some(branch) = branch {
        let push_target = format!("git push -u origin {branch}");
        if candidate == push_target {
            let mut score = 8_000;
            if branch.starts_with("codex/") {
                score += 6_000;
            }
            if last.starts_with("git commit") {
                score += 6_000;
            }
            return score;
        }
    }

    if candidate == "git commit -m \"describe changes\""
        && (last.starts_with("git add") || last.starts_with("git restore --staged"))
    {
        return 10_000;
    }

    if candidate == "git add ." && last.starts_with("git status") {
        return 7_000;
    }

    0
}

fn candidate_completes_path_argument(input: &str, candidate: &str) -> bool {
    if input.trim_end() == candidate.trim_end() {
        return false;
    }

    let candidate_tokens = candidate.split_whitespace().collect::<Vec<_>>();
    if candidate_tokens.len() < 2 {
        return false;
    }

    let input_tokens = input.split_whitespace().collect::<Vec<_>>();
    let current_token_index = if input.chars().last().is_some_and(char::is_whitespace) {
        input_tokens.len()
    } else {
        input_tokens.len().saturating_sub(1)
    };

    command_argument_expects_path(&candidate_tokens, current_token_index)
}

fn is_low_information_shell_command(value: &str) -> bool {
    matches!(
        value,
        "git status" | "git pull" | "git branch" | "ls" | "ls -la" | "pwd"
    )
}

fn collect_completion_candidates(
    input: &str,
    request: &ComposerIntelligenceRequest,
) -> Vec<String> {
    let mut candidates = Vec::new();

    if let Some(candidate) = predict_git_branch_completion(input, request.git_branch.as_deref()) {
        candidates.push(candidate);
    }

    if let Some(candidate) = predict_path_completion(input, request.cwd.as_deref()) {
        candidates.push(candidate);
    }

    if let Some(candidate) = predict_argument_path_completion(input, request.cwd.as_deref()) {
        candidates.push(candidate);
    }

    candidates
}

fn collect_git_command_candidates(
    input: &str,
    request: &ComposerIntelligenceRequest,
    last_command: Option<&str>,
) -> Vec<String> {
    if !input.starts_with("git") {
        return Vec::new();
    }

    let mut candidates = Vec::new();
    let branch = request
        .git_branch
        .as_deref()
        .map(str::trim)
        .filter(|value| {
            !value.is_empty() && *value != "HEAD" && *value != "(no branch)" && *value != "detached"
        });
    let push_target = branch.map(|branch| format!("git push -u origin {branch}"));
    let last = last_command.unwrap_or_default().trim();

    if let Some(target) = push_target.as_ref() {
        if last.starts_with("git commit") || branch.is_some_and(|value| value.starts_with("codex/"))
        {
            candidates.push(target.clone());
        }
    }

    if last.starts_with("git add") || last.starts_with("git restore --staged") {
        candidates.push("git commit -m \"describe changes\"".to_string());
    }

    if last.starts_with("git status") {
        candidates.push("git add .".to_string());
    }

    candidates.push("git status".to_string());
    if let Some(target) = push_target {
        candidates.push(target);
    }
    candidates.push("git log --oneline --decorate -n 10".to_string());

    let normalized_input = input.to_lowercase();
    candidates
        .into_iter()
        .filter(|candidate| candidate.to_lowercase().starts_with(&normalized_input))
        .collect()
}

fn is_command_candidate_valid(candidate: &str, request: &ComposerIntelligenceRequest) -> bool {
    let tokens = candidate.split_whitespace().collect::<Vec<_>>();
    let Some(first_token) = tokens.first().copied() else {
        return false;
    };

    if !is_executable_token_valid(
        first_token,
        &request.available_commands,
        request.cwd.as_deref(),
    ) {
        return false;
    }

    tokens.iter().enumerate().skip(1).all(|(index, token)| {
        is_argument_token_valid(token, request.cwd.as_deref(), &tokens, index)
    })
}

fn is_executable_token_valid(
    token: &str,
    available_commands: &[String],
    cwd: Option<&str>,
) -> bool {
    let normalized = strip_wrapping_quotes(token);
    if normalized.is_empty() {
        return false;
    }

    if is_shell_builtin(normalized) {
        return true;
    }

    if looks_like_path(normalized) {
        return resolve_candidate_path(normalized, cwd).exists();
    }

    available_commands
        .iter()
        .any(|command| command.eq_ignore_ascii_case(normalized))
}

fn is_argument_token_valid(token: &str, cwd: Option<&str>, tokens: &[&str], index: usize) -> bool {
    let normalized = strip_wrapping_quotes(token);
    if normalized.is_empty()
        || normalized.starts_with('-')
        || normalized.starts_with('$')
        || normalized.contains('*')
        || normalized.contains('?')
        || normalized.contains('{')
        || normalized.contains('}')
        || normalized.contains(':')
    {
        return true;
    }

    let explicit_path = looks_like_explicit_path(normalized);
    let command_path_arg = command_argument_expects_path(tokens, index);
    if !explicit_path && !command_path_arg {
        return true;
    }

    let resolved = resolve_candidate_path(normalized, cwd);
    resolved.exists() || resolved.parent().is_some_and(Path::exists)
}

fn strip_wrapping_quotes(token: &str) -> &str {
    token.trim().trim_matches('"').trim_matches('\'')
}

fn looks_like_path(token: &str) -> bool {
    token.starts_with("~/")
        || token.starts_with("./")
        || token.starts_with("../")
        || token.starts_with('/')
        || token.contains('/')
}

fn looks_like_explicit_path(token: &str) -> bool {
    token.starts_with("~/")
        || token.starts_with("./")
        || token.starts_with("../")
        || token.starts_with('/')
}

fn resolve_candidate_path(token: &str, cwd: Option<&str>) -> PathBuf {
    if token.starts_with("~/") {
        if let Some(home) = home_dir() {
            return home.join(token.trim_start_matches("~/"));
        }
    }

    let raw = Path::new(token);
    if raw.is_absolute() {
        return raw.to_path_buf();
    }

    let base = cwd.map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    base.join(raw)
}

fn is_shell_builtin(token: &str) -> bool {
    matches!(
        token,
        "cd" | "pwd"
            | "echo"
            | "export"
            | "unset"
            | "source"
            | "."
            | "alias"
            | "unalias"
            | "history"
            | "jobs"
            | "fg"
            | "bg"
            | "kill"
            | "true"
            | "false"
            | "test"
            | "["
            | "time"
    )
}

fn command_argument_expects_path(tokens: &[&str], index: usize) -> bool {
    let Some(command) = tokens.first().map(|value| value.to_ascii_lowercase()) else {
        return false;
    };

    if command == "git" {
        let subcommand = tokens.get(1).copied().unwrap_or_default();
        if matches!(subcommand, "add" | "rm" | "mv" | "restore" | "diff") {
            return index >= 2;
        }

        if matches!(subcommand, "checkout" | "switch") {
            return tokens.iter().take(index).any(|token| *token == "--");
        }

        return false;
    }

    if command == "rg" || command == "grep" {
        return index >= 2;
    }

    matches!(
        command.as_str(),
        "cat"
            | "less"
            | "more"
            | "head"
            | "tail"
            | "vim"
            | "vi"
            | "nano"
            | "code"
            | "open"
            | "ls"
            | "du"
            | "find"
            | "rm"
            | "cp"
            | "mv"
            | "chmod"
            | "chown"
            | "python"
            | "python3"
            | "node"
            | "deno"
    )
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
    if previous_mode == Some("chat")
        && sticky_ai_words.contains(&first_token.as_str())
        && tokens.len() <= 2
    {
        return false;
    }

    if messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
        .is_some()
        && matches!(
            query.trim().to_lowercase().as_str(),
            "yes"
                | "no"
                | "ok"
                | "okay"
                | "thanks"
                | "please"
                | "do it"
                | "try again"
                | "go ahead"
                | "sounds good"
                | "continue"
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
        "care", "cum", "ce", "cine", "unde", "cand", "când", "cât", "de", "din", "nu", "sa", "să",
        "sunt", "este", "vreau", "putem", "poti", "poți", "spune", "explica", "explică", "please",
        "how", "what", "why", "who", "where", "when", "can", "could", "should", "would", "tell",
        "explain",
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
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
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

fn predict_git_branch_completion(input: &str, git_branch: Option<&str>) -> Option<String> {
    let branch = git_branch.map(str::trim).filter(|value| {
        !value.is_empty() && *value != "HEAD" && *value != "(no branch)" && *value != "detached"
    })?;
    let target = format!("git push -u origin {branch}");
    let normalized_input = input.trim_end();

    if target.starts_with(input) && input.len() >= "git p".len() {
        return Some(target);
    }

    if normalized_input == "git push"
        || normalized_input == "git push -u"
        || normalized_input == "git push -u origin"
    {
        return Some(target);
    }

    None
}

fn predict_argument_path_completion(input: &str, cwd: Option<&str>) -> Option<String> {
    let cwd = cwd?;
    let token_start = input
        .rfind(char::is_whitespace)
        .map(|index| index + 1)
        .unwrap_or(0);
    let token = input.get(token_start..)?;
    let tokens = input.split_whitespace().collect::<Vec<_>>();
    if tokens.is_empty() {
        return None;
    }

    let current_token_index = if input.chars().last().is_some_and(char::is_whitespace) {
        tokens.len()
    } else {
        tokens.len().saturating_sub(1)
    };

    if !command_argument_expects_path(&tokens, current_token_index) {
        return None;
    }

    let directories_only = tokens
        .first()
        .is_some_and(|command| matches!(*command, "cd"));
    let (directory_path, partial_name, replacement_prefix) =
        if token.contains('/') || token.starts_with("~/") || token.starts_with('.') {
            build_path_completion_request(token, cwd)?
        } else {
            (cwd.to_string(), token.to_string(), String::new())
        };

    let listing = terminal_list_directory_entries(ListDirectoryEntriesRequest {
        path: Some(directory_path),
        query: Some(partial_name.clone()),
        directories_only: Some(directories_only),
    })
    .ok()?;
    let normalized_partial = partial_name.to_lowercase();
    let next_entry = listing
        .entries
        .into_iter()
        .filter(|entry| {
            normalized_partial.is_empty()
                || entry.name.to_lowercase().starts_with(&normalized_partial)
        })
        .next()?;
    let replacement = format!(
        "{}{}{}",
        replacement_prefix,
        shell_escape_path_segment(&next_entry.name),
        if next_entry.is_directory { "/" } else { "" }
    );
    let full_command = format!("{}{}", &input[..token_start], replacement);

    if full_command == input {
        None
    } else {
        Some(full_command)
    }
}

fn predict_path_completion(input: &str, cwd: Option<&str>) -> Option<String> {
    let cwd = cwd?;
    let token_start = input
        .rfind(char::is_whitespace)
        .map(|index| index + 1)
        .unwrap_or(0);
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
        shell_escape_path_segment(&next_entry.name),
        if next_entry.is_directory { "/" } else { "" }
    );
    let full_command = format!("{}{}", &input[..token_start], replacement);
    if full_command == input {
        None
    } else {
        Some(full_command)
    }
}

fn shell_escape_path_segment(segment: &str) -> String {
    if segment.chars().any(|ch| {
        ch.is_whitespace()
            || matches!(
                ch,
                '\'' | '"' | '\\' | '$' | '&' | '(' | ')' | '[' | ']' | '{' | '}' | ';'
            )
    }) {
        return format!("'{}'", segment.replace('\'', "'\\''"));
    }

    segment.to_string()
}

fn build_path_completion_request(token: &str, cwd: &str) -> Option<(String, String, String)> {
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

    Some((directory_path, partial_name.to_string(), replacement_prefix))
}
