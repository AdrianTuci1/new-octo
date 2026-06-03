/// Third party CLI agents settings section state.
///
/// Mirrors the React `ThirdPartyCliAgentsSection` component.
#[derive(Debug, Clone)]
pub struct ThirdPartyCliSettings {
    pub show_toolbar: bool,
    pub auto_show_hide_rich_input: bool,
    pub auto_open_rich_input: bool,
    pub auto_dismiss_rich_input: bool,
    pub command_patterns: Vec<String>,
    pub left_chip_ids: Vec<String>,
    pub right_chip_ids: Vec<String>,
}

pub const DEFAULT_THIRD_PARTY_LEFT_CHIP_IDS: [&str; 5] = [
    "attach",
    "voice",
    "diff",
    "explorer",
    "rich_in",
];

pub const DEFAULT_THIRD_PARTY_RIGHT_CHIP_IDS: [&str; 3] = [
    "desktop",
    "git_branch",
    "settings",
];

impl Default for ThirdPartyCliSettings {
    fn default() -> Self {
        Self {
            show_toolbar: true,
            auto_show_hide_rich_input: true,
            auto_open_rich_input: false,
            auto_dismiss_rich_input: false,
            command_patterns: vec![
                "claude".to_string(),
                "codex".to_string(),
                "gemini".to_string(),
            ],
            left_chip_ids: DEFAULT_THIRD_PARTY_LEFT_CHIP_IDS
                .iter()
                .map(|s| s.to_string())
                .collect(),
            right_chip_ids: DEFAULT_THIRD_PARTY_RIGHT_CHIP_IDS
                .iter()
                .map(|s| s.to_string())
                .collect(),
        }
    }
}

impl ThirdPartyCliSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_command_pattern(&mut self, pattern: String) {
        let trimmed = pattern.trim().to_string();
        if !trimmed.is_empty() && !self.command_patterns.contains(&trimmed) {
            self.command_patterns.push(trimmed);
        }
    }

    pub fn remove_command_pattern(&mut self, pattern: &str) {
        self.command_patterns.retain(|p| p != pattern);
    }

    pub fn restore_default_chips(&mut self) {
        self.left_chip_ids = DEFAULT_THIRD_PARTY_LEFT_CHIP_IDS
            .iter()
            .map(|s| s.to_string())
            .collect();
        self.right_chip_ids = DEFAULT_THIRD_PARTY_RIGHT_CHIP_IDS
            .iter()
            .map(|s| s.to_string())
            .collect();
    }
}
