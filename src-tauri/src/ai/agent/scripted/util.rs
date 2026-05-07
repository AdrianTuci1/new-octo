use super::super::harness::AgentHarnessOutcome;
use super::super::types::{AgentRunStatus, AgentUsage};

pub fn cancelled_outcome(prompt: &str, streamed: &str) -> AgentHarnessOutcome {
    AgentHarnessOutcome {
        status: AgentRunStatus::Cancelled,
        usage: AgentUsage::approximate(prompt, streamed),
    }
}

pub fn compact_prompt(prompt: &str) -> String {
    const MAX_CHARS: usize = 80;

    let mut compact = prompt.chars().take(MAX_CHARS).collect::<String>();
    if prompt.chars().count() > MAX_CHARS {
        compact.push_str("...");
    }
    compact.replace('`', "'")
}

pub fn approval_reason(command: &str) -> &'static str {
    let normalized = command.trim().to_lowercase();

    if normalized.starts_with("git status") {
        return "Am cerut accesul pentru verificarea statusului repository-ului.";
    }

    "Am cerut accesul pentru a rula o comandă în terminal și a verifica rezultatul."
}

pub fn response_chunks(response: &str, max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    for ch in response.chars() {
        current.push(ch);
        if current.chars().count() >= max_chars || ch == '\n' {
            chunks.push(std::mem::take(&mut current));
        }
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}
