use super::context::gather_local_context;
use super::model::{CommandPrediction, ContextMessageInput, PredictionKind};
use crate::ai::agent::{OpenAiCompatibleConfig, OpenAiCompatibleProvider};
use crate::ai::provider_adapter::{generate_completion, ProviderCompletionRequest};
use serde_json::json;

pub async fn predict_with_llm(
    input: &str,
    last_command: Option<&str>,
    context_messages: Vec<ContextMessageInput>,
    history_context: String,
    rejected_suggestions: Vec<String>,
    api_key: &str,
    base_url: &str,
    model_id: &str,
) -> Option<CommandPrediction> {
    let trimmed = input.trim();
    println!("[AI] Requesting smart prediction for: {}", trimmed);

    // Gather local file and git context
    let local_context = if let Some(first_msg) = context_messages.first() {
        if let Some(pwd) = &first_msg.context.pwd {
            gather_local_context(pwd)
        } else {
            gather_local_context(".")
        }
    } else {
        gather_local_context(".")
    };

    let client = reqwest::Client::new();
    let config = OpenAiCompatibleConfig::new(
        OpenAiCompatibleProvider::infer_from_base_url(base_url),
        api_key.to_string(),
        Some(base_url.to_string()),
        Some(model_id.to_string()),
        "prediction".to_string(),
    );

    // Format context for the prompt
    let context_history = context_messages
        .iter()
        .rev()
        .take(3)
        .map(|m| {
            format!(
                "Input: {}\nOutput: {}\nExit Code: {}\nGit Branch: {}\nPWD: {}\n---",
                m.input,
                m.output.chars().take(200).collect::<String>(),
                m.context.exit_code,
                m.context.git_branch.as_deref().unwrap_or("none"),
                m.context.pwd.as_deref().unwrap_or("none")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let response = generate_completion(
        &client,
        &config,
        ProviderCompletionRequest {
            model: model_id.to_string(),
            messages: vec![
                json!({
                    "role": "system",
                    "content": "You are a professional shell completion engine. You will receive recent terminal history, similar historical command sequences, current directory file listing, and user input. Output ONLY the most likely full shell command starting with the user's input. Aim for complete, high-quality commands. No explanations, no markdown."
                }),
                json!({
                    "role": "user",
                    "content": format!(
                        "FILES IN DIRECTORY: {:?}\nGIT BRANCH: {:?}\n\nRECENT HISTORY:\n{}\n\nSIMILAR HISTORY CONTEXT:\n{}\n\nREJECTED SUGGESTIONS:\n{:?}\n\nCURRENT INPUT: {}\nLAST COMMAND: {}",
                        local_context.files,
                        local_context.git_branch,
                        context_history,
                        history_context,
                        rejected_suggestions,
                        trimmed,
                        last_command.unwrap_or("none")
                    )
                }),
            ],
            tools: None,
            temperature: Some(0.1),
            max_tokens: Some(50),
            response_mime_type: None,
        },
    )
    .await
    .ok()?;
    let suggestion = response.text.trim().to_string();

    if suggestion
        .to_lowercase()
        .starts_with(&trimmed.to_lowercase())
        && suggestion.len() > trimmed.len()
    {
        // Disk Validation for AI suggestions (AI might hallucinate paths)
        let parts: Vec<&str> = suggestion.split_whitespace().collect();
        if let Some(first_part) = parts.first() {
            if (first_part.starts_with('/')
                || first_part.starts_with("./")
                || first_part.starts_with("../"))
                && !std::path::Path::new(first_part).exists()
            {
                return None;
            }
        }

        Some(CommandPrediction {
            input: trimmed.to_string(),
            suggestion,
            confidence: 0.5,
            kind: PredictionKind::AgentTip,
        })
    } else {
        None
    }
}
