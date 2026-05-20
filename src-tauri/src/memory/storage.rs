use std::{fs, path::Path};

use chrono::Utc;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub fn read_json_or_default<T>(path: &Path) -> Option<T>
where
    T: DeserializeOwned,
{
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

pub(crate) fn write_json_atomic<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create parent directory: {error}"))?;
    }

    let temp_path = path.with_extension(format!("tmp-{}", Uuid::new_v4()));
    let contents = serde_json::to_string_pretty(value)
        .map_err(|error| format!("failed to serialize memory record: {error}"))?;
    fs::write(&temp_path, contents)
        .map_err(|error| format!("failed to write temporary memory record: {error}"))?;
    fs::rename(&temp_path, path)
        .map_err(|error| format!("failed to replace memory record atomically: {error}"))?;

    Ok(())
}

pub(crate) fn merge_values(left: Value, right: Value) -> Value {
    match (left, right) {
        (Value::Object(mut left_map), Value::Object(right_map)) => {
            for (key, value) in right_map {
                let existing = left_map.remove(&key).unwrap_or(Value::Null);
                left_map.insert(key, merge_values(existing, value));
            }
            Value::Object(left_map)
        }
        (_, right) => right,
    }
}

pub(crate) fn relative_time_label(updated_at: &str) -> String {
    let Ok(updated_at) = chrono::DateTime::parse_from_rfc3339(updated_at) else {
        return "recently".to_string();
    };
    let elapsed = Utc::now().signed_duration_since(updated_at.with_timezone(&Utc));
    if elapsed.num_minutes() < 1 {
        return "just now".to_string();
    }
    if elapsed.num_hours() < 1 {
        return format!("{}m ago", elapsed.num_minutes());
    }
    if elapsed.num_days() < 1 {
        return format!("{}h ago", elapsed.num_hours());
    }
    format!("{}d ago", elapsed.num_days())
}

pub(crate) fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }

    let mut truncated = value
        .chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>();
    truncated.push_str("...");
    truncated
}

pub(crate) fn safe_file_component(value: &str) -> String {
    let safe = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();

    if safe.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        safe
    }
}

pub(crate) fn now_string() -> String {
    Utc::now().to_rfc3339()
}
