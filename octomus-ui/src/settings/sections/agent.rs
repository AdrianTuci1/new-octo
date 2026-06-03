/// Agent settings section state.
///
/// Mirrors the React `AgentSection` component and `agentSettings.ts` shape.
#[derive(Debug, Clone)]
pub struct AgentSettings {
    pub enabled: bool,
    pub active_ai: ActiveAiSettings,
    pub input: InputSettings,
    pub permissions: PermissionSettings,
    pub other: OtherSettings,
    pub mcp: McpSettings,
}

#[derive(Debug, Clone)]
pub struct ActiveAiSettings {
    pub next_command: bool,
    pub prompt_suggestions: bool,
    pub suggested_code_banners: bool,
    pub shared_block_title_generation: bool,
}

#[derive(Debug, Clone)]
pub struct InputSettings {
    pub autodetect_agent_prompts_in_terminal: bool,
    pub autodetect_terminal_commands_in_agent: bool,
    pub natural_language_denylist: String,
    pub show_input_hint_text: bool,
    pub show_agent_tips: bool,
    pub include_agent_executed_commands_in_history: bool,
}

#[derive(Debug, Clone)]
pub struct PermissionSettings {
    pub web_search: bool,
    pub computer_use: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ThinkingDisplayMode {
    ShowAndCollapse,
    AlwaysShow,
    NeverShow,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreferredConversationLayout {
    NewTab,
    CurrentPane,
    SplitPane,
}

#[derive(Debug, Clone)]
pub struct OtherSettings {
    pub show_oz_changelog: bool,
    pub show_use_agent_footer: bool,
    pub show_conversation_history_in_tools_panel: bool,
    pub thinking_display_mode: ThinkingDisplayMode,
    pub preferred_conversation_layout: PreferredConversationLayout,
}

#[derive(Debug, Clone)]
pub struct McpSettings {
    pub auto_spawn_from_third_party_agents: bool,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            active_ai: ActiveAiSettings {
                next_command: true,
                prompt_suggestions: true,
                suggested_code_banners: true,
                shared_block_title_generation: true,
            },
            input: InputSettings {
                autodetect_agent_prompts_in_terminal: true,
                autodetect_terminal_commands_in_agent: true,
                natural_language_denylist: String::new(),
                show_input_hint_text: true,
                show_agent_tips: true,
                include_agent_executed_commands_in_history: true,
            },
            permissions: PermissionSettings {
                web_search: false,
                computer_use: false,
            },
            other: OtherSettings {
                show_oz_changelog: true,
                show_use_agent_footer: true,
                show_conversation_history_in_tools_panel: false,
                thinking_display_mode: ThinkingDisplayMode::ShowAndCollapse,
                preferred_conversation_layout: PreferredConversationLayout::NewTab,
            },
            mcp: McpSettings {
                auto_spawn_from_third_party_agents: false,
            },
        }
    }
}

impl AgentSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn patch_active_ai(&mut self, patch: ActiveAiSettings,
    ) {
        self.active_ai = patch;
    }

    pub fn patch_input(&mut self, patch: InputSettings,
    ) {
        self.input = patch;
    }

    pub fn patch_permissions(&mut self, patch: PermissionSettings,
    ) {
        self.permissions = patch;
    }

    pub fn patch_other(&mut self, patch: OtherSettings,
    ) {
        self.other = patch;
    }

    pub fn patch_mcp(&mut self, patch: McpSettings,
    ) {
        self.mcp = patch;
    }
}
