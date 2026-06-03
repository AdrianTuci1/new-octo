/// Settings UI primitives.
///
/// Mirrors the React `SettingsPrimitives` component — reusable toggle, row, select, header.

/// A boolean toggle control.
#[derive(Debug, Clone)]
pub struct SettingsToggle {
    pub checked: bool,
}

impl SettingsToggle {
    pub fn new(checked: bool) -> Self {
        Self { checked }
    }

    pub fn toggle(&mut self) {
        self.checked = !self.checked;
    }

    pub fn set(&mut self, value: bool) {
        self.checked = value;
    }
}

/// A section header with a title.
#[derive(Debug, Clone)]
pub struct SectionHeader {
    pub title: String,
}

impl SectionHeader {
    pub fn new(title: &str) -> Self {
        Self {
            title: title.to_string(),
        }
    }
}

/// A single settings row with a title, optional description, and an action slot.
#[derive(Debug, Clone)]
pub struct SettingsRow {
    pub title: String,
    pub description: Option<String>,
    pub action: SettingsRowAction,
}

#[derive(Debug, Clone)]
pub enum SettingsRowAction {
    Toggle(SettingsToggle),
    Select(SettingsSelect),
    TextInput(String),
    Button(String),
    Custom,
}

impl SettingsRow {
    pub fn new(title: &str, action: SettingsRowAction) -> Self {
        Self {
            title: title.to_string(),
            description: None,
            action,
        }
    }

    pub fn with_description(title: &str, description: &str, action: SettingsRowAction) -> Self {
        Self {
            title: title.to_string(),
            description: Some(description.to_string()),
            action,
        }
    }
}

/// A select/dropdown control.
#[derive(Debug, Clone)]
pub struct SettingsSelect {
    pub value: String,
    pub options: Vec<SettingsSelectOption>,
    pub min_width: u32,
}

#[derive(Debug, Clone)]
pub struct SettingsSelectOption {
    pub value: String,
    pub label: String,
}

impl SettingsSelect {
    pub fn new(value: &str, options: Vec<(&str, &str)>) -> Self {
        Self {
            value: value.to_string(),
            options: options
                .into_iter()
                .map(|(v, l)| SettingsSelectOption {
                    value: v.to_string(),
                    label: l.to_string(),
                })
                .collect(),
            min_width: 120,
        }
    }

    pub fn with_min_width(mut self, min_width: u32) -> Self {
        self.min_width = min_width;
        self
    }

    pub fn set_value(&mut self, value: String) {
        self.value = value;
    }
}
