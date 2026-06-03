/// Cloud credentials settings section state.
///
/// Mirrors the React `CloudCredentialsSection` component.
#[derive(Debug, Clone)]
pub struct CloudCredentialSource {
    pub title: String,
    pub description: String,
    pub status: String,
    pub icon: String,
}

#[derive(Debug, Clone)]
pub struct CloudCredentialMapping {
    pub title: String,
    pub subtitle: String,
    pub status: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CloudCredentialsSettings {
    pub encrypt_locally: bool,
    pub share_across_profiles: bool,
    pub credential_sources: Vec<CloudCredentialSource>,
    pub mappings: Vec<CloudCredentialMapping>,
}

impl Default for CloudCredentialsSettings {
    fn default() -> Self {
        Self {
            encrypt_locally: true,
            share_across_profiles: true,
            credential_sources: vec![
                CloudCredentialSource {
                    title: "Custom VM credentials".to_string(),
                    description: "Store SSH material, bootstrap env values, and profile-level auth references for your own machines.".to_string(),
                    status: "Needs setup".to_string(),
                    icon: "MonitorCog".to_string(),
                },
                CloudCredentialSource {
                    title: "Modal credentials".to_string(),
                    description: "Register provider tokens and runtime secrets used to start Modal-backed cloud terminals.".to_string(),
                    status: "Needs setup".to_string(),
                    icon: "Cloud".to_string(),
                },
            ],
            mappings: Vec::new(),
        }
    }
}

impl CloudCredentialsSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_encrypt_locally(&mut self, enabled: bool) {
        self.encrypt_locally = enabled;
    }

    pub fn set_share_across_profiles(&mut self, enabled: bool) {
        self.share_across_profiles = enabled;
    }

    pub fn update_sources_from_profile_counts(&mut self, custom_vm_count: usize, modal_count: usize) {
        if let Some(source) = self.credential_sources.iter_mut().find(|s| s.title == "Custom VM credentials") {
            source.status = if custom_vm_count > 0 {
                format!("{} configured", custom_vm_count)
            } else {
                "Needs setup".to_string()
            };
        }
        if let Some(source) = self.credential_sources.iter_mut().find(|s| s.title == "Modal credentials") {
            source.status = if modal_count > 0 {
                format!("{} configured", modal_count)
            } else {
                "Needs setup".to_string()
            };
        }
    }
}
