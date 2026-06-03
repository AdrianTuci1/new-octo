/// Knowledge settings section state.
///
/// Mirrors the React `KnowledgeSection` component.
#[derive(Debug, Clone)]
pub struct KnowledgeSettings {
    pub rules_enabled: bool,
    pub suggested_rules_enabled: bool,
    pub octo_drive_context_enabled: bool,
}

impl Default for KnowledgeSettings {
    fn default() -> Self {
        Self {
            rules_enabled: true,
            suggested_rules_enabled: true,
            octo_drive_context_enabled: false,
        }
    }
}

impl KnowledgeSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_rules_enabled(&mut self, enabled: bool) {
        self.rules_enabled = enabled;
    }

    pub fn set_suggested_rules_enabled(&mut self, enabled: bool) {
        self.suggested_rules_enabled = enabled;
    }

    pub fn set_octo_drive_context_enabled(&mut self, enabled: bool) {
        self.octo_drive_context_enabled = enabled;
    }
}
