use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelSpec {
    pub id: String,
    pub model_id: Option<String>,
    pub label: String,
    pub provider: String,
    pub provider_id: Option<String>,
    pub note: Option<String>,
    pub base_url: Option<String>,
    pub supports_attachments: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentSourceModel {
    pub id: String,
    pub source_kind: String,
    pub label: String,
    pub provider: String,
    pub provider_id: Option<String>,
    pub model_id: String,
    pub note: String,
    pub supports_attachments: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentModelSourceStatus {
    pub kind: String,
    pub label: String,
    pub available: bool,
    pub connected: bool,
    pub binary_path: Option<String>,
    pub auth_source: Option<String>,
    pub message: Option<String>,
    pub models: Vec<AgentSourceModel>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentProviderStatus {
    pub provider: String,
    pub provider_id: String,
    pub base_url: String,
    pub model_id: String,
    pub has_api_key: bool,
    pub source: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelSelectionState {
    pub selected_model_id: Option<String>,
    pub provider_status: Option<AgentProviderStatus>,
    pub source_statuses: Vec<AgentModelSourceStatus>,
    pub is_provider_status_loaded: bool,
    pub models: Vec<ModelSpec>,
    pub selected_model: Option<ModelSpec>,
    pub selected_model_api_id: Option<String>,
    pub selected_model_label: String,
    pub selected_model_supports_attachments: bool,
    pub is_configured: bool,
    pub requires_model_setup: bool,
}

impl ModelSelectionState {
    pub fn new() -> Self {
        Self {
            selected_model_label: "You don't have any model".to_string(),
            ..Default::default()
        }
    }

    pub fn set_provider_data(
        &mut self,
        provider_status: Option<AgentProviderStatus>,
        source_statuses: Vec<AgentModelSourceStatus>,
        models: Vec<ModelSpec>,
        view_model: std::collections::HashMap<String, serde_json::Value>,
    ) {
        self.provider_status = provider_status;
        self.source_statuses = source_statuses;
        self.models = models;
        self.is_provider_status_loaded = true;
        if let Some(v) = view_model.get("selectedModelId") {
            if let Some(s) = v.as_str() {
                self.selected_model_id = Some(s.to_string());
            }
        }
        if let Some(v) = view_model.get("selectedModelApiId") {
            if let Some(s) = v.as_str() {
                self.selected_model_api_id = Some(s.to_string());
            }
        }
        if let Some(v) = view_model.get("selectedModelLabel") {
            if let Some(s) = v.as_str() {
                self.selected_model_label = s.to_string();
            }
        }
        if let Some(v) = view_model.get("selectedModelSupportsAttachments") {
            if let Some(b) = v.as_bool() {
                self.selected_model_supports_attachments = b;
            }
        }
        if let Some(v) = view_model.get("isConfigured") {
            if let Some(b) = v.as_bool() {
                self.is_configured = b;
            }
        }
        if let Some(v) = view_model.get("requiresModelSetup") {
            if let Some(b) = v.as_bool() {
                self.requires_model_setup = b;
            }
        }
    }

    pub fn set_selected_model_id(&mut self, model_id: Option<String>) {
        self.selected_model_id = model_id;
    }
}

#[derive(Debug, Clone)]
pub struct ModelSelectionStore {
    state: Arc<Mutex<ModelSelectionState>>,
}

impl ModelSelectionStore {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ModelSelectionState::new())),
        }
    }

    pub fn with_state<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut ModelSelectionState) -> R,
    {
        let mut guard = self.state.lock().unwrap();
        f(&mut guard)
    }

    pub fn get_state(&self) -> ModelSelectionState {
        self.state.lock().unwrap().clone()
    }
}

impl Default for ModelSelectionStore {
    fn default() -> Self {
        Self::new()
    }
}
