use super::sections::cloud::{CloudConnectionMethod, CloudProfile, CloudProfileStatus, CloudProviderId};

/// Cloud profile drawer state.
///
/// Mirrors the React `CloudProfileDrawer` component.
#[derive(Debug, Clone)]
pub struct CloudProfileDrawer {
    pub is_open: bool,
    pub selected_profile_id: Option<String>,
    pub profile_name: String,
    pub provider: CloudProviderId,
    pub environment: String,
    pub connection_method: CloudConnectionMethod,
    pub host: String,
    pub username: String,
    pub bootstrap_public_key: String,
    pub ssh_private_key: String,
    pub modal_token: String,
    pub has_secret: bool,
    pub save_error: Option<String>,
    pub is_saving: bool,
}

impl Default for CloudProfileDrawer {
    fn default() -> Self {
        Self {
            is_open: false,
            selected_profile_id: None,
            profile_name: "New cloud profile".to_string(),
            provider: CloudProviderId::CustomVm,
            environment: "dev".to_string(),
            connection_method: CloudConnectionMethod::SshKey,
            host: String::new(),
            username: "root".to_string(),
            bootstrap_public_key: String::new(),
            ssh_private_key: String::new(),
            modal_token: String::new(),
            has_secret: false,
            save_error: None,
            is_saving: false,
        }
    }
}

impl CloudProfileDrawer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open_for_new(&mut self) {
        *self = Self::default();
        self.is_open = true;
    }

    pub fn open_for_edit(&mut self, profile: &CloudProfile) {
        self.is_open = true;
        self.selected_profile_id = Some(profile.id.clone());
        self.profile_name = profile.title.clone();
        self.provider = profile.provider.clone();
        self.environment = profile.environment.clone();
        self.connection_method = profile.connection_method.clone();
        self.host = profile.host.clone();
        self.username = profile.username.clone();
        self.bootstrap_public_key = profile.bootstrap_public_key.clone();
        self.ssh_private_key = String::new();
        self.modal_token = String::new();
        self.has_secret = profile.has_secret;
        self.save_error = None;
    }

    pub fn close(&mut self) {
        self.is_open = false;
        self.selected_profile_id = None;
    }

    pub fn set_provider(&mut self, provider: CloudProviderId) {
        self.provider = provider.clone();
        match provider {
            CloudProviderId::CustomVm => {
                self.environment = "dev".to_string();
                self.connection_method = CloudConnectionMethod::SshKey;
                self.username = "root".to_string();
            }
            CloudProviderId::Modal => {
                self.environment = "main".to_string();
                self.connection_method = CloudConnectionMethod::ModalToken;
                self.username = "modal".to_string();
            }
        }
        self.host.clear();
        self.bootstrap_public_key.clear();
        self.ssh_private_key.clear();
        self.modal_token.clear();
        self.has_secret = false;
    }

    pub fn build_profile(&self) -> CloudProfile {
        let id = self
            .selected_profile_id
            .clone()
            .unwrap_or_else(|| format!("cloud_{}", now_millis()));
        let title = if self.profile_name.trim().is_empty() {
            match self.provider {
                CloudProviderId::CustomVm => "Custom VM".to_string(),
                CloudProviderId::Modal => "Modal profile".to_string(),
            }
        } else {
            self.profile_name.trim().to_string()
        };
        let runtime = match self.provider {
            CloudProviderId::CustomVm => {
                if self.host.trim().is_empty() {
                    "Configure host and credentials".to_string()
                } else {
                    format!("{}@{}", self.username.trim(), self.host.trim())
                }
            }
            CloudProviderId::Modal => "Modal Sandbox".to_string(),
        };
        let status = match self.provider {
            CloudProviderId::CustomVm => {
                if !self.host.trim().is_empty()
                    && !self.username.trim().is_empty()
                    && (matches!(self.connection_method, CloudConnectionMethod::SshAgent)
                        || self.has_secret
                        || !self.ssh_private_key.trim().is_empty())
                {
                    CloudProfileStatus::Ready
                } else {
                    CloudProfileStatus::Draft
                }
            }
            CloudProviderId::Modal => {
                if self.has_secret || !self.modal_token.trim().is_empty() {
                    CloudProfileStatus::Ready
                } else {
                    CloudProfileStatus::Draft
                }
            }
        };
        CloudProfile {
            id,
            title,
            provider: self.provider.clone(),
            environment: self.environment.clone(),
            runtime,
            connection_method: self.connection_method.clone(),
            host: self.host.trim().to_string(),
            username: self.username.trim().to_string(),
            bootstrap_public_key: self.bootstrap_public_key.trim().to_string(),
            secret_ref: super::sections::cloud::cloud_secret_account(
                &self.selected_profile_id.clone().unwrap_or_default(),
                self.provider.clone(),
            ),
            has_secret: self.has_secret || !self.ssh_private_key.trim().is_empty() || !self.modal_token.trim().is_empty(),
            status,
        }
    }
}

fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
