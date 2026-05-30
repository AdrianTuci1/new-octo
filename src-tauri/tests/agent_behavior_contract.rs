use octomus_launcher_prototype::ai::agent::runtime::{
    AgentLoopRuntime, EVENT_AWAIT_USER_APPROVAL, EVENT_CAPTURE_TOOL_RESULT, EVENT_DISPATCH_TOOL,
    EVENT_PREPARE_CONTEXT, EVENT_SKIP_PLANNING,
};
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
    expected_stage_after_dispatch: Option<String>,
    expected_stage_after_result: Option<String>,
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

fn tool_selection_runtime() -> AgentLoopRuntime {
    let mut runtime = AgentLoopRuntime::new();
    runtime
        .apply_event(EVENT_PREPARE_CONTEXT)
        .expect("preparing -> reasoning should be valid");
    runtime
        .apply_event(EVENT_SKIP_PLANNING)
        .expect("reasoning -> tool-selection should be valid");
    runtime
}

fn simulate_dispatch(runtime: &mut AgentLoopRuntime, scenario: &BehaviorScenario) {
    if scenario.requires_approval {
        runtime
            .apply_event(EVENT_AWAIT_USER_APPROVAL)
            .expect("tool-selection -> awaiting-approval should be valid");
    } else if scenario.requires_external_result {
        runtime
            .apply_event(EVENT_DISPATCH_TOOL)
            .expect("tool-selection -> executing should be valid");
    }
}

#[test]
fn behavior_scenarios_match_contract_rules() {
    let scenarios = load_behavior_scenarios();
    assert!(
        !scenarios.is_empty(),
        "behavior fixture set should contain at least one scenario"
    );

    for scenario in scenarios {
        let mut runtime = tool_selection_runtime();

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

        simulate_dispatch(&mut runtime, &scenario);

        if let Some(expected_stage) = &scenario.expected_stage_after_dispatch {
            assert_eq!(
                runtime.current_stage_id(),
                expected_stage,
                "scenario `{}` landed in unexpected stage after dispatch",
                scenario.id
            );
        }

        if let Some(expected_stage) = &scenario.expected_stage_after_result {
            runtime
                .apply_event(EVENT_CAPTURE_TOOL_RESULT)
                .expect("executing -> verifying should be valid");
            assert_eq!(
                runtime.current_stage_id(),
                expected_stage,
                "scenario `{}` landed in unexpected stage after result",
                scenario.id
            );
        }
    }
}

#[test]
fn mcp_scenario_is_allowed_during_verifying_too() {
    let runtime =
        AgentLoopRuntime::resume("verifying").expect("verifying stage should exist in contract");

    assert!(runtime.allows_tool("mcp__github__search"));
}
