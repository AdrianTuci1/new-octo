use super::composer_state::ComposerState;
use super::terminal_controller::TerminalComposerControllerState;

pub struct ComposerController {
    pub state: ComposerState,
    pub terminal: TerminalComposerControllerState,
    pub view_mode: String,
    pub model_setup_required: bool,
    pub selected_model_label: String,
    pub selected_model_supports_attachments: bool,
    pub context_usage_progress: f32,
    pub context_indicator_tone: String,
    pub context_usage_title: Option<String>,
    pub context_indicator_title: Option<String>,
    pub attached_files: Vec<crate::state::chat::ChatAttachment>,
    pub working_directory: Option<String>,
    pub working_directory_label: String,
    pub working_directory_picker_open: bool,
    pub git_branches: Vec<String>,
    pub git_current_branch: Option<String>,
    pub git_branch_menu_open: bool,
    pub terminal_auto_detect_enabled: bool,
    pub restrict_actions: bool,
    pub remote_session_label: Option<String>,
    pub remote_session_title: Option<String>,
    pub recommended_action: Option<String>,
    pub recommended_action_description: Option<String>,
    pub prediction_completion_text: Option<String>,
    pub prediction_full_command: Option<String>,
    pub model_setup_open: bool,
}

impl ComposerController {
    pub fn new() -> Self {
        Self {
            state: ComposerState::new(),
            terminal: TerminalComposerControllerState::new(),
            view_mode: "agent".to_string(),
            model_setup_required: false,
            selected_model_label: "Auto".to_string(),
            selected_model_supports_attachments: false,
            context_usage_progress: 0.0,
            context_indicator_tone: "agent".to_string(),
            context_usage_title: None,
            context_indicator_title: None,
            attached_files: Vec::new(),
            working_directory: None,
            working_directory_label: "~".to_string(),
            working_directory_picker_open: false,
            git_branches: Vec::new(),
            git_current_branch: None,
            git_branch_menu_open: false,
            terminal_auto_detect_enabled: true,
            restrict_actions: false,
            remote_session_label: None,
            remote_session_title: None,
            recommended_action: None,
            recommended_action_description: None,
            prediction_completion_text: None,
            prediction_full_command: None,
            model_setup_open: false,
        }
    }

    pub fn query_mut(&mut self) -> &mut String {
        &mut self.state.query
    }

    pub fn query(&self) -> &str {
        &self.state.query
    }
}
