use itertools::Itertools;

use super::{registry::CommandRegistry, CommandScope};

pub fn get_matching_signature_for_input<'a>(
    input: &str,
    registry: &'a CommandRegistry,
) -> Option<(CommandScope, usize)> {
    let input_tokens = input.split_whitespace().collect_vec();
    get_matching_signature_for_tokenized_input(
        &input_tokens,
        input.ends_with(char::is_whitespace),
        registry,
    )
}

pub fn get_matching_signature_for_tokenized_input(
    input_tokens: &[&str],
    has_trailing_whitespace: bool,
    registry: &CommandRegistry,
) -> Option<(CommandScope, usize)> {
    let (first_token, remaining_tokens) = input_tokens.split_first()?;
    let candidate_scopes = registry.registered_scopes();

    let mut best_match: Option<(CommandScope, usize)> = None;

    for scope in candidate_scopes {
        if scope.command != *first_token {
            continue;
        }

        let scope_token_count = scope.token_count();
        let scope_tokens = scope.label();
        let scope_tokens = scope_tokens.split_whitespace().collect_vec();
        if scope_tokens.len() > input_tokens.len() {
            continue;
        }

        let mut matches = true;
        for (index, scope_token) in scope_tokens.iter().enumerate() {
            let Some(token) = input_tokens.get(index) else {
                matches = false;
                break;
            };

            if index == scope_tokens.len() - 1
                && !has_trailing_whitespace
                && **token != **scope_token
            {
                matches = false;
                break;
            }

            if **token != **scope_token {
                matches = false;
                break;
            }
        }

        if matches {
            let candidate = (scope.clone(), scope_token_count.saturating_sub(1));
            let should_replace = match &best_match {
                Some((existing_scope, _)) => {
                    candidate.0.token_count() > existing_scope.token_count()
                }
                None => true,
            };
            if should_replace {
                best_match = Some(candidate);
            }
        }
    }

    best_match.or_else(|| {
        let scope = CommandScope::root(first_token);
        registry
            .get_signature(&scope)
            .map(|_| (scope, remaining_tokens.len()))
    })
}
