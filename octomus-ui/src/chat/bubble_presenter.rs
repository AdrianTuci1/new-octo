use crate::chat::types::{ChatMessage, FileDiff, FileDiffPreviewStatus, MessageRole, CommandApproval};
use crate::chat::file_proposals::extract_file_proposal_from_markdown;

#[derive(Debug, Clone)]
pub struct MessageBubbleViewModel {
    pub display_file_diffs: Vec<FileDiff>,
    pub extracted_file_diffs: Vec<FileDiff>,
    pub file_preview_status: FileDiffPreviewStatus,
    pub inline_file_change_approval: Option<CommandApproval>,
    pub is_user: bool,
    pub raw_visible_body: String,
    pub show_streaming_hint: bool,
    pub visible_body: String,
}

pub struct MessageBubblePresenter;

impl MessageBubblePresenter {
    pub fn create(message: &ChatMessage) -> MessageBubbleViewModel {
        let is_assistant = message.role == MessageRole::Assistant;
        let raw_visible_body_with_artifacts = if is_assistant {
            visible_chat_message_body(&message.body)
        } else {
            message.body.clone()
        };
        
        let should_extract_final_assistant_artifacts = is_assistant && !message.is_streaming;
        let inline_file_change_approval = if should_extract_final_assistant_artifacts {
            extract_inline_file_change_approval(&message.body).approval
        } else {
            None
        };
        
        let extracted_file_proposal = if should_extract_final_assistant_artifacts {
            extract_file_proposal_from_markdown(&raw_visible_body_with_artifacts)
        } else {
            (raw_visible_body_with_artifacts.clone(), Vec::new())
        };
        
        let display_file_diffs = if let Some(ref diffs) = message.file_diffs {
            if !diffs.is_empty() {
                diffs.clone()
            } else {
                extracted_file_proposal.1.clone()
            }
        } else {
            extracted_file_proposal.1.clone()
        };
        
        let file_preview_status = message.file_change_status.clone().unwrap_or_else(|| {
            if matches!(message.tool_kind, Some(crate::chat::types::ToolKind::FileChange)) {
                FileDiffPreviewStatus::Accepted
            } else if !display_file_diffs.is_empty() {
                FileDiffPreviewStatus::Pending
            } else {
                FileDiffPreviewStatus::Pending
            }
        });
        
        let visible_body = extracted_file_proposal.0;
        let show_streaming_hint = is_assistant 
&& message.is_streaming 
&& visible_body.trim().is_empty() 
&& !message.has_native_thinking;
        
        MessageBubbleViewModel {
            display_file_diffs,
            extracted_file_diffs: extracted_file_proposal.1,
            file_preview_status,
            inline_file_change_approval,
            is_user: message.role == MessageRole::User,
            raw_visible_body: visible_body.clone(),
            show_streaming_hint,
            visible_body,
        }
    }
}

fn visible_chat_message_body(body: &str) -> String {
    // Simplified: strip thinking blocks and harness artifacts
    let mut result = body.to_string();
    // Strip <thinking> blocks
    let re = regex::Regex::new(r"<thinking>[\s\S]*?</thinking>").unwrap();
    result = re.replace_all(&result, " ").to_string();
    let re2 = regex::Regex::new(r"<thinking>[\s\S]*$").unwrap();
    result = re2.replace_all(&result, "").to_string();
    // Strip harness protocol artifacts
    let re3 = regex::Regex::new(r"<\|channel\>\s*thought(?!plan)\s*<\s*channel\|\s*>").unwrap();
    result = re3.replace_all(&result, " ").to_string();
    result = result.replace("\r\n", "\n").replace('\r', "\n");
    result = regex::Regex::new(r"[ \t]{2,}").unwrap().replace_all(&result, " ").to_string();
    result = regex::Regex::new(r"\n{3,}").unwrap().replace_all(&result, "\n\n").to_string();
    result.trim().to_string()
}

fn extract_inline_file_change_approval(raw: &str) -> ExtractFileChangeResult {
    let re = regex::Regex::new(r"(?:<tool_call\|>\s*)?propose_file_change\s*\{").unwrap();
    if let Some(mat) = re.find(raw) {
        let start_index = mat.start();
        let brace_index = raw[start_index..].find('{').map(|i| start_index + i).unwrap_or(start_index);
        // Simplified extraction
        ExtractFileChangeResult {
            visible_body: raw[..start_index].trim_end().to_string(),
            pending_payload: raw[start_index..].to_string(),
            approval: Some(CommandApproval {
                kind: "file-change".to_string(),
                command: None,
                summary: Some("Review proposed changes".to_string()),
                file_diffs: None,
                tool_call_id: None,
            }),
        }
    } else {
        ExtractFileChangeResult {
            visible_body: raw.to_string(),
            pending_payload: String::new(),
            approval: None,
        }
    }
}

struct ExtractFileChangeResult {
    pub visible_body: String,
    pub pending_payload: String,
    pub approval: Option<CommandApproval>,
}
