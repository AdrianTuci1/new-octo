use std::{
    collections::{BTreeSet, HashMap, HashSet},
    hash::{Hash, Hasher},
    path::Path,
    sync::{Mutex, OnceLock},
};

pub mod context;
pub mod help;
pub mod lookup;
pub mod parser;
pub mod path_engine;
pub mod protocols;
pub mod registry;
pub mod scripts;
pub mod signature_engine;
pub mod utils;

use crate::ai::predict::model::PredictionKind;
use crate::terminal::ShellHistoryEntry;
use protocols::CompletionProtocol;

#[derive(Debug, Clone, Eq)]
pub struct CommandScope {
    pub command: String,
    pub subcommand: Option<String>,
}

impl PartialEq for CommandScope {
    fn eq(&self, other: &Self) -> bool {
        self.command == other.command && self.subcommand == other.subcommand
    }
}

impl Hash for CommandScope {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.command.hash(state);
        self.subcommand.hash(state);
    }
}

impl CommandScope {
    pub fn root(command: &str) -> Self {
        Self {
            command: command.trim().to_string(),
            subcommand: None,
        }
    }

    pub fn child(command: &str, subcommand: &str) -> Self {
        Self {
            command: command.trim().to_string(),
            subcommand: Some(subcommand.trim().to_string()),
        }
    }

    pub fn label(&self) -> String {
        match self.subcommand.as_deref() {
            Some(subcommand) if !subcommand.is_empty() => {
                format!("{} {}", self.command, subcommand)
            }
            _ => self.command.clone(),
        }
    }

    pub fn token_count(&self) -> usize {
        1 + usize::from(self.subcommand.is_some())
    }
}

#[derive(Debug, Clone, Default)]
pub struct ScopeMetadata {
    pub command_templates: BTreeSet<String>,
    pub examples: BTreeSet<String>,
    pub path_after_scope: bool,
    pub path_after_double_dash: bool,
    pub option_names: BTreeSet<String>,
    pub path_options: HashSet<String>,
    pub subcommands: BTreeSet<String>,
    pub completion_protocols: HashSet<CompletionProtocol>,
}

#[derive(Debug, Default)]
pub struct RegistryState {
    pub scopes: HashMap<CommandScope, ScopeMetadata>,
}

pub struct ShellSignatureRegistry {
    pub state: Mutex<RegistryState>,
    pub command_registry: registry::CommandRegistry,
}

