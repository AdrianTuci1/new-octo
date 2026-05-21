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
                "description": "Inspect the local workspace recursively for files, symbols, functions, or variables. Use this for codebase discovery and read-only search instead of asking for a terminal command approval.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search text, symbol name, file name, or code concept to explore."
                        },
                        "maxResults": {
                            "type": "number",
                            "description": "Optional upper bound for returned files, from 1 to 20."
                        }
                    },
                    "required": ["query"]
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
                "description": "Propose a terminal command to the user for approval and execution.",
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
