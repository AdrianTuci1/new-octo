use std::collections::HashSet;
use crate::chat::types::{ChatMessage, MessageRole, CommandApproval, MessageBubbleViewModel};

pub struct FileProposalState {
    emitted_ids: HashSet<String>,
}

impl Default for FileProposalState {
    fn default() -> Self {
        Self {
            emitted_ids: HashSet::new(),
        }
    }
}

impl FileProposalState {
    pub fn check_and_emit(
        &mut self,
        message: &ChatMessage,
        view_model: &MessageBubbleViewModel,
    ) -> Option<CommandApproval> {
        if message.role != MessageRole::Assistant || message.is_streaming {
            return None;
        }
        if message.file_diffs.as_ref().map(|d| !d.is_empty()).unwrap_or(false) {
            return None;
        }
        if self.emitted_ids.contains(&message.id) {
            return None;
        }
        
        if let Some(ref approval) = view_model.inline_file_change_approval {
            self.emitted_ids.insert(message.id.clone());
            return Some(approval.clone());
        }
        
        if view_model.extracted_file_diffs.is_empty() {
            return None;
        }
        
        self.emitted_ids.insert(message.id.clone());
        let count = view_model.extracted_file_diffs.len();
        Some(CommandApproval {
            kind: "file-change".to_string(),
            command: None,
            summary: Some(format!(
                "Review proposed changes across {} {}",
                count,
                if count == 1 { "file" } else { "files" }
            )),
            file_diffs: Some(view_model.extracted_file_diffs.clone()),
            tool_call_id: None,
        })
    }
}
