use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
};

use crate::ai::agent::types::AgentInputMessage;
use crate::octomus_paths::{bundled_skills_dir_candidates, OctomusPaths};

/// Citeste dinamic skill-urile disponibile si intoarce instructiunile
/// pentru skill-urile care au fost invocate (mentionate) de utilizator.
pub fn load_skills_instructions(prompt: &str, messages: &[AgentInputMessage]) -> String {
    let available_skills = discover_available_skills();
    let loaded_skills = detect_mentioned_skills(available_skills.keys(), prompt, messages);

    let mut injected_skills_text = String::new();
    for skill_name in loaded_skills {
        let Some(skill_dir) = available_skills.get(&skill_name) else {
            continue;
        };

        let skill_md_path = skill_dir.join("SKILL.md");
        if let Ok(content) = fs::read_to_string(&skill_md_path) {
            injected_skills_text.push_str(&format!(
                "\n\n--- INSTRUCTIUNI SKILL PENTRU {} ---\n{}\n--- SFARSIT INSTRUCTIUNI SKILL {} ---\n",
                skill_name.to_uppercase(),
                content,
                skill_name.to_uppercase()
            ));
        }
    }

    injected_skills_text
}

fn discover_available_skills() -> BTreeMap<String, PathBuf> {
    let mut skills = BTreeMap::new();

    for dir in bundled_skills_dir_candidates() {
        insert_skill_directories(&mut skills, &dir, false);
    }

    insert_skill_directories(&mut skills, &OctomusPaths::default().skills_dir(), true);

    skills
}

fn insert_skill_directories(
    skills: &mut BTreeMap<String, PathBuf>,
    base_dir: &PathBuf,
    overwrite_existing: bool,
) {
    let Ok(entries) = fs::read_dir(base_dir) else {
        return;
    };

    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(skill_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        if !path.join("SKILL.md").is_file() {
            continue;
        }

        if overwrite_existing || !skills.contains_key(skill_name) {
            skills.insert(skill_name.to_string(), path);
        }
    }
}

fn detect_mentioned_skills<'a>(
    available_skills: impl Iterator<Item = &'a String>,
    prompt: &str,
    messages: &[AgentInputMessage],
) -> BTreeSet<String> {
    let mut loaded_skills = BTreeSet::new();

    for skill_name in available_skills {
        let patterns = [
            format!("@{}", skill_name),
            format!("@skills/{}", skill_name),
            format!("/skills/{}", skill_name),
        ];

        let mentioned = patterns.iter().any(|pattern| {
            prompt.contains(pattern)
                || messages
                    .iter()
                    .any(|msg| msg.role == "user" && msg.content.contains(pattern))
        });

        if mentioned {
            loaded_skills.insert(skill_name.clone());
        }
    }

    loaded_skills
}

#[cfg(test)]
mod tests {
    use super::{detect_mentioned_skills, insert_skill_directories};
    use crate::ai::agent::types::AgentInputMessage;
    use std::{
        collections::BTreeMap,
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn custom_skill_directory_can_override_bundled_skill_name() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let bundled_dir = std::env::temp_dir().join(format!("octomus-bundled-skills-{unique}"));
        let custom_dir = std::env::temp_dir().join(format!("octomus-custom-skills-{unique}"));

        fs::create_dir_all(bundled_dir.join("demo")).expect("bundled skill dir should exist");
        fs::create_dir_all(custom_dir.join("demo")).expect("custom skill dir should exist");
        fs::write(bundled_dir.join("demo").join("SKILL.md"), "bundled")
            .expect("bundled SKILL.md should exist");
        fs::write(custom_dir.join("demo").join("SKILL.md"), "custom")
            .expect("custom SKILL.md should exist");

        let mut skills = BTreeMap::new();
        insert_skill_directories(&mut skills, &PathBuf::from(&bundled_dir), false);
        insert_skill_directories(&mut skills, &PathBuf::from(&custom_dir), true);

        assert_eq!(skills.get("demo"), Some(&custom_dir.join("demo")));

        let _ = fs::remove_dir_all(bundled_dir);
        let _ = fs::remove_dir_all(custom_dir);
    }

    #[test]
    fn detects_skills_mentioned_in_prompt_or_history() {
        let available = vec!["alpha".to_string(), "beta".to_string()];
        let messages = vec![AgentInputMessage {
            role: "user".to_string(),
            content: "folosește @skills/beta".to_string(),
            tool_call_id: None,
            tool_calls: None,
        }];

        let detected = detect_mentioned_skills(available.iter(), "rulează @alpha", &messages);

        assert!(detected.contains("alpha"));
        assert!(detected.contains("beta"));
    }
}
