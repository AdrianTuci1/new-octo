use std::path::{Path, PathBuf};

use serde_json::Value;

use super::workspace::EvalWorkspace;
use crate::ai::agent::types::AgentToolCall;

#[derive(Debug, Default)]
pub(super) struct EvalToolSimulator {
    pub(super) changed_files: Vec<String>,
}

impl EvalToolSimulator {
    pub(super) fn execute(
        &mut self,
        workspace: &EvalWorkspace,
        tool_call: &AgentToolCall,
    ) -> Result<String, String> {
        match tool_call.name.as_str() {
            "lookup_web" => simulate_web_lookup(&tool_call.args),
            "explore_workspace" => simulate_explore_workspace(workspace.root(), &tool_call.args),
            "read_workspace_file" => {
                simulate_read_workspace_file(workspace.root(), &tool_call.args)
            }
            "propose_file_change" => self.simulate_file_change(workspace.root(), &tool_call.args),
            "propose_terminal_command" => simulate_terminal_command(&tool_call.args),
            "propose_plan" => simulate_plan_artifact("propose_plan", &tool_call.args),
            "update_plan" => simulate_plan_artifact("update_plan", &tool_call.args),
            "plan_execution" => simulate_plan_artifact("plan_execution", &tool_call.args),
            "suggest_follow_up" => simulate_follow_up_suggestion(&tool_call.args),
            "launch_cloud_agent" => simulate_cloud_launch(&tool_call.args),
            other => Err(format!("unsupported eval tool simulation for `{other}`")),
        }
    }

    fn simulate_file_change(&mut self, root: &Path, args: &Value) -> Result<String, String> {
        let diffs = args
            .get("fileDiffs")
            .and_then(Value::as_array)
            .ok_or_else(|| "propose_file_change is missing fileDiffs".to_string())?;

        let mut applied = Vec::new();
        for diff in diffs {
            let file_path = diff
                .get("filePath")
                .and_then(Value::as_str)
                .ok_or_else(|| "fileDiff is missing filePath".to_string())?;
            let path = root.join(file_path);
            let diff_type = diff
                .get("diffType")
                .ok_or_else(|| "fileDiff is missing diffType".to_string())?;
            let kind = diff_type
                .get("kind")
                .and_then(Value::as_str)
                .map(ToString::to_string)
                .unwrap_or_else(|| infer_diff_kind(&path, diff_type));

            match kind.as_str() {
                "create" => {
                    let insertion = diff
                        .get("diffType")
                        .and_then(|value| value.get("delta"))
                        .and_then(|value| value.get("insertion"))
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if let Some(parent) = path.parent() {
                        std::fs::create_dir_all(parent)
                            .map_err(|error| format!("failed to create parent dir: {error}"))?;
                    }
                    std::fs::write(&path, insertion)
                        .map_err(|error| format!("failed to create '{}': {error}", file_path))?;
                }
                "update" => {
                    let existing = std::fs::read_to_string(&path).unwrap_or_default();
                    let next = apply_update_deltas(
                        &existing,
                        diff.get("diffType")
                            .and_then(|value| value.get("deltas"))
                            .or_else(|| diff.get("diffType").and_then(|value| value.get("delta"))),
                    )?;
                    std::fs::write(&path, next)
                        .map_err(|error| format!("failed to update '{}': {error}", file_path))?;
                }
                "delete" => {
                    if path.exists() {
                        std::fs::remove_file(&path).map_err(|error| {
                            format!("failed to delete '{}': {error}", file_path)
                        })?;
                    }
                }
                other => {
                    return Err(format!("unsupported diffType.kind `{other}`"));
                }
            }

            self.changed_files.push(file_path.to_string());
            applied.push(format!("- {} ({})", file_path, kind));
        }

        Ok(format!(
            "Applied file change proposal successfully.\nChanged files:\n{}",
            applied.join("\n")
        ))
    }
}

fn infer_diff_kind(path: &Path, diff_type: &Value) -> String {
    if diff_type.get("rename").is_some() {
        return "update".to_string();
    }
    if path.exists() {
        return "update".to_string();
    }
    if diff_type.get("deltas").is_some() || diff_type.get("delta").is_some() {
        return "create".to_string();
    }
    "update".to_string()
}

