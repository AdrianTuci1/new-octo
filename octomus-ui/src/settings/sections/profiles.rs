/// Profiles settings section state.
///
/// Mirrors the React `ProfilesSection` component and `agentSettings.ts` profile shape.
#[derive(Debug, Clone)]
pub struct AgentProfileSettings {
    pub id: String,
    pub name: String,
    pub base_model: String,
    pub terminal_model: String,
    pub apply_diffs: String,
    pub read_files: String,
    pub directory_allowlist: Vec<String>,
    pub execute_commands: String,
    pub command_allowlist: Vec<String>,
    pub interact_with_running_commands: String,
    pub ask_questions: String,
    pub call_mcp_servers: String,
    pub mcp_allowlist: Vec<String>,
    pub mcp_denylist: Vec<String>,
    pub call_web_tools: bool,
    pub plan_auto_sync: bool,
}

impl Default for AgentProfileSettings {
    fn default() -> Self {
        Self {
            id: "default".to_string(),
            name: "Default".to_string(),
            base_model: "Auto".to_string(),
            terminal_model: "Auto".to_string(),
            apply_diffs: "Ask".to_string(),
            read_files: "Auto".to_string(),
            directory_allowlist: Vec::new(),
            execute_commands: "Ask".to_string(),
            command_allowlist: Vec::new(),
            interact_with_running_commands: "Ask".to_string(),
            ask_questions: "Auto".to_string(),
            call_mcp_servers: "Ask".to_string(),
            mcp_allowlist: Vec::new(),
            mcp_denylist: Vec::new(),
            call_web_tools: false,
            plan_auto_sync: false,
        }
    }
}

impl AgentProfileSettings {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Clone)]
pub struct ProfilesSettings {
    pub profiles: Vec<AgentProfileSettings>,
    pub active_profile_id: String,
}

impl Default for ProfilesSettings {
    fn default() -> Self {
        Self {
            profiles: vec![AgentProfileSettings::default()],
            active_profile_id: "default".to_string(),
        }
    }
}

impl ProfilesSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn active_profile(&self) -> Option<&AgentProfileSettings> {
        self.profiles.iter().find(|p| p.id == self.active_profile_id)
    }

    pub fn add_profile(&mut self, profile: AgentProfileSettings) {
        self.profiles.push(profile);
    }

    pub fn set_active_profile_id(&mut self, id: String) {
        self.active_profile_id = id;
    }

    pub fn unique_profile_name(&self, base_name: &str) -> String {
        if !self.profiles.iter().any(|p| p.name == base_name) {
            return base_name.to_string();
        }
        let mut index = 2;
        while self.profiles.iter().any(|p| p.name == format!("{} {}", base_name, index)) {
            index += 1;
        }
        format!("{} {}", base_name, index)
    }
}
