use super::composer_state::ComposerState;

pub struct TerminalComposerControllerState {
    pub state: ComposerState,
    pub show_recommendation: bool,
    pub recommended_action: Option<String>,
    pub prediction_suffix: Option<String>,
    pub show_completion_panel: bool,
    pub completion_state: Option<ShellCompletionState>,
    pub completion_items: Vec<CompletionItem>,
}

pub struct ShellCompletionState {
    pub format: Option<String>,
    pub prompt_visible: bool,
    pub status: String,
    pub last_value: Option<String>,
}

pub struct CompletionItem {
    pub name: String,
    pub description: Option<String>,
}

impl TerminalComposerControllerState {
    pub fn new() -> Self {
        Self {
            state: ComposerState::new(),
            show_recommendation: false,
            recommended_action: None,
            prediction_suffix: None,
            show_completion_panel: false,
            completion_state: None,
            completion_items: Vec::new(),
        }
    }

    pub fn show_recommendation(&self) -> bool {
        self.show_recommendation
    }

    pub fn prediction_suffix(&self) -> Option<&str> {
        self.prediction_suffix.as_deref()
    }

    pub fn show_completion_panel(&self) -> bool {
        self.show_completion_panel
    }

    pub fn completion_items(&self) -> &[CompletionItem] {
        &self.completion_items
    }
}
