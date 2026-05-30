use std::collections::HashSet;

use super::runner::EvalRunResult;
use super::scenarios::EvalScenario;

pub(super) fn assert_eval_result(
    scenario: &EvalScenario,
    result: &EvalRunResult,
) -> Result<(), String> {
    let tool_names = result
        .tool_calls
        .iter()
        .map(|tool_call| tool_call.name.as_str())
        .collect::<Vec<_>>();
    let tool_name_set = tool_names.iter().copied().collect::<HashSet<_>>();

    for required_tool in scenario.required_tools {
        if !tool_name_set.contains(required_tool) {
            return Err(format!(
                "Scenario '{}' expected tool `{}` but observed tools were: {}",
                scenario.id,
                required_tool,
                tool_names.join(", ")
            ));
        }
    }

    for forbidden_tool in scenario.forbidden_tools {
        if tool_name_set.contains(forbidden_tool) {
            return Err(format!(
                "Scenario '{}' forbids tool `{}` but it was used.",
                scenario.id, forbidden_tool
            ));
        }
    }

    for snippet in scenario.final_answer_must_contain {
        if !result.final_answer.contains(snippet) {
            return Err(format!(
                "Scenario '{}' expected final answer to contain {:?}, but it was: {}",
                scenario.id, snippet, result.final_answer
            ));
        }
    }

    if scenario.minimum_changed_files > 0
        && result.changed_files.len() < scenario.minimum_changed_files
    {
        return Err(format!(
            "Scenario '{}' expected at least {} changed files, but saw {}.",
            scenario.id,
            scenario.minimum_changed_files,
            result.changed_files.len()
        ));
    }

    for expected_file in scenario.changed_files_must_include {
        if !result.changed_files.iter().any(|path| path == expected_file) {
            return Err(format!(
                "Scenario '{}' expected changed file `{}` but changed files were: {}",
                scenario.id,
                expected_file,
                result.changed_files.join(", ")
            ));
        }
    }

    if let Some(provider) = scenario.expected_cloud_provider {
        let launched = result
            .tool_calls
            .iter()
            .find(|tool_call| tool_call.name == "launch_cloud_agent")
            .and_then(|tool_call| tool_call.args.get("provider"))
            .and_then(|value| value.as_str());
        if launched != Some(provider) {
            return Err(format!(
                "Scenario '{}' expected cloud provider `{}` but saw {:?}.",
                scenario.id, provider, launched
            ));
        }
    }

    Ok(())
}

