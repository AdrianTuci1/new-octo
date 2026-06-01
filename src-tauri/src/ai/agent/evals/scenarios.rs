pub(super) struct EvalWorkspaceFile {
    pub(super) path: &'static str,
    pub(super) contents: &'static str,
}

pub(super) struct EvalSkillFixture {
    pub(super) name: &'static str,
    pub(super) description: &'static str,
    pub(super) instructions: &'static str,
}

pub(super) struct EvalScenario {
    pub(super) id: &'static str,
    pub(super) description: &'static str,
    pub(super) prompt: &'static str,
    pub(super) goal: &'static str,
    pub(super) workspace_files: &'static [EvalWorkspaceFile],
    pub(super) skill_fixtures: &'static [EvalSkillFixture],
    pub(super) required_tools: &'static [&'static str],
    pub(super) forbidden_tools: &'static [&'static str],
    pub(super) final_answer_must_contain: &'static [&'static str],
    pub(super) changed_files_must_include: &'static [&'static str],
    pub(super) minimum_changed_files: usize,
    pub(super) expected_cloud_provider: Option<&'static str>,
    pub(super) judge_rubric: &'static str,
    pub(super) user_simulator_rubric: &'static str,
    pub(super) max_user_turns: usize,
    pub(super) max_harness_turns_per_user: usize,
}

const SEARCH_WORKSPACE_FILES: &[EvalWorkspaceFile] = &[
    EvalWorkspaceFile {
        path: "src/lib.rs",
        contents:
            "pub fn greet_user(name: &str) -> String {\n    format!(\"Hello, {}!\", name)\n}\n",
    },
    EvalWorkspaceFile {
        path: "src/main.rs",
        contents: "fn main() {\n    println!(\"{}\", crate::greet_user(\"Octo\"));\n}\n",
    },
];

const MULTI_FILE_EDIT_WORKSPACE_FILES: &[EvalWorkspaceFile] = &[
    EvalWorkspaceFile {
        path: "Cargo.toml",
        contents:
            "[package]\nname = \"launcher\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
    },
    EvalWorkspaceFile {
        path: "src/lib.rs",
        contents:
            "pub fn greet_user(name: &str) -> String {\n    format!(\"Hello, {}!\", name)\n}\n",
    },
    EvalWorkspaceFile {
        path: "src/main.rs",
        contents: "fn main() {\n    println!(\"{}\", launcher::greet_user(\"Octo\"));\n}\n",
    },
    EvalWorkspaceFile {
        path: "tests/lib_smoke.rs",
        contents:
            "#[test]\nfn greet_user_smoke() {\n    assert_eq!(launcher::greet_user(\"Octo\"), \"Hello, Octo!\");\n}\n",
    },
];

const API_IMPLEMENT_AND_VERIFY_WORKSPACE_FILES: &[EvalWorkspaceFile] = &[
    EvalWorkspaceFile {
        path: "Cargo.toml",
        contents:
            "[package]\nname = \"launcher\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
    },
    EvalWorkspaceFile {
        path: "src/lib.rs",
        contents: "pub fn greet() -> &'static str {\n    \"hello\"\n}\n",
    },
    EvalWorkspaceFile {
        path: "tests/greet_smoke.rs",
        contents:
            "#[test]\nfn greet_smoke() {\n    assert_eq!(launcher::greet(), \"hello\");\n}\n",
    },
];

const CREATE_FILE_WORKSPACE_FILES: &[EvalWorkspaceFile] = &[EvalWorkspaceFile {
    path: "README.md",
    contents: "# Harness eval workspace\n",
}];

const SKILL_WORKSPACE_FILES: &[EvalWorkspaceFile] = &[
    EvalWorkspaceFile {
        path: "src/feature.rs",
        contents: "pub fn skill_target() -> &'static str {\n    \"skill-path\"\n}\n",
    },
    EvalWorkspaceFile {
        path: "src/lib.rs",
        contents: "mod feature;\npub use feature::skill_target;\n",
    },
];