impl ShellSignatureRegistry {
    pub fn global() -> &'static Self {
        static REGISTRY: OnceLock<ShellSignatureRegistry> = OnceLock::new();
        REGISTRY.get_or_init(|| ShellSignatureRegistry {
            state: Mutex::new(RegistryState::default()),
            command_registry: registry::CommandRegistry::new(),
        })
    }

    pub fn collect_candidates(
        &self,
        input: &str,
        history_entries: &[ShellHistoryEntry],
    ) -> Vec<String> {
        let trimmed = input.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }
        let parsed = parser::parse_shell_input(trimmed);
        let token_refs = parsed.tokens.iter().map(String::as_str).collect::<Vec<_>>();
        let normalized_input = parsed.tokens.join(" ");

        let mut candidates = Vec::new();
        let mut seen = HashSet::<String>::new();
        let mut push = |value: String| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return;
            }
            if seen.insert(trimmed.to_lowercase()) {
                candidates.push(trimmed.to_string());
            }
        };

        let prefix = normalized_input.to_lowercase();
        for scope in self.relevant_scopes(&token_refs) {
            let metadata = self.ensure_scope_loaded(&scope);
            let mut scope_candidates = Vec::new();
            scope_candidates.extend(metadata.examples.iter().cloned());
            scope_candidates.extend(metadata.command_templates.iter().cloned());
            scope_candidates.extend(metadata.subcommands.iter().map(|subcommand| {
                if scope.token_count() == 1 {
                    format!("{} {}", scope.command, subcommand)
                } else {
                    format!("{} {}", scope.label(), subcommand)
                }
            }));

            for candidate in scope_candidates {
                if utils::should_skip_candidate(&scope, &candidate) {
                    continue;
                }
                if !utils::is_plausible_signature_candidate(&scope, &metadata, &candidate) {
                    continue;
                }
                if candidate.to_lowercase().starts_with(&prefix) {
                    push(candidate);
                }
            }
        }

        for candidate in self.collect_protocol_candidates(input, &token_refs) {
            push(candidate);
        }

        let history_candidates =
            utils::collect_history_prefix_candidates(&normalized_input, history_entries);
        for candidate in history_candidates {
            push(candidate);
        }

        candidates
    }

    pub fn command_expects_path(&self, tokens: &[&str], index: usize) -> bool {
        let Some(first_token) = tokens.first().copied() else {
            return false;
        };

        let scopes = self.relevant_scopes(tokens);
        for scope in scopes {
            let metadata = self.ensure_scope_loaded(&scope);
            if metadata.path_after_scope && index >= scope.token_count() {
                return true;
            }

            if metadata.path_after_double_dash
                && tokens.iter().take(index).any(|token| *token == "--")
            {
                return true;
            }

            if index > 0 {
                let previous_token = utils::strip_wrapping_quotes(tokens[index - 1]).to_string();
                if metadata.path_options.contains(&previous_token) {
                    return true;
                }
            }
        }

        let normalized = first_token.to_ascii_lowercase();
        matches!(
            normalized.as_str(),
            "cd" | "cat"
                | "less"
                | "more"
                | "head"
                | "tail"
                | "vim"
                | "vi"
                | "nano"
                | "code"
                | "open"
                | "ls"
                | "du"
                | "find"
                | "rm"
                | "cp"
                | "mv"
                | "chmod"
                | "chown"
                | "node"
                | "deno"
        )
    }

    pub fn relevant_scopes(&self, tokens: &[&str]) -> Vec<CommandScope> {
        let Some(first_token) = tokens.first().copied() else {
            return Vec::new();
        };

        let mut scopes = Vec::new();
        if let Some((matched_scope, _)) =
            lookup::get_matching_signature_for_input(&tokens.join(" "), &self.command_registry)
        {
            scopes.push(matched_scope);
        }

        scopes.push(CommandScope::root(first_token));
        if let Some(second_token) = tokens.get(1).copied() {
            if !second_token.starts_with('-') {
                let root_metadata = self.ensure_scope_loaded(&CommandScope::root(first_token));
                if root_metadata.subcommands.contains(second_token)
                    || utils::looks_like_cli_with_subcommands(first_token)
                {
                    scopes.insert(0, CommandScope::child(first_token, second_token));
                }
            }
        }
        scopes
    }

    pub fn ensure_scope_loaded(&self, scope: &CommandScope) -> ScopeMetadata {
        if let Some(existing) = self
            .state
            .lock()
            .ok()
            .and_then(|state| state.scopes.get(scope).cloned())
        {
            return existing;
        }

        let loaded = help::probe_scope_metadata(scope);
        if let Ok(mut state) = self.state.lock() {
            state
                .scopes
                .entry(scope.clone())
                .or_insert_with(|| loaded.clone());
        }
        self.command_registry
            .register_signature(registry::CommandSignature {
                scope: scope.clone(),
                metadata: loaded.clone(),
            });
        loaded
    }

    pub fn collect_protocol_candidates(&self, input: &str, tokens: &[&str]) -> Vec<String> {
        let mut candidates = Vec::new();
        let mut seen = HashSet::<String>::new();
        let mut push = |value: String| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return;
            }
            if seen.insert(trimmed.to_lowercase()) {
                candidates.push(trimmed.to_string());
            }
        };

        for scope in self.relevant_scopes(tokens) {
            let metadata = self.ensure_scope_loaded(&scope);
            for protocol in &metadata.completion_protocols {
                for fragment in protocols::run_completion_protocol(protocol, &scope, input, tokens)
                {
                    if let Some(completed) =
                        protocols::compose_completion_candidate(input, &fragment)
                    {
                        push(completed);
                    }
                }
            }
        }

        if let Some(pip_candidates) = protocols::run_python_pip_completion(input, tokens) {
            for fragment in pip_candidates {
                if let Some(completed) = protocols::compose_completion_candidate(input, &fragment) {
                    push(completed);
                }
            }
        }

        candidates
    }
}

