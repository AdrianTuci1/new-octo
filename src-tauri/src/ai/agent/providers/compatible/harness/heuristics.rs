use crate::ai::agent::harness::AgentHarnessContext;

pub(super) fn command_is_low_risk_terminal_inspection(command: &str) -> bool {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return false;
    }

    if trimmed.contains('\n')
        || trimmed.contains("&&")
        || trimmed.contains("||")
        || trimmed.contains(';')
        || trimmed.contains('|')
        || trimmed.contains('>')
        || trimmed.contains('<')
    {
        return false;
    }

    let command_name = trimmed
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_lowercase();

    matches!(
        command_name.as_str(),
        "pwd"
            | "ls"
            | "ll"
            | "la"
            | "tree"
            | "find"
            | "rg"
            | "grep"
            | "fd"
            | "which"
            | "whereis"
            | "file"
            | "stat"
            | "head"
            | "tail"
            | "cat"
            | "sed"
            | "awk"
            | "git"
            | "node"
            | "python"
            | "python3"
            | "go"
            | "cargo"
            | "npm"
            | "pnpm"
            | "yarn"
            | "bun"
    ) && read_only_command_looks_safe(trimmed, &command_name)
}

fn read_only_command_looks_safe(command: &str, command_name: &str) -> bool {
    let normalized = command.to_lowercase();
    let destructive_tokens = [
        " rm ",
        " mv ",
        " cp ",
        " chmod ",
        " chown ",
        " sudo ",
        " install ",
        " add ",
        " commit ",
        " push ",
        " pull ",
        " write",
        "save",
        "delete",
        "remove",
        "touch ",
        "mkdir ",
    ];

    if destructive_tokens
        .iter()
        .any(|token| normalized.contains(token) || normalized.starts_with(token.trim()))
    {
        return false;
    }

    match command_name {
        "git" => {
            normalized.starts_with("git status")
                || normalized.starts_with("git diff")
                || normalized.starts_with("git log")
                || normalized.starts_with("git show")
                || normalized.starts_with("git branch")
                || normalized.starts_with("git rev-parse")
        }
        "cargo" => {
            normalized == "cargo test"
                || normalized.starts_with("cargo test ")
                || normalized == "cargo check"
                || normalized.starts_with("cargo check ")
                || normalized == "cargo fmt"
                || normalized.starts_with("cargo fmt ")
                || normalized == "cargo clippy"
                || normalized.starts_with("cargo clippy ")
        }
        "npm" | "pnpm" | "yarn" | "bun" => {
            normalized.ends_with(" test")
                || normalized.contains(" test ")
                || normalized.ends_with(" lint")
                || normalized.contains(" lint ")
                || normalized.ends_with(" typecheck")
                || normalized.contains(" typecheck ")
                || normalized.ends_with(" run build")
                || normalized.contains(" run build ")
        }
        "node" | "python" | "python3" | "go" => {
            normalized.contains(" --help")
                || normalized.contains(" -h")
                || normalized.ends_with(" --version")
                || normalized.ends_with(" version")
        }
        _ => true,
    }
}

pub(super) fn is_continuation_prompt(prompt: &str) -> bool {
    let normalized = prompt
        .to_lowercase()
        .replace(['.', '!', '?'], "")
        .trim()
        .to_string();
    matches!(
        normalized.as_str(),
        "continua"
            | "continuă"
            | "continue"
            | "go on"
            | "mai departe"
            | "next"
            | "ok continua"
            | "ok continuă"
            | "da continua"
            | "da continuă"
    )
}

