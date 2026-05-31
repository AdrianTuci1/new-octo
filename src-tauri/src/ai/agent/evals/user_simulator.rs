use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use crate::ai::agent::providers::OpenAiCompatibleConfig;
use crate::ai::agent::types::AgentInputMessage;
use crate::ai::provider_adapter::{generate_completion, ProviderCompletionRequest};

use super::scenarios::EvalScenario;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SimulatedUserDecision {
    pub goal_achieved: bool,
    pub next_user_message: Option<String>,
    pub summary: String,
}

pub(super) async fn next_user_turn(
    config: &OpenAiCompatibleConfig,
    scenario: &EvalScenario,
    transcript_messages: &[AgentInputMessage],
    last_assistant_answer: &str,
) -> Result<SimulatedUserDecision, String> {
    let user_model = std::env::var("OCTOMUS_EVAL_USER_MODEL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| config.model_id.clone());
    let client = Client::builder()
        .build()
        .map_err(|error| format!("failed to create simulated-user client: {error}"))?;

    let system = "You are simulating a concise but realistic software user in an agent eval. Your only job is to keep the conversation moving toward the scenario goal. Return only compact JSON with keys `goalAchieved` (boolean), `nextUserMessage` (string or null), and `summary` (string). If the assistant has already satisfied the goal, set goalAchieved=true and nextUserMessage=null. If not, produce one short user follow-up that helps reach the goal without solving the task for the assistant.";
    let user = json!({
        "scenario": {
            "id": scenario.id,
            "description": scenario.description,
            "initialPrompt": scenario.prompt,
            "goal": scenario.goal,
            "userSimulatorRubric": scenario.user_simulator_rubric,
        },
        "lastAssistantAnswer": last_assistant_answer,
        "transcript": transcript_messages
            .iter()
            .map(|message| json!({
                "role": message.role,
                "content": message.content,
                "toolCallId": message.tool_call_id,
                "toolCalls": message.tool_calls,
            }))
            .collect::<Vec<_>>(),
    })
    .to_string();

    let mut user_config = config.clone();
    user_config.model_id = user_model.clone();

    let response = generate_completion(
        &client,
        &user_config,
        ProviderCompletionRequest {
            model: user_model,
            messages: vec![
                json!({ "role": "system", "content": system }),
                json!({ "role": "user", "content": user }),
            ],
            tools: None,
            temperature: Some(0.2),
            max_tokens: Some(220),
            response_mime_type: None,
        },
    )
    .await
    .map_err(|error| format!("simulated user request failed: {error}"))?;

    parse_decision(&response.text)
}

fn parse_decision(text: &str) -> Result<SimulatedUserDecision, String> {
    let trimmed = text.trim();
    let trimmed = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .trim();
    let trimmed = trimmed.strip_suffix("```").unwrap_or(trimmed).trim();
    let decision = serde_json::from_str::<SimulatedUserDecision>(trimmed)
        .map_err(|error| format!("failed to parse simulated-user JSON: {error}; body={trimmed}"))?;

    if !decision.goal_achieved
        && decision
            .next_user_message
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
    {
        return Err(
            "simulated user did not mark the goal as achieved and also did not provide a next user message"
                .to_string(),
        );
    }

    Ok(decision)
}

#[cfg(test)]
mod tests {
    use super::parse_decision;

    #[test]
    fn parses_goal_achieved_json() {
        let parsed = parse_decision(
            r#"{"goalAchieved":true,"nextUserMessage":null,"summary":"Goal reached."}"#,
        )
        .expect("decision should parse");

        assert!(parsed.goal_achieved);
        assert!(parsed.next_user_message.is_none());
    }
}