fn simulate_explore_workspace(root: &Path, args: &Value) -> Result<String, String> {
    let mode = args
        .get("mode")
        .and_then(Value::as_str)
        .unwrap_or("search")
        .trim()
        .to_ascii_lowercase();
    let path = args
        .get("path")
        .and_then(Value::as_str)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or(".");
    let query = args
        .get("query")
        .and_then(Value::as_str)
        .or_else(|| args.get("symbol").and_then(Value::as_str))
        .unwrap_or("")
        .trim()
        .to_string();
    let base = resolve_workspace_path(root, path);

    match mode.as_str() {
        "list" => {
            let mut entries = std::fs::read_dir(&base)
                .map_err(|error| format!("failed to list '{}': {error}", base.display()))?
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .collect::<Vec<_>>();
            entries.sort();
            let listed = entries
                .iter()
                .map(|entry| format!("- {}", relativize(root, entry)))
                .collect::<Vec<_>>();
            Ok(format!(
                "Workspace listing for {}:\n{}",
                path,
                listed.join("\n")
            ))
        }
        "search" | "symbols" | "definition" | "references" => {
            let mut matches = Vec::new();
            collect_files(&base, &mut matches)?;
            let matches = matches
                .into_iter()
                .filter_map(|file_path| {
                    let content = std::fs::read_to_string(&file_path).ok()?;
                    if !query.is_empty()
                        && !content.contains(&query)
                        && !file_path.to_string_lossy().contains(&query)
                    {
                        return None;
                    }
                    Some(format!("- {}", relativize(root, &file_path)))
                })
                .take(8)
                .collect::<Vec<_>>();
            if matches.is_empty() {
                Ok(format!(
                    "No workspace matches for query `{}` in {}.",
                    query,
                    relativize(root, &base)
                ))
            } else {
                Ok(format!(
                    "Workspace matches for `{}`:\n{}",
                    query,
                    matches.join("\n")
                ))
            }
        }
        "diagnostics" => Ok("No diagnostics available in eval simulator.".to_string()),
        other => Err(format!("unsupported explore_workspace mode `{other}`")),
    }
}

fn simulate_read_workspace_file(root: &Path, args: &Value) -> Result<String, String> {
    let path = args
        .get("path")
        .or_else(|| args.get("filePath"))
        .and_then(Value::as_str)
        .ok_or_else(|| "read_workspace_file is missing path".to_string())?;
    let resolved = resolve_workspace_path(root, path);
    let content = std::fs::read_to_string(&resolved)
        .map_err(|error| format!("failed to read '{}': {error}", resolved.display()))?;
    let start = args.get("startLine").and_then(Value::as_u64).unwrap_or(1) as usize;
    let end = args
        .get("endLine")
        .and_then(Value::as_u64)
        .unwrap_or(usize::MAX as u64) as usize;
    let max_chars = args
        .get("maxChars")
        .and_then(Value::as_u64)
        .unwrap_or(24_000) as usize;
    let excerpt = content
        .lines()
        .enumerate()
        .filter(|(index, _)| {
            let line_number = index + 1;
            line_number >= start && line_number <= end
        })
        .map(|(_, line)| line)
        .collect::<Vec<_>>()
        .join("\n");
    let mut excerpt = excerpt;
    if excerpt.chars().count() > max_chars {
        excerpt = excerpt.chars().take(max_chars).collect::<String>();
    }

    Ok(format!("Contents of {}:\n{}", path, excerpt))
}

fn simulate_cloud_launch(args: &Value) -> Result<String, String> {
    let prompt = args
        .get("prompt")
        .and_then(Value::as_str)
        .ok_or_else(|| "launch_cloud_agent is missing prompt".to_string())?;
    let provider = args
        .get("provider")
        .and_then(Value::as_str)
        .unwrap_or("default");
    Ok(format!(
        "Cloud agent launch accepted for provider `{}` with prompt: {}",
        provider, prompt
    ))
}

fn simulate_web_lookup(args: &Value) -> Result<String, String> {
    let query = args
        .get("query")
        .and_then(Value::as_str)
        .ok_or_else(|| "lookup_web is missing query".to_string())?;

    let results = if query.to_ascii_lowercase().contains("rust") {
        [
            "- Rust 1.90 release coverage emphasized language polish and standard library improvements.",
            "- Tokio maintainers highlighted compatibility guidance for the latest Rust release.",
            "- Ecosystem summaries focused on performance tooling and async ergonomics.",
        ]
        .join("\n")
    } else if query.to_ascii_lowercase().contains("docker") {
        [
            "- Docker community posts discussed Desktop updates and Compose workflow improvements.",
            "- Public release notes focused on developer experience and security fixes.",
        ]
        .join("\n")
    } else {
        [
            "- Fresh public sources were found for the requested topic.",
            "- The top results converged on a short, actionable summary.",
        ]
        .join("\n")
    };

    Ok(format!("Fresh web results for `{query}`:\n{results}"))
}

fn simulate_terminal_command(args: &Value) -> Result<String, String> {
    let command = args
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| "propose_terminal_command is missing command".to_string())?;
    let normalized = command.trim().to_ascii_lowercase();
    let output = match normalized.as_str() {
        "python3 --version" | "python --version" => "Python 3.12.0".to_string(),
        "docker ps" => {
            "CONTAINER ID   IMAGE   STATUS\n8f3f9c2d1a4b   postgres:16   Up 3 hours".to_string()
        }
        "cargo test" => {
            "running 2 tests\ntest greet_smoke ... ok\ntest ping_smoke ... ok\n\ntest result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out".to_string()
        }
        "pwd" => "/tmp/eval-workspace".to_string(),
        _ if normalized.starts_with("ls") => "src\nCargo.toml\nREADME.md".to_string(),
        _ => "Command completed successfully with no critical findings.".to_string(),
    };

    Ok(format!(
        "Approved terminal command executed.\nCommand: {command}\nExit code: 0\nOutput:\n{output}"
    ))
}

