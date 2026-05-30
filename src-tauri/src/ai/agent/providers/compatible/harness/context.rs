use serde_json::{json, Value};
use std::{fs, path::Path};

use crate::ai::agent::harness::AgentHarnessContext;
use crate::ai::agent::runtime::AgentLoopRuntime;
use crate::ai::agent::types::AgentInputMessage;
use crate::code_index;

use super::super::{prompt, skills};

pub(super) fn build_chat_messages(
    context: &AgentHarnessContext,
    runtime: &AgentLoopRuntime,
) -> Vec<Value> {
    let mut messages = Vec::new();
    let cwd = context.cwd.as_deref().unwrap_or("unknown");

    let injected_skills_text = skills::load_skills_instructions(&context.prompt, &context.messages);

    let mut system_prompt =
        prompt::build_identity_prompt(cwd, &context.target_os, &context.target_arch);
    if !injected_skills_text.is_empty() {
        system_prompt.push_str(
            "\n\n[INFORMATIE INVIZIBILA PENTRU UTILIZATOR - SKILL-URI INVOCATE SI ACTIVE]",
        );
        system_prompt.push_str("\nUrmatoarele instructiuni de specialitate sunt active deoarece utilizatorul a invocat skill-ul respectiv:");
        system_prompt.push_str(&injected_skills_text);
    }

    messages.push(json!({
        "role": "system",
        "content": system_prompt
    }));

    messages.push(json!({
        "role": "system",
        "content": prompt::build_stage_prompt(runtime.current_stage())
    }));

    if let Some(terminal_context) = build_terminal_context_message(context) {
        messages.push(json!({
            "role": "system",
            "content": terminal_context
        }));
    }

    if let Some(workspace_context) = build_workspace_context_message(cwd) {
        messages.push(json!({
            "role": "system",
            "content": workspace_context
        }));
    }

    if let Some(index_context) = code_index::code_index_context_for_cwd(cwd, &context.prompt, 10) {
        messages.push(json!({
            "role": "system",
            "content": index_context
        }));
    }

    for message in context.messages.iter().filter_map(sanitize_message) {
        let mut api_message = json!({
            "role": message.role,
            "content": message.content,
        });

        if let Some(tool_call_id) = message.tool_call_id {
            if let Some(object) = api_message.as_object_mut() {
                object.insert("tool_call_id".to_string(), json!(tool_call_id));
            }
        }

        if let Some(tool_calls) = message.tool_calls {
            if let Some(object) = api_message.as_object_mut() {
                object.insert("tool_calls".to_string(), tool_calls);
            }
        }

        messages.push(api_message);
    }

    if !context.prompt.trim().is_empty() {
        messages.push(json!({
            "role": "user",
            "content": context.prompt,
        }));
    }

    messages
}

fn build_workspace_context_message(cwd: &str) -> Option<String> {
    if cwd.trim().is_empty() || cwd == "unknown" {
        return None;
    }

    let home_dir = std::env::var("HOME").ok();
    let is_broad_cwd = home_dir.as_deref().map(|home| cwd == home).unwrap_or(false)
        || Path::new(cwd).components().count() <= 3;
    let entries = fs::read_dir(cwd).ok()?;
    let mut names = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.trim().is_empty() {
                return None;
            }

            let suffix = entry
                .file_type()
                .ok()
                .filter(|file_type| file_type.is_dir())
                .map(|_| "/")
                .unwrap_or("");
            Some(format!("{file_name}{suffix}"))
        })
        .collect::<Vec<_>>();

    if names.is_empty() {
        return None;
    }

    names.sort_unstable();
    let max_entries = if is_broad_cwd { 12 } else { 24 };
    if names.len() > max_entries {
        names.truncate(max_entries);
        names.push("...".to_string());
    }

    Some(format!(
        "CONTEXT WORKSPACE:\n- cwd: {cwd}\n- top-level entries:\n{}\
        \nREGULĂ PATH: tratează cwd ca rădăcina operațiunilor locale. În `propose_file_change`, folosește path-uri relative la cwd pentru fișiere de proiect. Dacă vrei să citești un fișier anume, folosește `read_workspace_file`. Dacă vrei să listezi, să cauți semantic simboluri, să afli definitions/references sau să vezi diagnostics în proiect, folosește `explore_workspace` cu `mode` potrivit. Nu presupune că un subdirector vizibil este proiectul corect fără un pas explicit de listare sau căutare.",
        indent_block(&names.join("\n"), 2)
    ))
}

