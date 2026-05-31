use serde_json::{json, Value};

pub(super) fn build_tool_definitions() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "lookup_web",
                "description": "Request a web search for fresh public information. Use this for current events, recent updates, live facts, public news, or anything that depends on the internet.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The exact search query to run on the web."
                        }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "explore_workspace",
                "description": "Inspect the local workspace for files, directories, symbols, definitions, references, diagnostics, functions, or variables. Use `mode=list` to list a directory. Use `mode=search` for semantic workspace search that prefers backend LSP and only falls back to plain filesystem search when needed. Use `mode=symbols`, `mode=definition`, `mode=references`, or `mode=diagnostics` when the user is explicitly asking for semantic code navigation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "mode": {
                            "type": "string",
                            "enum": ["list", "search", "symbols", "definition", "references", "diagnostics"],
                            "description": "Use `list` to list entries in a directory. Use `search` for hybrid semantic search. Use `symbols`, `definition`, `references`, or `diagnostics` for explicit LSP-style navigation."
                        },
                        "path": {
                            "type": "string",
                            "description": "Optional cwd-relative or absolute directory path to inspect. For `list`, this is the directory to list. For semantic modes, this scopes the workspace root."
                        },
                        "query": {
                            "type": "string",
                            "description": "For `search` or `symbols`, pass a short search text, symbol name, file name, or code concept."
                        },
                        "symbol": {
                            "type": "string",
                            "description": "Optional explicit symbol name for `definition` or `references`."
                        },
                        "filePath": {
                            "type": "string",
                            "description": "Optional workspace-relative or absolute file path used to anchor semantic modes such as `definition`, `references`, or `diagnostics`."
                        },
                        "line": {
                            "type": "number",
                            "description": "Optional zero-based line for semantic navigation when a specific symbol location is already known."
                        },
                        "column": {
                            "type": "number",
                            "description": "Optional zero-based column for semantic navigation when a specific symbol location is already known."
                        },
                        "maxResults": {
                            "type": "number",
                            "description": "Optional upper bound for returned entries, from 1 to 50."
                        },
                        "includeFiles": {
                            "type": "boolean",
                            "description": "Whether file results should be included."
                        },
                        "includeDirectories": {
                            "type": "boolean",
                            "description": "Whether directory results should be included."
                        },
                        "recursive": {
                            "type": "boolean",
                            "description": "Whether recursive fallback search should be used. Defaults to true for `search` and false for `list`."
                        }
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_workspace_file",
                "description": "Read the contents of a specific local workspace file when the path is known. Prefer this over terminal commands like cat, sed, or head when the user wants to inspect a file. Relative paths are resolved from the authoritative cwd.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Workspace-relative or absolute path to the file that should be read."
                        },
                        "startLine": {
                            "type": "number",
                            "description": "Optional 1-based first line to include."
                        },
                        "endLine": {
                            "type": "number",
                            "description": "Optional 1-based last line to include."
                        },
                        "maxChars": {
                            "type": "number",
                            "description": "Optional upper bound for returned text, from 200 to 24000 characters."
                        }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "propose_plan",
                "description": "Create a structured execution plan for complex implementation, debugging, or research tasks. Use this when the task clearly benefits from visible multi-step planning.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Stable artifact identifier for this plan."
                        },
                        "title": {
                            "type": "string",
                            "description": "Short descriptive title for the plan."
                        },
                        "summary": {
                            "type": "string",
                            "description": "One concise sentence describing the overall goal."
                        },
                        "version": {
                            "type": "string",
                            "description": "Optional display version such as v1."
                        },
                        "steps": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {
                                        "type": "string"
                                    },
                                    "label": {
                                        "type": "string"
                                    },
                                    "status": {
                                        "type": "string",
                                        "enum": ["pending", "inProgress", "completed", "failed"]
                                    },
                                    "completed": {
                                        "type": "boolean"
                                    }
                                },
                                "required": ["label"]
                            }
                        },
                        "workstreams": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": { "type": "string" },
                                    "title": { "type": "string" },
                                    "status": {
                                        "type": "string",
                                        "enum": ["pending", "inProgress", "completed", "failed"]
                                    },
                                    "stepIds": {
                                        "type": "array",
                                        "items": { "type": "string" }
                                    }
                                },
                                "required": ["title"]
                            }
                        }
                    },
                    "required": ["title", "steps"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_plan",
                "description": "Update a previously proposed execution plan when the agent makes meaningful progress or needs to revise the visible steps.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Stable artifact identifier for the plan being updated."
                        },
                        "title": {
                            "type": "string",
                            "description": "Updated plan title."
                        },
                        "summary": {
                            "type": "string",
                            "description": "One concise sentence describing the current state of the plan."
                        },
                        "version": {
                            "type": "string",
                            "description": "Optional updated display version such as v2."
                        },
                        "steps": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {
                                        "type": "string"
                                    },
                                    "label": {
                                        "type": "string"
                                    },
                                    "status": {
                                        "type": "string",
                                        "enum": ["pending", "inProgress", "completed", "failed"]
                                    },
                                    "completed": {
                                        "type": "boolean"
                                    }
                                },
                                "required": ["label"]
                            }
                        },
                        "workstreams": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": { "type": "string" },
                                    "title": { "type": "string" },
                                    "status": {
                                        "type": "string",
                                        "enum": ["pending", "inProgress", "completed", "failed"]
                                    },
                                    "stepIds": {
                                        "type": "array",
                                        "items": { "type": "string" }
                                    }
                                },
                                "required": ["title"]
                            }
                        }
                    },
                    "required": ["id", "title", "steps"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "plan_execution",
                "description": "Mark the execution state of one plan step and optionally synchronize parallel workstreams under that step.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "planId": {
                            "type": "string",
                            "description": "Stable identifier of the plan artifact being executed."
                        },
                        "stepId": {
                            "type": "string",
                            "description": "Identifier of the step whose status changed."
                        },
                        "action": {
                            "type": "string",
                            "enum": ["started", "completed", "failed"]
                        },
                        "summary": {
                            "type": "string",
                            "description": "Optional updated summary for the visible plan."
                        },
                        "workstreams": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": { "type": "string" },
                                    "title": { "type": "string" },
                                    "status": {
                                        "type": "string",
                                        "enum": ["pending", "inProgress", "completed", "failed"]
                                    },
                                    "stepIds": {
                                        "type": "array",
                                        "items": { "type": "string" }
                                    }
                                },
                                "required": ["title"]
                            }
                        }
                    },
                    "required": ["planId", "stepId", "action"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "propose_terminal_command",
                "description": "Propose a terminal command to the user for approval and execution. Use this exact function name and do not invent aliases like shell:execute.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The shell command to propose (e.g. 'ls -la', 'git status')."
                        },
                        "requiresApproval": {
                            "type": "boolean",
                            "description": "Whether the user must approve the command before running (always true for safety)."
                        },
                        "reason": {
                            "type": "string",
                            "description": "A short Romanian sentence that explains why access is being requested, for example: 'Am cerut accesul pentru verificarea statusului repository-ului.'"
                        }
                    },
                    "required": ["command"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "launch_cloud_agent",
                "description": "Launch a new Octomus cloud agent run in a cloud tab when the user explicitly asks to run work in cloud infrastructure, a cloud terminal, a VPS, or Modal. The local UI will choose the configured cloud profile when profileId is omitted.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "prompt": {
                            "type": "string",
                            "description": "The complete task prompt for the cloud agent."
                        },
                        "provider": {
                            "type": "string",
                            "enum": ["custom-vm", "modal"],
                            "description": "Preferred cloud provider. Omit unless the user specified one."
                        },
                        "profileId": {
                            "type": "string",
                            "description": "Optional configured cloud profile id."
                        },
                        "repo": {
                            "type": "string",
                            "description": "Optional Git repository URL to clone in the cloud workspace."
                        },
                        "baseBranch": {
                            "type": "string",
                            "description": "Optional base branch, default main."
                        },
                        "workBranch": {
                            "type": "string",
                            "description": "Optional branch name for cloud work."
                        },
                        "syncStrategy": {
                            "type": "string",
                            "enum": ["git", "patch", "none"],
                            "description": "Optional result sync mode. Use `git` when the cloud workspace can push a branch, `patch` when changes should come back as an artifact, and `none` for read-only delegation."
                        },
                        "commitMessage": {
                            "type": "string",
                            "description": "Optional commit message to use when syncStrategy is `git`."
                        },
                        "artifactPath": {
                            "type": "string",
                            "description": "Optional artifact path inside the cloud workspace when syncStrategy is `patch`."
                        }
                    },
                    "required": ["prompt"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "propose_file_change",
                "description": "Propose file changes when the task creates, edits, or deletes files. Use this instead of shell heredocs, EOF blocks, or full-file markdown fences so the UI can show a native retractable file diff preview. Paths should be relative to the current CWD unless the user explicitly requested an absolute path.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "summary": {
                            "type": "string",
                            "description": "A short summary of the intended file changes."
                        },
                        "fileDiffs": {
                            "type": "array",
                            "description": "The files to create, update, or delete. Each item must include filePath and diffType.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "filePath": {
                                        "type": "string",
                                        "description": "Project-relative path from the current CWD, for example src/components/Foo.tsx."
                                    },
                                    "diffType": {
                                        "type": "object",
                                        "description": "Diff object. For new files use kind=create with one delta. For edits use kind=update with deltas.",
                                        "properties": {
                                            "kind": {
                                                "type": "string",
                                                "enum": ["create", "update", "delete"]
                                            },
                                            "delta": {
                                                "type": "object",
                                                "properties": {
                                                    "replacement_line_range": {
                                                        "type": "object",
                                                        "properties": {
                                                            "start": { "type": "number" },
                                                            "end": { "type": "number" }
                                                        },
                                                        "required": ["start", "end"]
                                                    },
                                                    "insertion": {
                                                        "type": "string",
                                                        "description": "Full file content for create/delete, or replacement text for a single delta."
                                                    }
                                                },
                                                "required": ["replacement_line_range", "insertion"]
                                            },
                                            "deltas": {
                                                "type": "array",
                                                "items": {
                                                    "type": "object",
                                                    "properties": {
                                                        "replacement_line_range": {
                                                            "type": "object",
                                                            "properties": {
                                                                "start": { "type": "number" },
                                                                "end": { "type": "number" }
                                                            },
                                                            "required": ["start", "end"]
                                                        },
                                                        "insertion": { "type": "string" }
                                                    },
                                                    "required": ["replacement_line_range", "insertion"]
                                                }
                                            },
                                            "rename": { "type": "string" }
                                        },
                                        "required": ["kind"]
                                    },
                                    "originalContent": {
                                        "type": "string",
                                        "description": "Optional original file content when known."
                                    }
                                },
                                "required": ["filePath", "diffType"]
                            }
                        },
                        "refineLabel": {
                            "type": "string",
                            "description": "Optional label for the refine action."
                        },
                        "editLabel": {
                            "type": "string",
                            "description": "Optional label for the edit action."
                        },
                        "acceptLabel": {
                            "type": "string",
                            "description": "Optional label for the accept action."
                        }
                    },
                    "required": ["fileDiffs"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "propose_mcp_server",
                "description": "Propose an MCP server configuration when the user asks to add or connect an MCP server. Use this only when you have enough concrete details to configure it; otherwise ask a concise clarification in visible text about transport, CLI command or SSE URL, and required env tokens.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Short display name for the MCP server."
                        },
                        "transport": {
                            "type": "string",
                            "enum": ["cli", "sse"],
                            "description": "Use cli for local stdio/command servers and sse for remote HTTP SSE servers."
                        },
                        "command": {
                            "type": "string",
                            "description": "CLI executable or command for stdio MCP servers, such as npx, uvx, python, node, or a local binary."
                        },
                        "args": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "CLI arguments, one item per argument. Do not include secrets here."
                        },
                        "url": {
                            "type": "string",
                            "description": "HTTP or HTTPS endpoint for SSE MCP servers."
                        },
                        "env": {
                            "type": "object",
                            "additionalProperties": { "type": "string" },
                            "description": "Environment variables needed by the server. Use placeholder values like YOUR_GITHUB_TOKEN when the user has not provided secrets."
                        },
                        "headers": {
                            "type": "object",
                            "additionalProperties": { "type": "string" },
                            "description": "HTTP headers for remote MCP servers. Use placeholder values for secrets. Prefer OAuth/mcp-remote when the server requires interactive auth."
                        },
                        "description": {
                            "type": "string",
                            "description": "One short sentence explaining what capability this MCP server adds."
                        },
                        "reason": {
                            "type": "string",
                            "description": "A short Romanian sentence explaining why this server should be added."
                        }
                    },
                    "required": ["name", "transport"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "suggest_follow_up",
                "description": "Attach one natural-language follow-up prompt suggestion for the UI chip. Phrase it as the next message the user would send to continue the conversation, not as a question the assistant asks the user. Prefer user-intent phrasing like 'Vreau să aflu mai multe despre concerte' or 'Caută evenimente de muzică'. This is metadata only; it is not visible assistant text and it is not a command.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "label": {
                            "type": "string",
                            "description": "Short chip text, at most 10 words. It must be a concrete next prompt, not a topic."
                        },
                        "prompt": {
                            "type": "string",
                            "description": "The exact natural-language user message the user would send next if they want to continue the conversation. It should sound like a user request or intention, not a question from the assistant."
                        },
                        "description": {
                            "type": "string",
                            "description": "One short sentence explaining why this follow-up is useful."
                        },
                        "confidence": {
                            "type": "number",
                            "description": "A number from 0 to 1 that indicates how confident the model is that this is the best next user message. Only emit the tool when confidence is at least 0.7."
                        }
                    },
                    "required": ["prompt"]
                }
            }
        }
    ])
}

pub(super) fn filter_tool_definitions(tools: Value, allowed_tool_names: &[&str]) -> Value {
    let Some(tool_array) = tools.as_array() else {
        return tools;
    };

    let allowed_names = allowed_tool_names.iter().copied().collect::<Vec<_>>();
    Value::Array(
        tool_array
            .iter()
            .filter(|tool| {
                tool.get("function")
                    .and_then(|value| value.get("name"))
                    .and_then(Value::as_str)
                    .map(|name| allowed_names.contains(&name))
                    .unwrap_or(false)
            })
            .cloned()
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::{build_tool_definitions, filter_tool_definitions};

    #[test]
    fn filters_tools_by_name() {
        let filtered = filter_tool_definitions(
            build_tool_definitions(),
            &["lookup_web", "propose_terminal_command"],
        );
        let names = filtered
            .as_array()
            .expect("tools should remain an array")
            .iter()
            .filter_map(|tool| {
                tool.get("function")
                    .and_then(|value| value.get("name"))
                    .and_then(|value| value.as_str())
            })
            .collect::<Vec<_>>();

        assert_eq!(names, vec!["lookup_web", "propose_terminal_command"]);
    }
}
