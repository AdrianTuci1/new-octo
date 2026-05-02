use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalLocalContext {
    pub files: Vec<String>,
    pub git_branch: Option<String>,
    pub current_dir: String,
}

pub fn gather_local_context(cwd: &str) -> TerminalLocalContext {
    let mut files = Vec::new();
    
    // List first 20 files/dirs in CWD to give AI context
    if let Ok(entries) = fs::read_dir(cwd) {
        for entry in entries.flatten().take(20) {
            if let Ok(name) = entry.file_name().into_string() {
                files.push(name);
            }
        }
    }

    TerminalLocalContext {
        files,
        git_branch: get_current_git_branch(cwd),
        current_dir: cwd.to_string(),
    }
}

fn get_current_git_branch(cwd: &str) -> Option<String> {
    let git_path = Path::new(cwd).join(".git");
    if !git_path.exists() {
        return None;
    }

    // Simple check for HEAD
    fs::read_to_string(git_path.join("HEAD"))
        .ok()
        .and_then(|content| {
            if let Some(branch) = content.strip_prefix("ref: refs/heads/") {
                Some(branch.trim().to_string())
            } else {
                None
            }
        })
}
