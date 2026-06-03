use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use super::types::{
    AgentModelSourceStatus, AgentProviderStatus, ModelSpec,
};

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
            selected_model_label: "You do not have any model".to_string(),
            ..Default::default()
        }
    }

    pub fn set_provider_data(
        &mut self,
        provider_status: Option<AgentProviderStatus>,
        source_statuses: Vec<AgentModelSourceStatus>,
        models: Vec<ModelSpec>,
        selected_model_id: Option<String>,
        selected_model: Option<ModelSpec>,
        selected_model_api_id: Option<String>,
        selected_model_label: String,
        selected_model_supports_attachments: bool,
        is_configured: bool,
        requires_model_setup: bool,
    ) {
        self.provider_status = provider_status;
        self.source_statuses = source_statuses;
        self.models = models;
        self.is_provider_status_loaded = true;
        self.selected_model_id = selected_model_id;
        self.selected_model = selected_model;
        self.selected_model_api_id = selected_model_api_id;
        self.selected_model_label = selected_model_label;
        self.selected_model_supports_attachments = selected_model_supports_attachments;
        self.is_configured = is_configured;
        self.requires_model_setup = requires_model_setup;
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
    pub fn new() -> Self { Self { state: Arc::new(Mutex::new(ModelSelectionState::new())) } }
    pub fn with_state<F, R>(&self, f: F) -> R where F: FnOnce(&mut ModelSelectionState) -> R { let mut guard = self.state.lock().unwrap(); f(&mut guard) }
    pub fn get_state(&self) -> ModelSelectionState { self.state.lock().unwrap().clone() }
}

impl Default for ModelSelectionStore { fn default() -> Self { Self::new() } }
