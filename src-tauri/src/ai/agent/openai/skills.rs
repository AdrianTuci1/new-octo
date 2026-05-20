use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    fs,
    path::PathBuf,
};

use serde::Serialize;

use crate::ai::agent::types::AgentInputMessage;
use crate::octomus_paths::{bundled_skills_dir_candidates, OctomusPaths};

#[derive(Debug, Clone, Serialize)]
pub struct SkillCatalogItem {
    pub name: String,
    pub description: String,
    pub path: String,
}

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

pub fn list_available_skills() -> Vec<SkillCatalogItem> {
    let available_skills = discover_available_skills();
    available_skills
        .into_iter()
        .filter_map(|(skill_name, skill_dir)| {
            let skill_md_path = skill_dir.join("SKILL.md");
            let content = fs::read_to_string(&skill_md_path).ok()?;
            let (parsed_name, description) = parse_skill_metadata(&content);
            Some(SkillCatalogItem {
                name: if parsed_name.is_empty() { skill_name } else { parsed_name },
                description,
                path: skill_dir.to_string_lossy().to_string(),
            })
        })
        .collect()
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
    let reserved_slash_commands = reserved_slash_commands();

    for skill_name in available_skills {
        let mentioned = is_skill_invoked(prompt, skill_name, &reserved_slash_commands)
            || messages.iter().any(|msg| {
                msg.role == "user"
                    && is_skill_invoked(&msg.content, skill_name, &reserved_slash_commands)
            });

        if mentioned {
            loaded_skills.insert(skill_name.clone());
        }
    }

    loaded_skills
}

fn is_skill_invoked(
    prompt: &str,
    skill_name: &str,
    reserved_slash_commands: &HashSet<&'static str>,
) -> bool {
    let explicit_patterns = [
        format!("@{}", skill_name),
        format!("@skills/{}", skill_name),
    ];
    if explicit_patterns
        .iter()
        .any(|pattern| prompt.contains(pattern))
    {
        return true;
    }

    matches_slash_invocation(prompt, &format!("/skills/{}", skill_name))
        || (!reserved_slash_commands.contains(skill_name)
            && matches_slash_invocation(prompt, &format!("/{}", skill_name)))
}

fn matches_slash_invocation(text: &str, command: &str) -> bool {
    text.split_whitespace().any(|token| {
        token == command
            || token
                .strip_prefix(command)
                .is_some_and(|remainder| remainder.starts_with([':', ',', '.', ';', '!', '?']))
    })
}

fn reserved_slash_commands() -> HashSet<&'static str> {
    HashSet::from([
        "agent",
        "create-environment",
        "open-file",
        "cloud-agent",
        "conversations",
        "prompts",
        "plan",
        "create-mcp",
        "new",
    ])
}

fn parse_skill_metadata(content: &str) -> (String, String) {
    let lines: Vec<&str> = content.lines().collect();
    if lines.first().map(|line| line.trim()) != Some("---") {
        return (String::new(), String::new());
    }

    let Some(end_idx) = lines.iter().enumerate().skip(1).find_map(|(index, line)| {
        line.trim().eq("---").then_some(index)
    }) else {
        return (String::new(), String::new());
    };

    let mut name = String::new();
    let mut description = String::new();
    let frontmatter_lines = &lines[1..end_idx];
    let mut index = 0;
    while index < frontmatter_lines.len() {
        let line = frontmatter_lines[index].trim_end();
        if let Some(value) = line.strip_prefix("name:") {
            name = value.trim().trim_matches('"').trim_matches('\'').to_string();
        } else if let Some(value) = line.strip_prefix("description:") {
            let value = value.trim();
            if matches!(value, ">" | "|" | ">-" | "|-") {
                let mut continuation_lines = Vec::new();
                index += 1;
                while index < frontmatter_lines.len() {
                    let next_line = frontmatter_lines[index];
                    if next_line.starts_with(' ') || next_line.starts_with('\t') {
                        continuation_lines.push(next_line.trim().to_string());
                        index += 1;
                    } else {
                        break;
                    }
                }
                description = continuation_lines.join(" ");
                continue;
            }
            description = value.trim_matches('"').trim_matches('\'').to_string();
        }
        index += 1;
    }

    (name, description)
}

#[cfg(test)]
mod tests {
    use super::{
        detect_mentioned_skills, insert_skill_directories, is_skill_invoked,
        reserved_slash_commands,
    };
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

    #[test]
    fn detects_direct_slash_skill_invocation() {
        let reserved = reserved_slash_commands();

        assert!(is_skill_invoked("/alpha", "alpha", &reserved));
        assert!(is_skill_invoked(
            "rulează /alpha pentru mine",
            "alpha",
            &reserved
        ));
        assert!(is_skill_invoked("/skills/alpha", "alpha", &reserved));
    }

    #[test]
    fn does_not_treat_reserved_slash_commands_as_skills() {
        let reserved = reserved_slash_commands();

        assert!(!is_skill_invoked("/cloud-agent", "cloud-agent", &reserved));
        assert!(!is_skill_invoked("/plan", "plan", &reserved));
    }
}