fn simulate_plan_artifact(tool_name: &str, args: &Value) -> Result<String, String> {
    Ok(format!(
        "Plan artifact accepted by the runtime and displayed to the user via `{tool_name}`: {}",
        serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string())
    ))
}

fn simulate_follow_up_suggestion(args: &Value) -> Result<String, String> {
    Ok(format!(
        "Follow-up suggestion metadata captured by the runtime: {}",
        serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string())
    ))
}

fn apply_update_deltas(existing: &str, raw_deltas: Option<&Value>) -> Result<String, String> {
    let deltas = match raw_deltas {
        Some(Value::Array(items)) => items.clone(),
        Some(Value::Object(_)) => vec![raw_deltas.cloned().unwrap_or(Value::Null)],
        _ => return Ok(existing.to_string()),
    };

    let mut lines = existing
        .lines()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    for delta in deltas.into_iter().rev() {
        let range = delta
            .get("replacement_line_range")
            .ok_or_else(|| "delta is missing replacement_line_range".to_string())?;
        let start = range.get("start").and_then(Value::as_u64).unwrap_or(1) as usize;
        let end = range
            .get("end")
            .and_then(Value::as_u64)
            .unwrap_or(start as u64) as usize;
        let insertion = delta
            .get("insertion")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .lines()
            .map(ToString::to_string)
            .collect::<Vec<_>>();

        let start_index = start.saturating_sub(1).min(lines.len());
        let end_index = end.min(lines.len());
        lines.splice(start_index..end_index, insertion);
    }

    Ok(lines.join("\n") + if existing.ends_with('\n') { "\n" } else { "" })
}

fn collect_files(path: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if path.is_file() {
        files.push(path.to_path_buf());
        return Ok(());
    }

    for entry in std::fs::read_dir(path)
        .map_err(|error| format!("failed to read dir '{}': {error}", path.display()))?
    {
        let entry = entry.map_err(|error| format!("failed to read dir entry: {error}"))?;
        let child = entry.path();
        if child.is_dir() {
            collect_files(&child, files)?;
        } else {
            files.push(child);
        }
    }

    Ok(())
}

fn resolve_workspace_path(root: &Path, path: &str) -> PathBuf {
    let candidate = PathBuf::from(path);
    if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    }
}

fn relativize(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use std::{fs, path::PathBuf};

    use super::{
        apply_update_deltas, infer_diff_kind, simulate_plan_artifact, simulate_terminal_command,
        simulate_web_lookup,
    };

    #[test]
    fn update_deltas_replace_requested_lines() {
        let updated = apply_update_deltas(
            "line1\nline2\nline3\n",
            Some(&json!([
                {
                    "replacement_line_range": { "start": 2, "end": 2 },
                    "insertion": "middle"
                }
            ])),
        )
        .expect("delta application should succeed");

        assert_eq!(updated, "line1\nmiddle\nline3\n");
    }

    #[test]
    fn terminal_command_simulation_acknowledges_proposed_command() {
        let response = simulate_terminal_command(&json!({
            "command": "ls -la",
            "requiresApproval": true,
            "reason": "Inspect local files"
        }))
        .expect("terminal command simulation should succeed");

        assert!(response.contains("ls -la"));
        assert!(response.contains("Exit code: 0"));
    }

    #[test]
    fn web_lookup_simulation_returns_fresh_results_summary() {
        let response = simulate_web_lookup(&json!({
            "query": "Rust 1.90 release"
        }))
        .expect("web lookup simulation should succeed");

        assert!(response.contains("Fresh web results"));
        assert!(response.contains("Rust 1.90"));
    }

    #[test]
    fn plan_artifact_simulation_returns_stable_summary() {
        let response = simulate_plan_artifact(
            "propose_plan",
            &json!({
                "id": "plan-1",
                "title": "Investigate bug"
            }),
        )
        .expect("plan artifact simulation should succeed");

        assert!(response.contains("propose_plan"));
        assert!(response.contains("Investigate bug"));
    }

    #[test]
    fn infer_diff_kind_treats_existing_file_with_deltas_as_update() {
        let temp_path = PathBuf::from(std::env::temp_dir())
            .join(format!("octomus-infer-kind-{}.rs", std::process::id()));
        fs::write(&temp_path, "fn original() {}\n").expect("temp file should write");

        let inferred = infer_diff_kind(
            &temp_path,
            &json!({
                "deltas": [{
                    "replacement_line_range": { "start": 1, "end": 1 },
                    "insertion": "fn updated() {}\n"
                }]
            }),
        );

        assert_eq!(inferred, "update");
        let _ = fs::remove_file(temp_path);
    }
}
