use octomus_launcher_prototype::ai::agent::runtime::AgentLoopRuntime;
use serde::Deserialize;
use std::{fs, path::PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BehaviorScenario {
    id: String,
    prompt: String,
    expected_tool: String,
    requires_approval: bool,
    requires_external_result: bool,
}

fn load_behavior_scenarios() -> Vec<BehaviorScenario> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("agent_behavior")
        .join("scenarios.json");
    let contents = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    serde_json::from_str(&contents)
        .unwrap_or_else(|error| panic!("failed to parse {}: {error}", path.display()))
}

#[test]
fn behavior_scenarios_match_tool_policies() {
    let scenarios = load_behavior_scenarios();
    assert!(
        !scenarios.is_empty(),
        "behavior fixture set should contain at least one scenario"
    );

    let runtime = AgentLoopRuntime::new();

    for scenario in scenarios {
        assert!(
            runtime.allows_tool(&scenario.expected_tool),
            "scenario `{}` expected tool `{}` to be allowed for prompt `{}`",
            scenario.id,
            scenario.expected_tool,
            scenario.prompt
        );
        assert_eq!(
            runtime.tool_requires_approval(&scenario.expected_tool),
            scenario.requires_approval,
            "scenario `{}` has mismatched approval policy",
            scenario.id
        );
        assert_eq!(
            runtime.tool_requires_external_result(&scenario.expected_tool),
            scenario.requires_external_result,
            "scenario `{}` has mismatched external-result policy",
            scenario.id
        );
    }
}

#[test]
fn all_mcp_tools_are_always_allowed() {
    let runtime = AgentLoopRuntime::new();

    assert!(runtime.allows_tool("mcp__github__search"));
    assert!(runtime.allows_tool("mcp__unknown__tool"));
}
