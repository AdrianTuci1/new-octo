/// Profile settings section state.
///
/// Mirrors the React `ProfileSection` / `AccountSection` component.
#[derive(Debug, Clone)]
pub struct ProfileSettings {
    pub display_name: String,
    pub avatar_data_url: Option<String>,
    pub avatar_seed: String,
}

impl Default for ProfileSettings {
    fn default() -> Self {
        Self {
            display_name: "Workspace".to_string(),
            avatar_data_url: None,
            avatar_seed: generate_avatar_seed(),
        }
    }
}

impl ProfileSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_display_name(&mut self, name: String) {
        self.display_name = name;
    }

    pub fn set_avatar_data_url(&mut self, url: Option<String>) {
        self.avatar_data_url = url;
    }

    pub fn regenerate_avatar_seed(&mut self) {
        self.avatar_seed = generate_avatar_seed();
        self.avatar_data_url = None;
    }
}

fn generate_avatar_seed() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("avatar_{}", ts)
}
