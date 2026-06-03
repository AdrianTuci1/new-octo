/// Keyboard shortcuts settings section state.
///
/// Mirrors the React `KeyboardShortcutsSection` component.
#[derive(Debug, Clone)]
pub struct ShortcutBinding {
    pub keys: Vec<ShortcutKey>,
}

#[derive(Debug, Clone)]
pub struct ShortcutKey {
    pub label: String,
}

#[derive(Debug, Clone)]
pub struct ShortcutRow {
    pub command: String,
    pub bindings: Vec<ShortcutBinding>,
}

#[derive(Debug, Clone)]
pub struct KeyboardShortcutsSettings {
    pub rows: Vec<ShortcutRow>,
    pub search_query: String,
    pub loading: bool,
}

impl Default for KeyboardShortcutsSettings {
    fn default() -> Self {
        Self {
            rows: Vec::new(),
            search_query: String::new(),
            loading: false,
        }
    }
}

impl KeyboardShortcutsSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn filtered_rows(&self) -> Vec<&ShortcutRow> {
        let query = self.search_query.trim().to_lowercase();
        if query.is_empty() {
            return self.rows.iter().collect();
        }
        self.rows
            .iter()
            .filter(|row| {
                let command_matches = row.command.to_lowercase().contains(&query);
                let binding_matches = row.bindings.iter().any(|binding| {
                    binding.keys.iter().any(|key| key.label.to_lowercase().contains(&query))
                });
                command_matches || binding_matches
            })
            .collect()
    }
}
