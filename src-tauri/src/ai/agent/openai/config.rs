use crate::ai::agent::openai::utils;
use serde_json::{json, Value};
use uuid::Uuid;

pub const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
pub const DEFAULT_MODEL_ID: &str = "gpt-4o-mini";
pub const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1";

#[derive(Debug, Clone)]
pub struct OpenAiCompatibleConfig {
    pub api_key: String,
    pub base_url: String,
    pub model_id: String,
    pub source: String,
    pub secret_id: String,
}

impl OpenAiCompatibleConfig {
    pub fn from_env() -> Option<Self> {
        let api_key = std::env::var("OCTOMUS_AI_API_KEY")
            .or_else(|_| std::env::var("OPENAI_API_KEY"))
            .ok()?;
        let base_url = std::env::var("OCTOMUS_AI_BASE_URL")
            .or_else(|_| std::env::var("OPENAI_BASE_URL"))
            .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        let model_id = std::env::var("OCTOMUS_AI_MODEL")
            .or_else(|_| std::env::var("OPENAI_MODEL"))
            .unwrap_or_else(|_| DEFAULT_MODEL_ID.to_string());

        Some(Self::new(
            api_key,
            Some(base_url),
            Some(model_id),
            "environment".to_string(),
        ))
    }

    pub fn new(
        api_key: String,
        base_url: Option<String>,
        model_id: Option<String>,
        source: String,
    ) -> Self {
        Self {
            api_key,
            base_url: utils::normalize_base_url(base_url.as_deref().unwrap_or(DEFAULT_BASE_URL)),
            model_id: model_id
                .filter(|model| !model.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_MODEL_ID.to_string()),
            source,
            secret_id: format!("provider-{}", Uuid::new_v4()),
        }
    }

    pub fn with_secret_id(mut self, secret_id: Option<String>) -> Self {
        if let Some(secret_id) = secret_id.filter(|value| !value.trim().is_empty()) {
            self.secret_id = secret_id;
        }

        self
    }

    pub fn redacted_status(&self) -> (String, String, String, bool, String) {
        (
            "openai-compatible".to_string(),
            self.base_url.clone(),
            self.model_id.clone(),
            !self.api_key.trim().is_empty(),
            self.source.clone(),
        )
    }

    pub fn to_persisted_value(&self) -> Value {
        json!({
            "base_url": self.base_url,
            "model_id": self.model_id,
            "source": self.source,
            "secret_id": self.secret_id,
        })
    }

    pub fn from_persisted_value(value: &Value) -> Option<Self> {
        let api_key = value
            .get("api_key")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let base_url = value
            .get("base_url")
            .and_then(Value::as_str)
            .map(|value| value.to_string());
        let model_id = value
            .get("model_id")
            .and_then(Value::as_str)
            .map(|value| value.to_string());
        let source = value
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or("persisted")
            .to_string();
        let secret_id = value
            .get("secret_id")
            .and_then(Value::as_str)
            .map(|value| value.to_string())
            .unwrap_or_else(|| format!("provider-{}", Uuid::new_v4()));

        Some(Self::new(api_key, base_url, model_id, source).with_secret_id(Some(secret_id)))
    }
}
