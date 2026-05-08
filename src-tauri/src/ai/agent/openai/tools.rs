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
                "name": "suggest_follow_up",
                "description": "Attach one natural-language follow-up prompt suggestion for the UI chip. This is metadata only; it is not visible assistant text and it is not a command.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "label": {
                            "type": "string",
                            "description": "Short chip text, at most 10 words. It must be a concrete next prompt, not a topic."
                        },
                        "prompt": {
                            "type": "string",
                            "description": "The exact natural-language user message to insert if the user accepts the suggestion."
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
