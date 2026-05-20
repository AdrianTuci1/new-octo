use crate::{
    ai::predict::model::{CommandPrediction, PredictionKind},
    terminal::ShellHistoryEntry,
};

use super::{
    command_argument_expects_path, parser::parse_shell_input, utils, CommandScope,
    ShellSignatureRegistry,
};

pub fn collect_signature_candidates(
    input: &str,
    history_entries: &[ShellHistoryEntry],
) -> Vec<String> {
    let registry = ShellSignatureRegistry::global();
    let parsed = parse_shell_input(input);
    let tokens = parsed.tokens.iter().map(String::as_str).collect::<Vec<_>>();
    let normalized_input = tokens.join(" ");
    let trimmed = normalized_input.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut candidates = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
    let mut push = |value: String| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return;
        }
        if seen.insert(trimmed.to_lowercase()) {
            candidates.push(trimmed.to_string());
        }
    };

    for scope in registry.relevant_scopes(&tokens) {
        let metadata = registry.ensure_scope_loaded(&scope);
        push_scope_candidates(&mut push, &scope, &metadata, &normalized_input);
    }

    for candidate in registry.collect_protocol_candidates(input, &tokens) {
        push(candidate);
    }

    for candidate in utils::collect_history_prefix_candidates(trimmed, history_entries) {
        push(candidate);
    }

    candidates
}

pub fn predict_signature_completion(
    input: &str,
    cwd: Option<&str>,
    history_entries: &[ShellHistoryEntry],
) -> Option<CommandPrediction> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let parsed = parse_shell_input(input);
    let tokens = parsed.tokens.iter().map(String::as_str).collect::<Vec<_>>();
    if tokens.is_empty() {
        return None;
    }

    if trimmed.eq_ignore_ascii_case("git") {
        let history_candidate = utils::collect_history_prefix_candidates(trimmed, history_entries)
            .into_iter()
            .find(|candidate| candidate.trim() != trimmed)?;

        return Some(CommandPrediction {
            input: cwd.unwrap_or(trimmed).to_string(),
            suggestion: history_candidate,
            confidence: 0.88,
            kind: PredictionKind::History,
        });
    }

    let current_token_index = if parsed.has_trailing_whitespace {
        tokens.len()
    } else {
        tokens.len().saturating_sub(1)
    };

    if command_argument_expects_path(&tokens, current_token_index) {
        return None;
    }

    let candidates = collect_signature_candidates(input, history_entries);
    let suggestion = candidates
        .into_iter()
        .find(|candidate| candidate.trim() != trimmed)?;

    let confidence = if suggestion
        .to_lowercase()
        .starts_with(&trimmed.to_lowercase())
    {
        0.9
    } else {
        0.78
    };

    Some(CommandPrediction {
        input: cwd.unwrap_or(trimmed).to_string(),
        suggestion,
        confidence,
        kind: PredictionKind::Heuristic,
    })
}

fn push_scope_candidates(
    push: &mut impl FnMut(String),
    scope: &CommandScope,
    metadata: &super::ScopeMetadata,
    normalized_input: &str,
) {
    let normalized_lower = normalized_input.to_lowercase();

    for candidate in metadata.examples.iter().cloned() {
        if candidate.to_lowercase().starts_with(&normalized_lower) {
            push(candidate);
        }
    }

    for candidate in metadata.command_templates.iter().cloned() {
        if candidate.to_lowercase().starts_with(&normalized_lower) {
            push(candidate);
        }
    }

    for option in metadata.option_names.iter() {
        let option_template = format!("{} {} ", scope.label(), option);
        if option_template
            .to_lowercase()
            .starts_with(&normalized_lower)
        {
            push(option_template);
        }
    }

    for subcommand in metadata.subcommands.iter() {
        let candidate = if scope.token_count() == 1 {
            format!("{} {}", scope.command, subcommand)
        } else {
            format!("{} {}", scope.label(), subcommand)
        };
        if candidate.to_lowercase().starts_with(&normalized_lower) {
            push(candidate);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn predicts_python3_option_templates_from_signature_registry() {
        let registry = ShellSignatureRegistry::global();
        let scope = CommandScope::root("python3");
        let mut metadata = super::super::ScopeMetadata::default();
        metadata.command_templates.insert("python3 -c ".to_string());
        metadata.command_templates.insert("python3 -m ".to_string());
        metadata.option_names.insert("-c".to_string());
        metadata.option_names.insert("-m".to_string());

        if let Ok(mut state) = registry.state.lock() {
            state.scopes.insert(scope.clone(), metadata.clone());
        }
        registry
            .command_registry
            .register_signature(super::super::registry::CommandSignature { scope, metadata });

        let prediction = predict_signature_completion("python3 -", Some("/tmp"), &[])
            .expect("python3 should have signature-driven completions");

        assert!(prediction.suggestion.starts_with("python3 -"));
        assert_ne!(prediction.suggestion, "python3 -");
    }

    #[test]
    fn does_not_suggest_bare_git_without_history() {
        let prediction = predict_signature_completion("git", Some("/tmp"), &[]);
        assert!(prediction.is_none());
    }
}