pub fn command_argument_expects_path(tokens: &[&str], index: usize) -> bool {
    ShellSignatureRegistry::global().command_expects_path(tokens, index)
}

pub fn collect_signature_candidates(
    input: &str,
    history_entries: &[ShellHistoryEntry],
) -> Vec<String> {
    ShellSignatureRegistry::global().collect_candidates(input, history_entries)
}

pub fn ensure_command_templates_loaded(command: &str) {
    let registry = ShellSignatureRegistry::global();
    let _ = registry.ensure_scope_loaded(&CommandScope::root(command));
}

pub fn predict_from_signatures(
    input: &str,
    history_entries: &[ShellHistoryEntry],
) -> Option<crate::ai::predict::CommandPrediction> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let signature_candidates = collect_signature_candidates(trimmed, history_entries);
    let history_candidate = utils::collect_history_prefix_candidates(trimmed, history_entries)
        .into_iter()
        .next();

    let candidate = signature_candidates
        .into_iter()
        .next()
        .or(history_candidate)?;
    let confidence = if candidate
        .to_lowercase()
        .starts_with(&trimmed.to_lowercase())
    {
        0.9
    } else {
        0.75
    };

    Some(crate::ai::predict::CommandPrediction {
        input: trimmed.to_string(),
        suggestion: candidate,
        confidence,
        kind: PredictionKind::History,
    })
}

