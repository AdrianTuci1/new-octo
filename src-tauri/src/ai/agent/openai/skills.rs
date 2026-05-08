use std::fs;
use std::path::Path;
use std::collections::HashSet;
use crate::ai::agent::types::AgentInputMessage;

/// Citeste dinamic skill-urile disponibile si intoarce instructiunile
/// pentru skill-urile care au fost invocate (mentionate) de utilizator.
pub fn load_skills_instructions(prompt: &str, messages: &[AgentInputMessage]) -> String {
    let mut active_skills = Vec::new();
    let skills_paths = [
        "src-tauri/resources/skills",
        "resources/skills",
        "/Users/adriantucicovenco/Proiecte/launcher-rs-react/src-tauri/resources/skills",
    ];

    let mut skills_dir_to_use = None;
    for path in &skills_paths {
        if Path::new(path).is_dir() {
            skills_dir_to_use = Some(path.to_string());
            break;
        }
    }

    if let Some(ref dir_path) = skills_dir_to_use {
        if let Ok(entries) = fs::read_dir(dir_path) {
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                        active_skills.push(name.to_string());
                    }
                }
            }
        }
    }

    let mut loaded_skills = HashSet::new();
    for skill_name in &active_skills {
        let patterns = [
            format!("@{}", skill_name),
            format!("@skills/{}", skill_name),
            format!("/skills/{}", skill_name),
        ];

        let mut mentioned = false;
        for pattern in &patterns {
            if prompt.contains(pattern) {
                mentioned = true;
                break;
            }
            for msg in messages {
                if msg.role == "user" && msg.content.contains(pattern) {
                    mentioned = true;
                    break;
                }
            }
        }

        if mentioned {
            loaded_skills.insert(skill_name.clone());
        }
    }

    let mut injected_skills_text = String::new();
    if let Some(ref dir_path) = skills_dir_to_use {
        for skill_name in &loaded_skills {
            let skill_md_path = Path::new(dir_path).join(skill_name).join("SKILL.md");
            if let Ok(content) = fs::read_to_string(&skill_md_path) {
                injected_skills_text.push_str(&format!(
                    "\n\n--- INSTRUCTIUNI SKILL PENTRU {} ---\n{}\n--- SFARSIT INSTRUCTIUNI SKILL {} ---\n",
                    skill_name.to_uppercase(),
                    content,
                    skill_name.to_uppercase()
                ));
            }
        }
    }

    injected_skills_text
}
