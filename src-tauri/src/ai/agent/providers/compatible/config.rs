use super::utils;
use serde_json::{json, Value};
use uuid::Uuid;

pub const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
pub const DEFAULT_MODEL_ID: &str = "gpt-4o-mini";
pub const GOOGLE_OPENAI_URL: &str = "https://generativelanguage.googleapis.com/v1beta/openai";
pub const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenAiCompatibleProvider {
    OpenAi,
    Google,
    OpenRouter,
    Custom,
}

impl OpenAiCompatibleProvider {
    pub fn parse(value: Option<&str>) -> Self {
        match value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase())
            .as_deref()
        {
            Some("openai") => Self::OpenAi,
            Some("google") | Some("gemini") => Self::Google,
            Some("openrouter") => Self::OpenRouter,
            Some("custom") => Self::Custom,
            _ => Self::Custom,
        }
    }

    pub fn infer_from_base_url(base_url: &str) -> Self {
        let normalized = base_url.trim().to_ascii_lowercase();
        if normalized.contains("generativelanguage.googleapis.com") {
            return Self::Google;
        }
        if normalized.contains("openrouter.ai") {
            return Self::OpenRouter;
        }
        if normalized.contains("api.openai.com") {
            return Self::OpenAi;
        }
        Self::Custom
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::Google => "google",
            Self::OpenRouter => "openrouter",
            Self::Custom => "custom",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::Google => "Google Gemini",
            Self::OpenRouter => "OpenRouter",
            Self::Custom => "Custom (OpenAI Compatible)",
        }
    }

    pub fn default_base_url(self) -> &'static str {
        match self {
            Self::OpenAi => DEFAULT_BASE_URL,
            Self::Google => GOOGLE_OPENAI_URL,
            Self::OpenRouter => OPENROUTER_URL,
            Self::Custom => DEFAULT_BASE_URL,
        }
    }

    pub fn locks_base_url(self) -> bool {
        matches!(self, Self::OpenAi | Self::Google)
    }

    pub fn normalize_base_url(self, base_url: Option<&str>) -> String {
        if self.locks_base_url() {
            return utils::normalize_base_url(self.default_base_url());
        }

        let candidate = base_url
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| self.default_base_url());
        utils::normalize_base_url(candidate)
    }
}

#[derive(Debug, Clone)]
pub struct OpenAiCompatibleConfig {
    pub provider: OpenAiCompatibleProvider,
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
        let provider = std::env::var("OCTOMUS_AI_PROVIDER")
            .ok()
            .map(|value| OpenAiCompatibleProvider::parse(Some(&value)));
        let base_url = std::env::var("OCTOMUS_AI_BASE_URL")
            .or_else(|_| std::env::var("OPENAI_BASE_URL"))
            .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        let model_id = std::env::var("OCTOMUS_AI_MODEL")
            .or_else(|_| std::env::var("OPENAI_MODEL"))
            .unwrap_or_else(|_| DEFAULT_MODEL_ID.to_string());
        let provider =
            provider.unwrap_or_else(|| OpenAiCompatibleProvider::infer_from_base_url(&base_url));

        Some(Self::new(
            provider,
            api_key,
            Some(base_url),
            Some(model_id),
            "environment".to_string(),
        ))
    }

    pub fn new(
        provider: OpenAiCompatibleProvider,
        api_key: String,
        base_url: Option<String>,
        model_id: Option<String>,
        source: String,
    ) -> Self {
        Self {
            provider,
            api_key,
            base_url: provider.normalize_base_url(base_url.as_deref()),
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

    pub fn redacted_status(&self) -> (String, String, String, String, bool, String) {
        (
            self.provider.label().to_string(),
            self.provider.id().to_string(),
            self.base_url.clone(),
            self.model_id.clone(),
            !self.api_key.trim().is_empty(),
            self.source.clone(),
        )
    }

    pub fn to_persisted_value(&self) -> Value {
        json!({
            "provider_id": self.provider.id(),
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
        let provider = value
            .get("provider_id")
            .and_then(Value::as_str)
            .map(|value| OpenAiCompatibleProvider::parse(Some(value)));
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
        let provider = provider.unwrap_or_else(|| {
            base_url
                .as_deref()
                .map(OpenAiCompatibleProvider::infer_from_base_url)
                .unwrap_or(OpenAiCompatibleProvider::OpenAi)
        });

        Some(
            Self::new(provider, api_key, base_url, model_id, source)
                .with_secret_id(Some(secret_id)),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::{
        OpenAiCompatibleConfig, OpenAiCompatibleProvider, GOOGLE_OPENAI_URL, OPENROUTER_URL,
    };

    #[test]
    fn locked_providers_ignore_custom_base_url() {
        let openai = OpenAiCompatibleConfig::new(
            OpenAiCompatibleProvider::OpenAi,
            "secret".to_string(),
            Some("https://example.com/v1".to_string()),
            Some("gpt-4o-mini".to_string()),
            "test".to_string(),
        );
        let google = OpenAiCompatibleConfig::new(
            OpenAiCompatibleProvider::Google,
            "secret".to_string(),
            Some("https://example.com/v1".to_string()),
            Some("gemini-2.5-flash".to_string()),
            "test".to_string(),
        );

        assert_eq!(openai.base_url, "https://api.openai.com/v1");
        assert_eq!(google.base_url, GOOGLE_OPENAI_URL);
    }

    #[test]
    fn persisted_values_restore_provider_kind() {
        let config = OpenAiCompatibleConfig::new(
            OpenAiCompatibleProvider::OpenRouter,
            "secret".to_string(),
            Some(OPENROUTER_URL.to_string()),
            Some("openai/gpt-4o-mini".to_string()),
            "test".to_string(),
        );
        let restored = OpenAiCompatibleConfig::from_persisted_value(&config.to_persisted_value())
            .expect("persisted config should deserialize");

        assert_eq!(restored.provider, OpenAiCompatibleProvider::OpenRouter);
        assert_eq!(restored.base_url, OPENROUTER_URL);
    }
}
