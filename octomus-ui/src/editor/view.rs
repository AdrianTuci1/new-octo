use syntect::easy::HighlightLines;
use syntect::highlighting::{ThemeSet, Style};
use syntect::parsing::SyntaxSet;
use syntect::util::LinesWithEndings;

/// Editor view with syntect highlighting.
///
/// Mirrors the editor view rendering concepts from the React editor integration.
pub struct EditorView {
    pub syntax_set: SyntaxSet,
    pub theme_set: ThemeSet,
    pub theme_name: String,
}

impl Default for EditorView {
    fn default() -> Self {
        Self {
            syntax_set: SyntaxSet::load_defaults_newlines(),
            theme_set: ThemeSet::load_defaults(),
            theme_name: "base16-ocean.dark".to_string(),
        }
    }
}

impl EditorView {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn highlight(&self, code: &str, language: &str) -> Vec<HighlightedLine> {
        let theme = self.theme_set.themes.get(&self.theme_name)
            .unwrap_or_else(|| self.theme_set.themes.values().next().expect("no themes"));
        let syntax = self.syntax_set.find_syntax_by_token(language)
            .unwrap_or_else(|| self.syntax_set.find_syntax_plain_text());
        let mut highlighter = HighlightLines::new(syntax, theme);
        let mut lines = Vec::new();
        for line in LinesWithEndings::from(code) {
            let ranges: Vec<(Style, String)> = highlighter.highlight_line(line, &self.syntax_set).unwrap_or_default().into_iter().map(|(s,t)| (s, t.to_string())).collect();
            lines.push(HighlightedLine {
                text: line.trim_end_matches('\n').to_string(),
                ranges,
            });
        }
        lines
    }

    pub fn set_theme(&mut self, name: String) {
        self.theme_name = name;
    }
}

#[derive(Debug, Clone)]
pub struct HighlightedLine {
    pub text: String,
    pub ranges: Vec<(Style, String)>,
}
