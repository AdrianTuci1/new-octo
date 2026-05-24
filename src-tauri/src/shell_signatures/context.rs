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

        let parsed = parse_shell_input(self.input);
        let has_multi_token_prefix = parsed.tokens.len() > 1;
        let history_prediction =
            model::predict_from_history(trimmed, self.cwd, self.history_entries);

        if self.should_prefer_path_completion() {
            if let Some(path_prediction) = self.predict_path_completion() {
                if let Some(history_prediction) = history_prediction.as_ref() {
                    if should_prefer_history_prediction_over_path(
                        &parsed,
                        history_prediction,
                        &path_prediction,
                    ) {
                        return Some(history_prediction.clone());
                    }
                }

                return Some(path_prediction);
            }

            if let Some(history_prediction) = history_prediction.clone() {
                return Some(history_prediction);
            }
        }

        if !has_multi_token_prefix {
            return history_prediction
                .or_else(|| self.predict_signature_completion())
                .or_else(|| self.predict_path_completion())
                .or_else(|| self.predict_from_executables());
        }

        history_prediction
            .or_else(|| self.predict_signature_completion())
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

fn should_prefer_history_prediction_over_path(
    parsed: &super::parser::ParsedShellInput,
    history_prediction: &CommandPrediction,
    path_prediction: &CommandPrediction,
) -> bool {
    if parsed.has_trailing_whitespace {
        return false;
    }

    let current_token = parsed
        .tokens
        .last()
        .map(String::as_str)
        .unwrap_or_default()
        .trim();
    if current_token.is_empty() {
        return false;
    }

    let history_tokens = parse_shell_input(&history_prediction.suggestion)
        .tokens
        .len();
    let path_tokens = parse_shell_input(&path_prediction.suggestion).tokens.len();

    history_tokens > path_tokens
        && history_prediction.suggestion.len() > path_prediction.suggestion.len()
}
