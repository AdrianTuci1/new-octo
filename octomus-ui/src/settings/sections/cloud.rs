/// Cloud settings section state.
///
/// Mirrors the React `CloudCredentialsSection` and `CloudProfileDrawer` components.
#[derive(Debug, Clone)]
pub struct CloudProfile {
    pub id: String,
    pub title: String,
    pub provider: CloudProviderId,
    pub environment: String,
    pub runtime: String,
    pub connection_method: CloudConnectionMethod,
    pub host: String,
    pub username: String,
    pub bootstrap_public_key: String,
    pub secret_ref: String,
    pub has_secret: bool,
    pub status: CloudProfileStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CloudProviderId {
    CustomVm,
    Modal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CloudConnectionMethod {
    SshKey,
    SshAgent,
    ModalToken,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CloudProfileStatus {
    Ready,
    Draft,
}

#[derive(Debug, Clone)]
pub struct CloudSettings {
    pub profiles: Vec<CloudProfile>,
    pub encrypt_locally: bool,
    pub share_across_profiles: bool,
}

impl Default for CloudSettings {
    fn default() -> Self {
        Self {
            profiles: Vec::new(),
            encrypt_locally: true,
            share_across_profiles: true,
        }
    }
}

impl CloudSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn custom_vm_count(&self) -> usize {
        self.profiles
            .iter()
            .filter(|p| matches!(p.provider, CloudProviderId::CustomVm) && p.has_secret)
            .count()
    }

    pub fn modal_count(&self) -> usize {
        self.profiles
            .iter()
            .filter(|p| matches!(p.provider, CloudProviderId::Modal) && p.has_secret)
            .count()
    }

    pub fn upsert_profile(&mut self, profile: CloudProfile) {
        if let Some(pos) = self.profiles.iter().position(|p| p.id == profile.id) {
            self.profiles[pos] = profile;
        } else {
            self.profiles.push(profile);
        }
    }

    pub fn remove_profile(&mut self, id: &str) -> Option<CloudProfile> {
        let pos = self.profiles.iter().position(|p| p.id == id)?;
        Some(self.profiles.remove(pos))
    }
}

/// Build a secret account reference for a cloud profile.
pub fn cloud_secret_account(profile_id: &str, provider: CloudProviderId) -> String {
    let provider_str = match provider {
        CloudProviderId::CustomVm => "custom-vm",
        CloudProviderId::Modal => "modal",
    };
    format!("cloud/{}@{}", profile_id, provider_str)
}

/// Human-readable labels for connection methods.
pub fn connection_method_label(method: &CloudConnectionMethod) -> &'static str {
    match method {
        CloudConnectionMethod::SshKey => "SSH key bootstrap",
        CloudConnectionMethod::SshAgent => "SSH agent",
        CloudConnectionMethod::ModalToken => "Modal token",
    }
}
