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
        path: "src/lib.rs",
        contents:
            "pub fn greet_user(name: &str) -> String {\n    format!(\"Hello, {}!\", name)\n}\n",
    },
    EvalWorkspaceFile {
        path: "tests/lib_smoke.rs",
        contents:
            "#[test]\nfn greet_user_smoke() {\n    assert_eq!(launcher::greet_user(\"Octo\"), \"Hello, Octo!\");\n}\n",
    },
];

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
        id: "multi-file-edit",
        description: "The agent should propose a multi-file change instead of dumping code inline.",
        prompt: "Creează `format_name`, folosește-l în `greet_user` și adaugă un test nou, fără dependențe noi. Nu propune comenzi de terminal; folosește direct un diff de fișiere.",
        goal: "The user should end up with a concrete multi-file change proposal for `format_name` without introducing new dependencies.",
        workspace_files: MULTI_FILE_EDIT_WORKSPACE_FILES,
        skill_fixtures: &[],
        required_tools: &["propose_file_change"],
        forbidden_tools: &["lookup_web", "propose_terminal_command"],
        final_answer_must_contain: &["format_name"],
        changed_files_must_include: &["src/lib.rs"],
        minimum_changed_files: 2,
        expected_cloud_provider: None,
        judge_rubric: "Pass only if the agent proposes a native file-change tool call that edits more than one file, adds `format_name` without new dependencies, and the final answer reflects the applied change.",
        user_simulator_rubric: "If the assistant already proposed a multi-file diff for a tiny API plus a feature and explicitly avoided new dependencies, stop. Otherwise ask for the missing concrete edit or test coverage in one short sentence.",
        max_user_turns: 2,
        max_harness_turns_per_user: 5,
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
