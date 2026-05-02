use super::model::{CommandPrediction, PredictionKind, ContextMessageInput};
use super::context::gather_local_context;

pub async fn predict_with_llm(
    input: &str,
    last_command: Option<&str>,
    context_messages: Vec<ContextMessageInput>,
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
    let url = if base_url.ends_with("/chat/completions") {
        base_url.to_string()
    } else {
        format!("{}/chat/completions", base_url.trim_end_matches('/'))
    };

    // Format context for the prompt
    let context_history = context_messages.iter().rev().take(3).map(|m| {
        format!(
            "Input: {}\nOutput: {}\nExit Code: {}\nGit Branch: {}\nPWD: {}\n---",
            m.input,
            m.output.chars().take(200).collect::<String>(),
            m.context.exit_code,
            m.context.git_branch.as_deref().unwrap_or("none"),
            m.context.pwd.as_deref().unwrap_or("none")
        )
    }).collect::<Vec<_>>().join("\n");

    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "model": model_id,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a professional shell completion engine. You will receive recent terminal history, current directory file listing, and user input. Output ONLY the most likely full shell command starting with the user's input. Aim for complete, high-quality commands. No explanations, no markdown."
                },
                {
                    "role": "user",
                    "content": format!(
                        "FILES IN DIRECTORY: {:?}\nGIT BRANCH: {:?}\n\nRECENT HISTORY:\n{}\n\nCURRENT INPUT: {}\nLAST COMMAND: {}", 
                        local_context.files,
                        local_context.git_branch,
                        context_history,
                        trimmed, 
                        last_command.unwrap_or("none")
                    )
                }
            ],
            "max_tokens": 50,
            "temperature": 0.1
        }))
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let value: serde_json::Value = response.json().await.ok()?;
    let suggestion = value["choices"][0]["message"]["content"]
        .as_str()?
        .trim()
        .to_string();

    if suggestion.to_lowercase().starts_with(&trimmed.to_lowercase()) && suggestion.len() > trimmed.len() {
        // Disk Validation for AI suggestions (AI might hallucinate paths)
        let parts: Vec<&str> = suggestion.split_whitespace().collect();
        if let Some(first_part) = parts.first() {
            if (first_part.starts_with('/') || first_part.starts_with("./") || first_part.starts_with("../")) 
               && !std::path::Path::new(first_part).exists() {
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
