use std::{
    collections::BTreeSet,
    fs,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeDiffRequest {
    pub path: Option<String>,
    pub include_patch: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeDiffFile {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub patch: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeDiff {
    pub is_repo: bool,
    pub repo_root: Option<String>,
    pub repo_name: Option<String>,
    pub branch: Option<String>,
    pub additions: usize,
    pub deletions: usize,
    pub files: Vec<GitWorktreeDiffFile>,
}

pub fn terminal_get_git_context(request: PathRequest) -> Result<Option<GitRepoContext>, String> {
    let cwd = resolve_request_path(request.path, request.cwd)?;
    git_repo_context(&cwd)
}

pub fn terminal_get_worktree_diff(
    request: GitWorktreeDiffRequest,
) -> Result<GitWorktreeDiff, String> {
    let cwd = resolve_request_path(request.path, None)?;
    let Some(context) = git_repo_context(&cwd)? else {
        return Ok(GitWorktreeDiff {
            is_repo: false,
            repo_root: None,
            repo_name: None,
            branch: None,
            additions: 0,
            deletions: 0,
            files: Vec::new(),
        });
    };

    let root_path = PathBuf::from(&context.root_path);
    let include_patch = request.include_patch.unwrap_or(false);
    let file_paths = collect_worktree_diff_paths(&root_path)?;
    let mut files = Vec::new();

    for path in file_paths {
        let status = git_status_for_path(&root_path, &path).unwrap_or_else(|| "M".to_string());
        let (additions, deletions) = diff_numstat_for_path(&root_path, &path, status.contains('?'));
        let patch = if include_patch {
            diff_patch_for_path(&root_path, &path, status.contains('?'))?
        } else {
            String::new()
        };

        files.push(GitWorktreeDiffFile {
            path,
            status,
            additions,
            deletions,
            patch,
        });
    }

    let additions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    let repo_name = root_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string);

    Ok(GitWorktreeDiff {
        is_repo: true,
        repo_root: Some(context.root_path),
        repo_name,
        branch: Some(context.current_branch),
        additions,
        deletions,
        files,
    })
}

pub fn terminal_switch_git_branch(
    request: GitBranchSwitchRequest,
) -> Result<Option<GitRepoContext>, String> {
    let cwd = resolve_request_path(request.path, None)?;
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

fn collect_worktree_diff_paths(root: &Path) -> Result<Vec<String>, String> {
    let mut paths = BTreeSet::new();

    for args in [
        ["diff", "--name-only", "--relative"].as_slice(),
        ["diff", "--cached", "--name-only", "--relative"].as_slice(),
        ["ls-files", "--others", "--exclude-standard"].as_slice(),
    ] {
        let output = run_git_capture(root, args)?;
        for line in output
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
        {
            paths.insert(line.to_string());
        }
    }

    Ok(paths.into_iter().collect())
}

fn git_status_for_path(root: &Path, path: &str) -> Option<String> {
    let output = Command::new("git")
        .args(["status", "--short", "--"])
        .arg(path)
        .current_dir(root)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .next()
        .map(|line| line.chars().take(2).collect::<String>().trim().to_string())
        .filter(|status| !status.is_empty())
}

fn diff_numstat_for_path(root: &Path, path: &str, is_untracked: bool) -> (usize, usize) {
    if is_untracked {
        return (count_file_lines(&root.join(path)), 0);
    }

    let mut additions = 0;
    let mut deletions = 0;
    for args in [
        ["diff", "--numstat", "--"].as_slice(),
        ["diff", "--cached", "--numstat", "--"].as_slice(),
    ] {
        let output = Command::new("git")
            .args(args)
            .arg(path)
            .current_dir(root)
            .output();

        let Ok(output) = output else {
            continue;
        };
        if !output.status.success() {
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let mut parts = line.split_whitespace();
            additions += parts
                .next()
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(0);
            deletions += parts
                .next()
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(0);
        }
    }

    (additions, deletions)
}

fn diff_patch_for_path(root: &Path, path: &str, is_untracked: bool) -> Result<String, String> {
    if is_untracked {
        return synthesize_untracked_patch(root, path);
    }

    let mut patch = run_git_capture_with_path(root, &["diff", "--unified=8", "--"], path)?;
    let cached_patch =
        run_git_capture_with_path(root, &["diff", "--cached", "--unified=8", "--"], path)?;

    if !patch.is_empty() && !cached_patch.is_empty() {
        patch.push_str("\n");
    }
    patch.push_str(&cached_patch);

    Ok(patch)
}

fn run_git_capture_with_path(root: &Path, args: &[&str], path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .arg(path)
        .current_dir(root)
        .output()
        .map_err(|error| format!("failed to run git {} {path}: {error}", args.join(" ")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git {} {path} failed", args.join(" "))
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn synthesize_untracked_patch(root: &Path, path: &str) -> Result<String, String> {
    let full_path = root.join(path);
    let metadata = fs::metadata(&full_path)
        .map_err(|error| format!("failed to inspect untracked file {path}: {error}"))?;

    if !metadata.is_file() {
        return Ok(format!(
            "diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n"
        ));
    }

    if metadata.len() > 512 * 1024 {
        return Ok(format!(
            "diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n@@ -0,0 +1 @@\n+Binary or large file omitted from preview.\n"
        ));
    }

    let bytes = fs::read(&full_path)
        .map_err(|error| format!("failed to read untracked file {path}: {error}"))?;
    let Ok(content) = String::from_utf8(bytes) else {
        return Ok(format!(
            "diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n@@ -0,0 +1 @@\n+Binary file omitted from preview.\n"
        ));
    };
    let line_count = if content.is_empty() {
        0
    } else {
        content.lines().count()
    };
    let mut patch = format!(
        "diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{line_count} @@\n"
    );

    for line in content.lines() {
        patch.push('+');
        patch.push_str(line);
        patch.push('\n');
    }

    Ok(patch)
}

fn count_file_lines(path: &Path) -> usize {
    fs::read_to_string(path)
        .map(|content| {
            if content.is_empty() {
                0
            } else {
                content.lines().count()
            }
        })
        .unwrap_or(0)
}