pub(super) fn guardian_intent_context(context: &AgentHarnessContext) -> String {
    let mut parts = vec![format!("Prompt curent: {}", context.prompt)];

    let recent_messages = context
        .messages
        .iter()
        .rev()
        .take(6)
        .filter(|message| !message.content.trim().is_empty())
        .map(|message| {
            format!(
                "{}: {}",
                message.role,
                truncate_for_guardian(&message.content, 700)
            )
        })
        .collect::<Vec<_>>();

    if !recent_messages.is_empty() {
        parts.push(format!(
            "Context conversație recentă:\n{}",
            recent_messages
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    let recent_terminal = context
        .terminal_blocks
        .iter()
        .rev()
        .take(3)
        .map(|block| {
            format!(
                "command={} exit={:?} output={}",
                block.command,
                block.exit_code,
                truncate_for_guardian(&block.output, 500)
            )
        })
        .collect::<Vec<_>>();

    if !recent_terminal.is_empty() {
        parts.push(format!(
            "Context terminal recent:\n{}",
            recent_terminal
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    parts.join("\n\n")
}

fn truncate_for_guardian(value: &str, max_chars: usize) -> String {
    let normalized = value.replace('\n', " ");
    let mut chars = normalized.chars();
    let clipped = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        format!("{clipped}...")
    } else {
        clipped
    }
}

pub(super) fn prompt_supports_plan(prompt: &str) -> bool {
    let prompt = prompt.to_lowercase();
    let plan_keywords = [
        "implement",
        "implementation",
        "debug",
        "debugging",
        "fix",
        "bug",
        "refactor",
        "migrate",
        "migration",
        "architecture",
        "architectură",
        "arhitectură",
        "research",
        "investigate",
        "investiga",
        "task",
        "project",
        "feature",
        "roadmap",
        "plan",
        "workstream",
        "steps",
        "paș",
        "pas",
        "cerinț",
        "cerint",
        "specifica",
        "specification",
    ];

    plan_keywords.iter().any(|keyword| prompt.contains(keyword))
}

pub(super) fn prompt_requests_file_change(prompt: &str) -> bool {
    let prompt = prompt.to_lowercase();
    let creation_keywords = [
        "create",
        "creeaza",
        "creează",
        "generate",
        "genereaza",
        "generează",
        "write",
        "scrie",
        "implement",
        "build",
        "fa ",
        "fă ",
    ];
    let file_targets = [
        "file",
        "fișier",
        "fisier",
        "script",
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".rs",
        ".go",
        ".java",
        ".json",
        "python",
        "component",
        "module",
        "functie",
        "funcție",
        "generator",
        "class",
    ];

    creation_keywords
        .iter()
        .any(|keyword| prompt.contains(keyword))
        && file_targets.iter().any(|keyword| prompt.contains(keyword))
}

pub(super) fn response_looks_like_inline_code(visible_response: &str) -> bool {
    let normalized = visible_response.trim_start();
    normalized.contains("```")
        || normalized.starts_with("def ")
        || normalized.starts_with("class ")
        || normalized.starts_with("function ")
        || normalized.starts_with("const ")
        || normalized.starts_with("let ")
        || normalized.starts_with("import ")
}

#[allow(dead_code)]
pub(super) fn should_retry_follow_up_only(
    visible_response: &str,
    emitted_follow_up_tool_call: bool,
    forced_follow_up_retry_used: bool,
) -> bool {
    visible_response.is_empty() && emitted_follow_up_tool_call && !forced_follow_up_retry_used
}

#[allow(dead_code)]
pub(super) fn should_retry_file_change_duplicate_code(
    visible_response: &str,
    emitted_file_change_tool_call: bool,
    forced_file_change_cleanup_retry_used: bool,
) -> bool {
    emitted_file_change_tool_call
        && response_looks_like_inline_code(visible_response)
        && !forced_file_change_cleanup_retry_used
}

#[allow(dead_code)]
pub(super) fn is_pseudo_plan_response(visible_response: &str) -> bool {
    visible_response
        .trim_start()
        .to_lowercase()
        .starts_with("propose_plan{")
}

#[allow(dead_code)]
pub(super) fn response_claims_workspace_not_found(visible_response: &str) -> bool {
    let normalized = visible_response.to_lowercase();
    (normalized.contains("nu am găsit")
        || normalized.contains("n-am găsit")
        || normalized.contains("didn't find")
        || normalized.contains("did not find")
        || normalized.contains("not found"))
        && (normalized.contains("fișier")
            || normalized.contains("fisier")
            || normalized.contains("folder")
            || normalized.contains("director")
            || normalized.contains("project")
            || normalized.contains("proiect"))
}

#[allow(dead_code)]
pub(super) fn response_rehashes_workspace_process(visible_response: &str) -> bool {
    let normalized = visible_response.to_lowercase();
    normalized.contains("îmi pare rău")
        || normalized.contains("imi pare rau")
        || normalized.contains("am încercat")
        || normalized.contains("am incercat")
        || normalized.contains("voi începe")
        || normalized.contains("voi incepe")
        || normalized.contains("trebuie să identific")
        || normalized.contains("trebuie sa identific")
        || normalized.contains("deoarece sunt în folderul personal")
        || normalized.contains("deoarece sunt in folderul personal")
}
