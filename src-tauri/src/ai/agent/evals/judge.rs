use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use crate::ai::agent::providers::OpenAiCompatibleConfig;
use crate::ai::provider_adapter::{generate_completion, ProviderCompletionRequest};

use super::runner::EvalRunResult;
use super::scenarios::EvalScenario;

#[derive(Debug, Clone, Deserialize)]
pub(super) struct JudgeVerdict {
    pub pass: bool,
    pub summary: String,
}

pub(super) async fn maybe_judge_run(
    config: &OpenAiCompatibleConfig,
    scenario: &EvalScenario,
    result: &EvalRunResult,
) -> Result<Option<JudgeVerdict>, String> {
    if !env_truthy("OCTOMUS_EVAL_USE_JUDGE") {
        return Ok(None);
    }

    let judge_model = std::env::var("OCTOMUS_EVAL_JUDGE_MODEL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| config.model_id.clone());
    let client = Client::builder()
        .build()
        .map_err(|error| format!("failed to create eval judge client: {error}"))?;

    let system = "You are a strict agent eval judge. Return only compact JSON with keys `pass` (boolean) and `summary` (string). Mark pass=true only if the transcript clearly reaches the scenario goal and uses the agent tools appropriately.";
    let user = json!({
        "scenario": {
            "id": scenario.id,
            "description": scenario.description,
            "prompt": scenario.prompt,
            "goal": scenario.goal,
            "requiredTools": scenario.required_tools,
            "forbiddenTools": scenario.forbidden_tools,
            "expectedFinalAnswerContains": scenario.final_answer_must_contain,
            "judgeRubric": scenario.judge_rubric,
        },
        "result": {
            "finalAnswer": result.final_answer,
            "toolCalls": result
                .tool_calls
                .iter()
                .map(|tool_call| json!({
                    "name": tool_call.name,
                    "args": tool_call.args,
                }))
                .collect::<Vec<_>>(),
            "toolResults": result.tool_results,
            "changedFiles": result.changed_files,
            "statusMessages": result.status_messages,
            "simulatedUserSummaries": result.simulated_user_summaries,
            "transcript": result
                .transcript_messages
                .iter()
                .map(|message| json!({
                    "role": message.role,
                    "content": message.content,
                    "toolCallId": message.tool_call_id,
                    "toolCalls": message.tool_calls,
                }))
                .collect::<Vec<_>>(),
        }
    })
    .to_string();

    let mut judge_config = config.clone();
    judge_config.model_id = judge_model.clone();

    let response = generate_completion(
        &client,
        &judge_config,
        ProviderCompletionRequest {
            model: judge_model,
            messages: vec![
                json!({ "role": "system", "content": system }),
                json!({ "role": "user", "content": user }),
            ],
            tools: None,
            temperature: Some(0.0),
            max_tokens: Some(400),
            response_mime_type: None,
        },
    )
    .await
    .map_err(|error| format!("eval judge request failed: {error}"))?;

    let parsed = parse_verdict(&response.text)?;
    Ok(Some(parsed))
}

fn parse_verdict(text: &str) -> Result<JudgeVerdict, String> {
    let trimmed = text.trim();
    let trimmed = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .trim();
    let trimmed = trimmed.strip_suffix("```").unwrap_or(trimmed).trim();
    serde_json::from_str::<JudgeVerdict>(trimmed)
        .map_err(|error| format!("failed to parse eval judge JSON: {error}; body={trimmed}"))
}

fn env_truthy(key: &str) -> bool {
    std::env::var(key)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}
