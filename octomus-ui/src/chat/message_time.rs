use crate::chat::types::ChatMessage;

pub fn timeline_message_time(message: &ChatMessage) -> u64 {
    if let Some(ref created_at) = message.created_at {
        if let Ok(ts) = created_at.parse::<u64>() {
            return ts;
        }
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(created_at) {
            return dt.timestamp_millis() as u64;
        }
    }
    
    let id_parts: Vec<&str> = message.id.split('-').collect();
    if let Some(last) = id_parts.last() {
        if let Ok(ts) = last.parse::<u64>() {
            return ts;
        }
    }
    0
}
