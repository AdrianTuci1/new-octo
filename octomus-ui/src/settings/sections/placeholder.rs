/// Placeholder settings section state.
///
/// Mirrors the React `SectionPlaceholder` component.
#[derive(Debug, Clone)]
pub struct PlaceholderSettings {
    pub title: String,
    pub description: String,
}

impl Default for PlaceholderSettings {
    fn default() -> Self {
        Self {
            title: "Settings".to_string(),
            description: "This module is ready for expansion.".to_string(),
        }
    }
}

impl PlaceholderSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_title(title: &str) -> Self {
        Self {
            title: title.to_string(),
            description: "This module is ready for expansion.".to_string(),
        }
    }
}