fn build_terminal_context_message(context: &AgentHarnessContext) -> Option<String> {
    let finished_blocks = context
        .terminal_blocks
        .iter()
        .rev()
        .filter(|block| block.status.as_deref() == Some("finished") || block.finished_at.is_some())
        .take(6)
        .collect::<Vec<_>>();

    if finished_blocks.is_empty() {
        return None;
    }

    let mut lines = vec![
        "CONTEXT TERMINAL RECENT:".to_string(),
        "Utilizatorul vede deja output-ul brut în UI, dar aici ai o versiune compactă ca să poți înțelege exact ce s-a întâmplat.".to_string(),
    ];

    for block in finished_blocks.into_iter().rev() {
        let status = block
            .status
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("finished");
        let exit_code = block
            .exit_code
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let output = summarize_output(&block.output);
        lines.push(format!(
            "- command: {}\n  status: {}\n  exit_code: {}\n  output:\n{}",
            block.command,
            status,
            exit_code,
            indent_block(&output, 4)
        ));
    }

    Some(lines.join("\n"))
}

fn indent_block(text: &str, spaces: usize) -> String {
    let prefix = " ".repeat(spaces);
    text.lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn summarize_output(output: &str) -> String {
    let lines = output.lines().collect::<Vec<_>>();
    if lines.len() <= 10 {
        return output.to_string();
    }

    let omitted = lines.len().saturating_sub(10);
    let mut summary = lines
        .iter()
        .take(5)
        .map(|line| (*line).to_string())
        .collect::<Vec<_>>();
    summary.push(format!("... ({omitted} lines omitted) ..."));
    summary.extend(
        lines
            .iter()
            .skip(lines.len().saturating_sub(5))
            .map(|line| (*line).to_string()),
    );
    summary.join("\n")
}

fn sanitize_message(message: &AgentInputMessage) -> Option<AgentInputMessage> {
    let role = match message.role.as_str() {
        "system" | "user" | "assistant" | "tool" => message.role.clone(),
        _ => return None,
    };

    if message.content.trim().is_empty() && message.tool_calls.is_none() && role != "tool" {
        return None;
    }

    Some(AgentInputMessage {
        role,
        content: message.content.to_string(),
        tool_call_id: message.tool_call_id.clone(),
        tool_calls: message
            .tool_calls
            .as_ref()
            .map(normalize_outbound_tool_calls),
    })
}

pub(super) fn extract_recent_workspace_local_match_paths(
    context: &AgentHarnessContext,
) -> Vec<String> {
    let mut matches = Vec::new();

    for message in context
        .messages
        .iter()
        .rev()
        .filter(|message| message.role == "tool")
        .take(8)
    {
        if !message
            .content
            .contains("Local matches found in the current directory")
        {
            continue;
        }

        let mut inside_files_block = false;
        for line in message.content.lines() {
            let trimmed = line.trim();
            if trimmed == "Files:" {
                inside_files_block = true;
                continue;
            }

            if !inside_files_block {
                continue;
            }

            if trimmed.is_empty()
                || trimmed.starts_with("Directories:")
                || trimmed.starts_with("Search warnings:")
                || trimmed.starts_with("Filtered ")
                || trimmed.starts_with("Searched for ")
            {
                break;
            }

            if let Some(path) = trimmed.strip_prefix("- ") {
                let normalized = path.trim().to_string();
                if !normalized.is_empty() && !matches.contains(&normalized) {
                    matches.push(normalized);
                }
            }
        }
    }

    matches.reverse();
    matches
}

pub(super) fn guardian_intercepted_tool_calls(command: &str) -> Value {
    json!([{
        "id": "guardian-intercepted-id",
        "type": "function",
        "function": {
            "name": "propose_terminal_command",
            "arguments": serde_json::to_string(&json!({
                "command": command,
            }))
            .expect("guardian intercepted command arguments should serialize"),
        }
    }])
}

pub(super) fn normalize_outbound_tool_calls(tool_calls: &Value) -> Value {
    let Some(calls) = tool_calls.as_array() else {
        return tool_calls.clone();
    };

    Value::Array(
        calls
            .iter()
            .map(normalize_outbound_tool_call)
            .collect::<Vec<_>>(),
    )
}

fn normalize_outbound_tool_call(tool_call: &Value) -> Value {
    let Some(object) = tool_call.as_object() else {
        return tool_call.clone();
    };

    let mut normalized = object.clone();
    if let Some(function) = normalized
        .get_mut("function")
        .and_then(Value::as_object_mut)
    {
        if let Some(arguments) = function.get_mut("arguments") {
            if !arguments.is_string() {
                *arguments = Value::String(
                    serde_json::to_string(arguments)
                        .expect("tool call arguments should serialize to JSON string"),
                );
            }
        }
    }

    Value::Object(normalized)
}
