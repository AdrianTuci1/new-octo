use octomus_launcher_prototype::ai::agent::skills::{
    list_available_skills, load_skills_instructions,
};
use serde::Deserialize;
use std::{fs, path::PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillScenario {
    id: String,
    prompt: String,
    expected_skill_folder: String,
    should_load: bool,
}

fn load_skill_scenarios() -> Vec<SkillScenario> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("skills")
        .join("scenarios.json");
    let contents = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    serde_json::from_str(&contents)
        .unwrap_or_else(|error| panic!("failed to parse {}: {error}", path.display()))
}

#[test]
fn required_skills_are_present_in_catalog() {
    let catalog = list_available_skills();
    let required_folders = [
        "create-skill",
        "create-environment",
        "add-mcp-server",
        "octo-platform",
    ];

    for folder in required_folders {
        assert!(
            catalog.iter().any(|item| item.path.ends_with(folder)),
            "expected `{folder}` to be discoverable in the skill catalog"
        );
    }
}

#[test]
fn skill_prompts_load_expected_instructions() {
    let scenarios = load_skill_scenarios();
    assert!(
        !scenarios.is_empty(),
        "skills fixture set should contain at least one scenario"
    );

    for scenario in scenarios {
        let instructions = load_skills_instructions(&scenario.prompt, &[]);
        let expected_marker = format!(
            "--- INSTRUCTIUNI SKILL PENTRU {} ---",
            scenario.expected_skill_folder.to_uppercase()
        );

        if scenario.should_load {
            assert!(
                !instructions.trim().is_empty(),
                "scenario `{}` should load skill instructions",
                scenario.id
            );
            assert!(
                instructions.contains(&expected_marker),
                "scenario `{}` should include marker `{}`",
                scenario.id,
                expected_marker
            );
        } else {
            assert!(
                instructions.trim().is_empty(),
                "scenario `{}` should not auto-load backend skill instructions",
                scenario.id
            );
        }
    }
}
