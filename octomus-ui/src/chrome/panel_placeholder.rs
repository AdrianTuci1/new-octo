/// Workspace panel placeholder state.
///
/// Mirrors the React `WorkspacePanelPlaceholder` component.
#[derive(Debug, Clone)]
pub struct PanelPlaceholder {
    pub title: String,
    pub description: String,
    pub eyebrow: String,
}

impl Default for PanelPlaceholder {
    fn default() -> Self {
        Self {
            title: "Panel".to_string(),
            description: "This panel can become interactive later without changing the chrome.".to_string(),
            eyebrow: "Overview".to_string(),
        }
    }
}

impl PanelPlaceholder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_title(title: &str) -> Self {
        Self {
            title: title.to_string(),
            ..Default::default()
        }
    }

    pub fn with_content(title: &str, description: &str, eyebrow: &str) -> Self {
        Self {
            title: title.to_string(),
            description: description.to_string(),
            eyebrow: eyebrow.to_string(),
        }
    }
}