pub fn warm_up() {
    let _ = scripts::completion_catalog();
    let _ = utils::path_command_names();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_modal_help_commands_and_examples() {
        let help_text = r#"
Usage: modal [OPTIONS] COMMAND [ARGS]...

╭─ Commands ──────────────────────────────────────────────────────────────────╮
│ deploy        Deploy a Modal application.                                    │
│ run           Run a Modal function or local entrypoint.                     │
│ serve         Run a web endpoint(s) associated with a Modal app and         │
│               hot-reload code.                                              │
╰──────────────────────────────────────────────────────────────────────────────╯

Examples:

``` modal run my_app.py::hello_world ```
``` modal run -m my_project.my_app ```
"#;

        let mut metadata = ScopeMetadata::default();
        help::merge_help_output(&CommandScope::root("modal"), &mut metadata, help_text);

        assert!(metadata.command_templates.contains("modal deploy"));
        assert!(metadata.command_templates.contains("modal run"));
        assert!(metadata
            .examples
            .contains("modal run my_app.py::hello_world"));
        assert!(metadata.examples.contains("modal run -m my_project.my_app"));
    }

    #[test]
    fn parses_python_help_option_templates() {
        let help_text = r#"
usage: python3 [option] ... [-c cmd | -m mod | file | -] [arg] ...
Options and arguments (and corresponding environment variables):
-c cmd : program passed in as string (terminates option list)
-m mod : run library module as a script (terminates option list)
"#;

        let mut metadata = ScopeMetadata::default();
        help::merge_help_output(&CommandScope::root("python3"), &mut metadata, help_text);

        assert!(metadata.command_templates.contains("python3 -c "));
        assert!(metadata.command_templates.contains("python3 -m "));
        assert!(metadata.path_after_scope);
    }

    #[test]
    fn ignores_python_help_environment_variable_prose() {
        let help_text = r#"
usage: python3 [option] ... [-c cmd | -m mod | file | -] [arg] ...
Options and arguments (and corresponding environment variables):
-c cmd : program passed in as string (terminates option list)
-m mod : run library module as a script (terminates option list)

Other environment variables:
PYTHONHASHSEED: if this variable is set to 'random', a random value is used
   to seed the hashes of str and bytes objects. It can also be set to an
   integer in the range [0,4294967295] to get hash values with a predictable seed.
"#;

        let mut metadata = ScopeMetadata::default();
        help::merge_help_output(&CommandScope::root("python3"), &mut metadata, help_text);

        assert!(metadata.command_templates.contains("python3 -c "));
        assert!(metadata.command_templates.contains("python3 -m "));
        assert!(metadata
            .command_templates
            .iter()
            .all(|candidate| !candidate.contains("seed the hashes")));
        assert!(metadata.examples.is_empty());
    }

    #[test]
    fn cobra_completion_protocol_returns_fragments() {
        if !utils::command_exists_in_path("gh") {
            return;
        }

        let fragments = protocols::run_cobra_completion("gh", "gh p", &["gh", "p"]);
        assert!(fragments.iter().any(|fragment| fragment == "pr"));
        assert!(fragments.iter().any(|fragment| fragment == "preview"));
    }

    #[test]
    fn argcomplete_completion_protocol_returns_fragments() {
        if !utils::command_exists_in_path("pipx") {
            return;
        }

        let fragments = protocols::run_argcomplete_completion("pipx", "pipx i", &["pipx", "i"]);
        assert!(fragments.iter().any(|fragment| fragment == "install"));
        assert!(fragments.iter().any(|fragment| fragment == "interpreter"));
    }

    #[test]
    fn pip_auto_complete_protocol_supports_python_module_invocation() {
        if !utils::command_exists_in_path("python3") {
            return;
        }

        let fragments = protocols::run_python_pip_completion(
            "python3 -m pip i",
            &["python3", "-m", "pip", "i"],
        )
        .expect("pip completion should be available");

        assert!(fragments.iter().any(|fragment| fragment == "install"));
        assert!(fragments.iter().any(|fragment| fragment == "index"));
    }

    #[test]
    fn command_argument_path_detection_uses_registry_hints() {
        let tokens = ["modal", "run", "modal_training.py"];
        assert!(command_argument_expects_path(&tokens, 2));
    }

    #[test]
    fn parses_zsh_fish_and_bash_completion_command_names() {
        let zsh = r#"
#compdef gh
compdef _gh gh
"#;
        let fish = r#"
function __gh_perform_completion
    complete -c gh -a "pr preview project"
end
"#;
        let bash = r#"
complete -o default -F _python_argcomplete pipx
"#;

        let zsh_parsed = scripts::parse_completion_script(Path::new("_gh"), zsh);
        let fish_parsed = scripts::parse_completion_script(Path::new("gh.fish"), fish);
        let bash_parsed = scripts::parse_completion_script(Path::new("pipx"), bash);

        assert!(zsh_parsed.command_names.contains("gh"));
        assert!(fish_parsed.command_names.contains("gh"));
        assert!(bash_parsed.command_names.contains("pipx"));
        assert!(fish_parsed.metadata.subcommands.contains("pr"));
        assert!(fish_parsed.metadata.subcommands.contains("preview"));
    }

    #[test]
    fn parses_zsh_compdef_patterns_and_aliases() {
        let zsh = r#"
#compdef -P python[0-9.]#
#compdef gpg gpgv gpg2=gpg
"#;

        let parsed = scripts::parse_completion_script(Path::new("_python"), zsh);
        if utils::command_exists_in_path("python3") {
            assert!(parsed.command_names.contains("python3"));
        }
        assert!(parsed.command_names.contains("gpg"));
        assert!(parsed.command_names.contains("gpgv"));
        assert!(parsed.command_names.contains("gpg2"));
    }

    #[test]
    fn shell_tokenizer_keeps_quoted_completion_arguments_intact() {
        let tokens = scripts::shell_split_words(r#"complete -W "install inject" pipx"#);
        assert_eq!(tokens, vec!["complete", "-W", "install inject", "pipx"]);
    }
}
