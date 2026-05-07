use std::{
    path::{Path, PathBuf},
    process::Command,
};

use serde::{Deserialize, Serialize};

use super::fs::resolve_request_path;
use super::fs::PathRequest;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoContext {
    pub root_path: String,
    pub current_branch: String,
    pub branches: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchSwitchRequest {
    pub path: Option<String>,
    pub branch: String,
}

pub fn terminal_get_git_context(request: PathRequest) -> Result<Option<GitRepoContext>, String> {
    let cwd = resolve_request_path(request.path)?;
    git_repo_context(&cwd)
}

pub fn terminal_switch_git_branch(
    request: GitBranchSwitchRequest,
) -> Result<Option<GitRepoContext>, String> {
    let cwd = resolve_request_path(request.path)?;
    let branch = request.branch.trim();
    if branch.is_empty() {
        return Err("git branch cannot be empty".to_string());
    }

    let output = Command::new("git")
        .arg("switch")
        .arg(branch)
        .current_dir(&cwd)
        .output()
        .map_err(|error| format!("failed to switch git branch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "git switch failed".to_string()
        } else {
            stderr
        });
    }

    git_repo_context(&cwd)
}

pub fn git_repo_context(cwd: &Path) -> Result<Option<GitRepoContext>, String> {
    let inside_repo = Command::new("git")
        .arg("rev-parse")
        .arg("--is-inside-work-tree")
        .current_dir(cwd)
        .output();

    let Ok(inside_repo) = inside_repo else {
        return Ok(None);
    };

    if !inside_repo.status.success()
        || String::from_utf8_lossy(&inside_repo.stdout).trim() != "true"
    {
        return Ok(None);
    }

    let root_path = run_git_capture(cwd, &["rev-parse", "--show-toplevel"])?;
    let current_branch = run_git_capture(cwd, &["branch", "--show-current"])?;
    let branches = run_git_capture(cwd, &["branch", "--format=%(refname:short)"])?
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    Ok(Some(GitRepoContext {
        root_path,
        current_branch,
        branches,
    }))
}

pub fn run_git_capture(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("failed to run git {}: {error}", args.join(" ")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git {} failed", args.join(" "))
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
