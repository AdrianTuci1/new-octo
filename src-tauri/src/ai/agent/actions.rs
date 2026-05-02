#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum OctomusActionType {
    RunCommand {
        command: String,
        wait_until_completion: bool,
    },
    ReadFiles {
        file_paths: Vec<String>,
    },
    WriteFile {
        file_path: String,
        content: String,
    },
    EditFile {
        file_path: String,
        search: String,
        replace: String,
    },
    Grep {
        pattern: String,
        path: Option<String>,
        is_regex: bool,
    },
}

impl OctomusActionType {
    pub fn function_name(&self) -> &'static str {
        match self {
            Self::RunCommand { .. } => "run_command",
            Self::ReadFiles { .. } => "read_files",
            Self::WriteFile { .. } => "write_file",
            Self::EditFile { .. } => "edit_file",
            Self::Grep { .. } => "grep_files",
        }
    }

    pub fn arguments(&self) -> Value {
        match self {
            Self::RunCommand {
                command,
                wait_until_completion,
            } => json!({
                "command": command,
                "waitUntilCompletion": wait_until_completion,
            }),
            Self::ReadFiles { file_paths } => json!({
                "filePaths": file_paths,
            }),
            Self::WriteFile { file_path, content } => json!({
                "filePath": file_path,
                "content": content,
            }),
            Self::EditFile {
                file_path,
                search,
                replace,
            } => json!({
                "filePath": file_path,
                "search": search,
                "replace": replace,
            }),
            Self::Grep {
                pattern,
                path,
                is_regex,
            } => json!({
                "pattern": pattern,
                "path": path,
                "isRegex": is_regex,
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAction {
    pub id: String,
    pub action: OctomusActionType,
    pub requires_result: bool,
}

impl AgentAction {
    pub fn to_api_tool_call(&self) -> Value {
        json!({
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.action.function_name(),
                "arguments": self.action.arguments().to_string(),
            }
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrepMatch {
    pub path: String,
    pub line: usize,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionResult {
    CommandCompleted {
        command: String,
        output: String,
        exit_code: Option<i32>,
    },
    CommandSnapshot {
        command: String,
        output: String,
    },
    FilesRead {
        files: Vec<FileContent>,
    },
    FileWritten {
        file_path: String,
        diff: Option<String>,
    },
    GrepMatches {
        matches: Vec<GrepMatch>,
    },
    Cancelled,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentActionResult {
    pub tool_call_id: String,
    pub result: ActionResult,
}

impl AgentActionResult {
    pub fn to_content_string(&self) -> String {
        match &self.result {
            ActionResult::CommandCompleted {
                command,
                output,
                exit_code,
            } => format!(
                "Command: {command}\nExit code: {}\n\n{output}",
                exit_code
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            ),
            ActionResult::CommandSnapshot { command, output } => {
                format!("Command snapshot: {command}\n\n{output}")
            }
            ActionResult::FilesRead { files } => files
                .iter()
                .map(|file| format!("=== {} ===\n{}", file.path, file.content))
                .collect::<Vec<_>>()
                .join("\n\n"),
            ActionResult::FileWritten { file_path, diff } => format!(
                "File written: {file_path}\n{}",
                diff.as_deref().unwrap_or("(no diff)")
            ),
            ActionResult::GrepMatches { matches } => matches
                .iter()
                .map(|entry| format!("{}:{} {}", entry.path, entry.line, entry.snippet))
                .collect::<Vec<_>>()
                .join("\n"),
            ActionResult::Cancelled => "Action was cancelled by the user.".to_string(),
            ActionResult::Error(error) => format!("Error: {error}"),
        }
    }
}
