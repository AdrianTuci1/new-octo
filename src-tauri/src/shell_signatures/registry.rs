use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
};

use super::{CommandScope, ScopeMetadata};

#[derive(Debug, Clone)]
pub struct CommandSignature {
    pub scope: CommandScope,
    pub metadata: ScopeMetadata,
}

#[derive(Debug, Default)]
pub struct CommandRegistry {
    signatures: Mutex<HashMap<CommandScope, CommandSignature>>,
}

impl CommandRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn global_instance() -> Arc<Self> {
        static GLOBAL_REGISTRY: OnceLock<Arc<CommandRegistry>> = OnceLock::new();
        GLOBAL_REGISTRY
            .get_or_init(|| Arc::new(CommandRegistry::new()))
            .clone()
    }

    pub fn register_signature(&self, signature: CommandSignature) {
        if let Ok(mut signatures) = self.signatures.lock() {
            signatures.insert(signature.scope.clone(), signature);
        }
    }

    pub fn get_signature(&self, scope: &CommandScope) -> Option<CommandSignature> {
        self.signatures
            .lock()
            .ok()
            .and_then(|signatures| signatures.get(scope).cloned())
    }

    pub fn registered_scopes(&self) -> Vec<CommandScope> {
        self.signatures
            .lock()
            .ok()
            .map(|signatures| signatures.keys().cloned().collect())
            .unwrap_or_default()
    }
}
