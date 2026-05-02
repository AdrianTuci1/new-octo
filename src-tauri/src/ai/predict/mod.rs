pub mod model;
pub mod ai_client;
pub mod scoring;
pub mod context;

pub use model::CommandPrediction;

pub async fn predict_command_with_ai(
    input: &str,
    last_command: Option<&str>,
    context_messages: Vec<model::ContextMessageInput>,
    api_key: &str,
    base_url: &str,
    model_id: &str,
) -> Option<CommandPrediction> {
    ai_client::predict_with_llm(input, last_command, context_messages, api_key, base_url, model_id).await
}

pub fn recommended_tip(last_exit_code: Option<i32>) -> Option<&'static str> {
    match last_exit_code {
        Some(code) if code != 0 => {
            Some("Explain the latest terminal error and suggest the safest next step.")
        }
        _ => None,
    }
}
