use crate::chat::types::*;
use crate::chat::message_time::timeline_message_time;

pub fn time_from_message(message: &ChatMessage) -> u64 {
    timeline_message_time(message)
}

pub fn time_from_block(block: &TerminalCommandBlock) -> u64 {
    if let Ok(started_at) = block.started_at.parse::<u64>() {
        return started_at;
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&block.started_at) {
        return dt.timestamp_millis() as u64;
    }
    if let Some(ref finished_at) = block.finished_at {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(finished_at) {
            return dt.timestamp_millis() as u64;
        }
    }
    let id_parts: Vec<&str> = block.id.split('-').collect();
    if let Some(last) = id_parts.last() {
        if let Ok(ts) = last.parse::<u64>() {
            return ts;
        }
    }
    u64::MAX
}

pub fn should_render_collapsed_block(
    block: &TerminalCommandBlock,
    is_expanded: bool,
    is_selected: bool,
) -> bool {
    if matches!(block.presentation, TerminalCommandPresentation::ConversationLink) {
        return true;
    }
    let failed = block.status == "finished" 
        && block.exit_code.is_some() 
        && block.exit_code.unwrap() != 0;
    let succeeded = block.status == "finished" && !failed;
    succeeded 
        && !matches!(block.source, TerminalCommandSource::User)
        && !is_expanded 
        && !is_selected
}

pub fn build_timeline_items(
    messages: &[ChatMessage],
    terminal_blocks: &[TerminalCommandBlock],
    terminal_error: Option<&str>,
) -> Vec<TimelineItem> {
    let mut items: Vec<TimelineItem> = Vec::new();
    let message_order: std::collections::HashMap<String, usize> = messages
        .iter()
        .enumerate()
        .map(|(i, m)| (m.id.clone(), i))
        .collect();
    
    // Message items
    for (order, message) in messages.iter().enumerate() {
        let should_include = match message.role {
            MessageRole::Tool => {
                if matches!(message.tool_kind, Some(ToolKind::Command)) {
                    parse_terminal_command_tool_message(message).is_none()
                } else if matches!(message.tool_kind, Some(ToolKind::FileRead)) {
                    false
                } else {
                    true
                }
            }
            MessageRole::Assistant => {
                let visible_body = visible_chat_message_body(&message.body);
                let is_streaming_hint = message.is_streaming && visible_body.trim().is_empty();
                let has_diffs = message.file_diffs.as_ref().map(|d| !d.is_empty()).unwrap_or(false);
                if visible_body.trim().is_empty() && !is_streaming_hint && !has_diffs {
                    false
                } else {
                    true
                }
            }
            _ => true,
        };
        
        if should_include {
            let msg_idx = message_order.get(&message.id).copied().unwrap_or(order);
            items.push(TimelineItem {
                id: message.id.clone(),
                kind: TimelineItemKind::Message,
                at: time_from_message(message),
                order: msg_idx,
                message: Some(message.clone()),
                block: None,
                agent_block: None,
                error: None,
            });
        }
    }
    
    // Terminal block items
    for (order, block) in terminal_blocks.iter().enumerate() {
        items.push(TimelineItem {
            id: block.id.clone(),
            kind: TimelineItemKind::TerminalBlock,
            at: time_from_block(block),
            order: messages.len() + order,
            message: None,
            block: Some(block.clone()),
            agent_block: None,
            error: None,
        });
    }
    
    // Terminal error item
    if let Some(error) = terminal_error {
        items.push(TimelineItem {
            id: "terminal-error".to_string(),
            kind: TimelineItemKind::TerminalError,
            at: u64::MAX,
            order: messages.len() + terminal_blocks.len(),
            message: None,
            block: None,
            agent_block: None,
            error: Some(error.to_string()),
        });
    }
    
    items.sort_by(|a, b| {
        if a.at != b.at {
            a.at.cmp(&b.at)
        } else {
            a.order.cmp(&b.order)
        }
    });
    
    items
}

fn visible_chat_message_body(body: &str) -> String {
    let mut result = body.to_string();
    let re = regex::Regex::new(r"<thinking>[\s\S]*?</thinking>").unwrap();
    result = re.replace_all(&result, " ").to_string();
    let re2 = regex::Regex::new(r"<thinking>[\s\S]*$").unwrap();
    result = re2.replace_all(&result, "").to_string();
    result = result.replace("\r\n", "\n").replace('\r', "\n");
    result = regex::Regex::new(r"[ \t]{2,}").unwrap().replace_all(&result, " ").to_string();
    result = regex::Regex::new(r"\n{3,}").unwrap().replace_all(&result, "\n\n").to_string();
    result.trim().to_string()
}

#[derive(Debug, Clone)]
struct ParsedTerminalToolMessage {
    pub command: String,
    pub exit_code: Option<i32>,
    pub failed: bool,
    pub output: String,
}

fn parse_terminal_command_tool_message(message: &ChatMessage) -> Option<ParsedTerminalToolMessage> {
    let body = &message.body;
    if !body.contains("[Terminal command result]") {
        return None;
    }
    let re_cmd = regex::Regex::new(r"^COMMAND:\s*(.+)$").unwrap();
    let re_exit = regex::Regex::new(r"^EXIT_CODE:\s*(.+)$").unwrap();
    let re_status = regex::Regex::new(r"^STATUS:\s*(.+)$").unwrap();
    let re_output = regex::Regex::new(r"^OUTPUT:\n([\s\S]*?)(?:\n\[Invisible harness instruction\]|$)").unwrap();
    
    let command = re_cmd.captures(body).and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_string())?;
    let exit_code_raw = re_exit.captures(body).and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_lowercase()).unwrap_or_else(|| "unknown".to_string());
    let exit_code = if exit_code_raw == "unknown" {
        None
    } else {
        exit_code_raw.parse::<i32>().ok()
    };
    let output = re_output.captures(body).and_then(|c| c.get(1)).map(|m| m.as_str().trim_end().to_string()).unwrap_or_default();
    let status = re_status.captures(body).and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_lowercase());
    let failed = status.as_ref().map(|s| s == "failed").unwrap_or(false) 
        || exit_code.map(|e| e != 0).unwrap_or(false);
    
    Some(ParsedTerminalToolMessage {
        command,
        exit_code,
        failed,
        output,
    })
}
