use crate::{
    ai::predict::model::{self, CommandPrediction},
    terminal::ShellHistoryEntry,
};

use super::{parser::parse_shell_input, path_engine, signature_engine};

#[derive(Debug, Clone)]
pub struct TerminalCompletionContext<'a> {
    pub input: &'a str,
    pub cwd: Option<&'a str>,
    pub last_command: Option<&'a str>,
    pub history_entries: &'a [ShellHistoryEntry],
    pub available_commands: &'a [String],
}

impl<'a> TerminalCompletionContext<'a> {
    pub fn new(
        input: &'a str,
        cwd: Option<&'a str>,
        last_command: Option<&'a str>,
        history_entries: &'a [ShellHistoryEntry],
        available_commands: &'a [String],
    ) -> Self {
        Self {
            input,
            cwd,
            last_command,
            history_entries,
            available_commands,
        }
    }

    pub fn predict(&self) -> Option<CommandPrediction> {
        let trimmed = self.input.trim();
        if trimmed.is_empty() {
            return model::predict_from_sequences(self.last_command, self.history_entries);
        }

        if self.should_prefer_path_completion() {
            if let Some(prediction) = self.predict_path_completion() {
                return Some(prediction);
            }
        }

        let parsed = parse_shell_input(self.input);
        let has_multi_token_prefix = parsed.tokens.len() > 1;

        if !has_multi_token_prefix {
            return model::predict_from_history(trimmed, self.cwd, self.history_entries)
                .or_else(|| self.predict_signature_completion())
                .or_else(|| self.predict_path_completion())
                .or_else(|| self.predict_from_executables());
        }

        self.predict_signature_completion()
            .or_else(|| model::predict_from_history(trimmed, self.cwd, self.history_entries))
            .or_else(|| self.predict_path_completion())
            .or_else(|| self.predict_from_executables())
    }

    fn should_prefer_path_completion(&self) -> bool {
        let parsed = parse_shell_input(self.input);
        let tokens = parsed.tokens.iter().map(String::as_str).collect::<Vec<_>>();
        if tokens.is_empty() {
            return false;
        }

        let current_token_index = if parsed.has_trailing_whitespace {
            tokens.len()
        } else {
            tokens.len().saturating_sub(1)
        };

        super::command_argument_expects_path(&tokens, current_token_index)
    }

    fn predict_path_completion(&self) -> Option<CommandPrediction> {
        let parsed = parse_shell_input(self.input);
        let tokens = parsed.tokens.iter().map(String::as_str).collect::<Vec<_>>();
        path_engine::predict_path_completion(self.input, self.cwd, &tokens)
    }

    fn predict_signature_completion(&self) -> Option<CommandPrediction> {
        signature_engine::predict_signature_completion(self.input, self.cwd, self.history_entries)
    }

    fn predict_from_executables(&self) -> Option<CommandPrediction> {
        if self.input.contains(' ') {
            return None;
        }

        model::predict_from_executables(self.input.trim(), self.available_commands)
    }
}