const CLOUD_WORKSPACE_FILES: &[EvalWorkspaceFile] = &[EvalWorkspaceFile {
    path: "README.md",
    contents: "# Cloud agent eval workspace\n",
}];

const TERMINAL_WORKSPACE_FILES: &[EvalWorkspaceFile] = &[EvalWorkspaceFile {
    path: "README.md",
    contents: "# Terminal eval workspace\n",
}];

const WEB_WORKSPACE_FILES: &[EvalWorkspaceFile] = &[EvalWorkspaceFile {
    path: "README.md",
    contents: "# Web eval workspace\n",
}];

const PLANNING_WORKSPACE_FILES: &[EvalWorkspaceFile] = &[EvalWorkspaceFile {
    path: "src/auth.rs",
    contents: "pub fn validate_session(token: &str) -> bool {\n    !token.trim().is_empty()\n}\n",
}];

const LOCATOR_SKILLS: &[EvalSkillFixture] = &[EvalSkillFixture {
    name: "deep-locator-eval",
    description: "For code location tasks, first explore the workspace, then read the most relevant file, and cite the exact path in the answer.",
    instructions: "When this skill is invoked for a code-location question, you must first use `explore_workspace`, then `read_workspace_file`, and the final answer must cite the file path you inspected.",
}];

pub(super) const LIVE_EVAL_SCENARIOS: &[EvalScenario] = &[
    EvalScenario {
        id: "workspace-search-read",
        description: "The agent should search the workspace, read the defining file, and explain the result.",
        prompt: "Găsește unde este definit `greet_user` și spune pe scurt cum funcționează.",
        goal: "The user should leave the conversation knowing exactly where `greet_user` is defined and what it does.",
        workspace_files: SEARCH_WORKSPACE_FILES,
        skill_fixtures: &[],
        required_tools: &["explore_workspace", "read_workspace_file"],
        forbidden_tools: &["lookup_web", "launch_cloud_agent"],
        final_answer_must_contain: &["greet_user", "src/lib.rs"],
        changed_files_must_include: &[],
        minimum_changed_files: 0,
        expected_cloud_provider: None,
        judge_rubric: "Pass only if the agent searched locally, inspected the file content, and answered with the correct file path and a brief explanation.",
        user_simulator_rubric: "If the assistant already gives the exact file path and a concise explanation, stop. Otherwise ask one short follow-up that narrows toward the exact location or behavior.",
        max_user_turns: 2,
        max_harness_turns_per_user: 4,
    },
    EvalScenario {
        id: "terminal-inspection",
        description: "The agent should use a local terminal inspection and then interpret the result.",
        prompt: "Verifică dacă Python 3 este instalat local și răspunde foarte concis.",
        goal: "The user should know whether Python 3 is installed locally and what version was detected.",
        workspace_files: TERMINAL_WORKSPACE_FILES,
        skill_fixtures: &[],
        required_tools: &["propose_terminal_command"],
        forbidden_tools: &["lookup_web", "launch_cloud_agent"],
        final_answer_must_contain: &["Python"],
        changed_files_must_include: &[],
        minimum_changed_files: 0,
        expected_cloud_provider: None,
        judge_rubric: "Pass only if the agent uses propose_terminal_command for a local runtime check, resumes after the tool result, and answers with the Python finding instead of stalling.",
        user_simulator_rubric: "If the assistant already states whether Python is installed locally and mentions the result clearly, stop. Otherwise ask for the missing local runtime conclusion in one short sentence.",
        max_user_turns: 2,
        max_harness_turns_per_user: 4,
    },
    EvalScenario {
        id: "multi-file-edit",
        description: "The agent should propose a multi-file change instead of dumping code inline.",
        prompt: "Creează `format_name` în `src/lib.rs`, folosește-l în `greet_user` și actualizează explicit `tests/lib_smoke.rs` cu un test nou pentru formatare, fără dependențe noi. Nu pune testul în `src/lib.rs`, nu propune comenzi de terminal și continuă până finalizezi ambele fișiere prin diff-uri locale.",
        goal: "The user should end up with a concrete multi-file change proposal for `format_name` without introducing new dependencies.",
        workspace_files: MULTI_FILE_EDIT_WORKSPACE_FILES,
        skill_fixtures: &[],
        required_tools: &["propose_file_change"],
        forbidden_tools: &["lookup_web", "propose_terminal_command"],
        final_answer_must_contain: &["format_name", "tests/lib_smoke.rs"],
        changed_files_must_include: &["src/lib.rs", "tests/lib_smoke.rs"],
        minimum_changed_files: 2,
        expected_cloud_provider: None,
        judge_rubric: "Pass only if the agent proposes native file changes that touch both `src/lib.rs` and `tests/lib_smoke.rs`, adds `format_name` without new dependencies, and the final answer reflects the applied change.",
        user_simulator_rubric: "If the assistant already updated both the source file and the dedicated test file without adding dependencies, stop. Otherwise ask for the missing file-specific edit in one short sentence.",
        max_user_turns: 2,
        max_harness_turns_per_user: 8,
    },
    EvalScenario {
        id: "single-file-create",
        description: "The agent should create a new file through propose_file_change for a simple creation task.",
        prompt: "Creează fișierul `notes/hello.txt` cu textul `salut din harness` și confirmă pe scurt.",
        goal: "The user should receive a concrete file-creation proposal for notes/hello.txt with the requested contents.",
        workspace_files: CREATE_FILE_WORKSPACE_FILES,
        skill_fixtures: &[],
        required_tools: &["propose_file_change"],
        forbidden_tools: &["lookup_web", "propose_terminal_command"],
        final_answer_must_contain: &["notes/hello.txt"],
        changed_files_must_include: &["notes/hello.txt"],
        minimum_changed_files: 1,
        expected_cloud_provider: None,
        judge_rubric: "Pass only if the agent uses propose_file_change to create notes/hello.txt with the requested text and then confirms the change succinctly.",
        user_simulator_rubric: "If the assistant already proposed the new file with the requested contents and confirms it clearly, stop. Otherwise ask for the missing file creation directly.",
        max_user_turns: 2,
        max_harness_turns_per_user: 4,
    },
    EvalScenario {
        id: "implement-api-and-verify",
        description: "The agent should edit files first, then continue with a terminal verification step before answering.",
        prompt: "Implementează `ping()` în `src/lib.rs` ca să întoarcă `pong`, actualizează explicit `tests/greet_smoke.rs` ca să testeze `ping()`, apoi verifică printr-o comandă locală că testele trec. Nu muta testul în `src/lib.rs`. Rezolvă cap-coadă fără să te oprești după primul pas.",
        goal: "The user should receive a concrete file change, a follow-up local verification command, and a final answer that confirms the simple API plus the verification result.",
        workspace_files: API_IMPLEMENT_AND_VERIFY_WORKSPACE_FILES,
        skill_fixtures: &[],
        required_tools: &["propose_file_change", "propose_terminal_command"],
        forbidden_tools: &["lookup_web", "launch_cloud_agent"],
        final_answer_must_contain: &["ping", "pong", "test"],
        changed_files_must_include: &["src/lib.rs", "tests/greet_smoke.rs"],
        minimum_changed_files: 2,
        expected_cloud_provider: None,
        judge_rubric: "Pass only if the agent edits both `src/lib.rs` and `tests/greet_smoke.rs`, then continues with a local verification command, and only then gives a final answer grounded in that verification instead of stopping after the diff.",
        user_simulator_rubric: "If the assistant already updated the source file plus the dedicated test file, verified the result with a local command, and summarized the outcome, stop. Otherwise ask for the missing next execution step in one short sentence.",
        max_user_turns: 2,
        max_harness_turns_per_user: 12,
    },
    EvalScenario {
        id: "skill-assisted-search",
        description: "The agent should honor an invoked skill while solving a workspace search task.",
        prompt: "@deep-locator-eval Găsește unde este definit `skill_target` și rezumă răspunsul în două propoziții.",
        goal: "The user should receive the exact path for `skill_target` plus a short explanation, with the invoked skill clearly influencing the search behavior.",
        workspace_files: SKILL_WORKSPACE_FILES,
        skill_fixtures: LOCATOR_SKILLS,
        required_tools: &["explore_workspace", "read_workspace_file"],
        forbidden_tools: &["lookup_web"],
        final_answer_must_contain: &["skill_target", "src/feature.rs"],
        changed_files_must_include: &[],
        minimum_changed_files: 0,
        expected_cloud_provider: None,
        judge_rubric: "Pass only if the invoked skill changes behavior in the expected direction: local search first, file read second, and an answer that cites the file path.",
        user_simulator_rubric: "If the assistant cites the file path and stays consistent with the skill-driven search flow, stop. Otherwise ask a short follow-up that pushes for the exact location.",
        max_user_turns: 2,
        max_harness_turns_per_user: 4,
    },
    EvalScenario {
        id: "web-search-summary",
        description: "The agent should use web search for fresh public information and summarize it.",
        prompt: "Caută pe web noutăți recente despre Rust 1.90 și rezumă-le în două propoziții.",
        goal: "The user should receive a short summary of fresh public information about Rust 1.90.",
        workspace_files: WEB_WORKSPACE_FILES,
        skill_fixtures: &[],
        required_tools: &["lookup_web"],
        forbidden_tools: &["propose_terminal_command", "launch_cloud_agent"],
        final_answer_must_contain: &["Rust"],
        changed_files_must_include: &[],
        minimum_changed_files: 0,
        expected_cloud_provider: None,
        judge_rubric: "Pass only if the agent chooses lookup_web for freshness-sensitive public information and produces a short summary grounded in the returned results.",
        user_simulator_rubric: "If the assistant already gives a short fresh-news summary about Rust 1.90, stop. Otherwise ask for the missing summary in one short sentence.",
        max_user_turns: 2,
        max_harness_turns_per_user: 4,
    },
    EvalScenario {
        id: "visible-plan",
        description: "The agent should create a visible plan artifact for a clearly multi-step request.",
        prompt: "Planifică vizibil și structurat investigarea bugurilor din harness, fără să execuți încă nimic.",
        goal: "The user should receive a visible, structured investigation plan for the harness.",
        workspace_files: PLANNING_WORKSPACE_FILES,
        skill_fixtures: &[],
        required_tools: &["propose_plan"],
        forbidden_tools: &["lookup_web", "propose_terminal_command", "launch_cloud_agent"],
        final_answer_must_contain: &["plan"],
        changed_files_must_include: &[],
        minimum_changed_files: 0,
        expected_cloud_provider: None,
        judge_rubric: "Pass only if the agent creates a visible plan artifact for the harness investigation and responds without drifting into execution.",
        user_simulator_rubric: "If the assistant already presented a clear structured plan for investigating the harness and did not start execution, stop. Otherwise ask for the missing visible plan.",
        max_user_turns: 2,
        max_harness_turns_per_user: 4,
    },
    EvalScenario {
        id: "cloud-agent-launch",
        description: "The agent should delegate explicit cloud work through the cloud-launch tool.",
        prompt: "Rulează asta în cloud pe Modal și pornește imediat un agent care să investigheze bugul din repo. Nu face planuri intermediare și nu propune comenzi de terminal; lansează direct `launch_cloud_agent`.",
        goal: "The user should see the agent explicitly delegate the task to a Modal cloud run.",
        workspace_files: CLOUD_WORKSPACE_FILES,
        skill_fixtures: &[],
        required_tools: &["launch_cloud_agent"],
        forbidden_tools: &["lookup_web", "propose_terminal_command"],
        final_answer_must_contain: &["cloud"],
        changed_files_must_include: &[],
        minimum_changed_files: 0,
        expected_cloud_provider: Some("modal"),
        judge_rubric: "Pass only if the agent chooses launch_cloud_agent with the modal provider and explains the delegation clearly.",
        user_simulator_rubric: "If the assistant already delegated clearly to Modal, stop. Otherwise ask one short follow-up asking it to actually launch the cloud run.",
        max_user_turns: 2,
        max_harness_turns_per_user: 3,
    },
];
