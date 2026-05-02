#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ArtifactKind {
    Text,
    Markdown,
    Json,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactRecord {
    pub id: String,
    pub run_id: String,
    pub label: String,
    pub kind: ArtifactKind,
    pub created_at: DateTime<Utc>,
    pub path: Option<String>,
    pub mime_type: Option<String>,
    pub content: Option<String>,
}

impl ArtifactRecord {
    pub fn inline_text(
        id: impl Into<String>,
        run_id: impl Into<String>,
        label: impl Into<String>,
        content: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            run_id: run_id.into(),
            label: label.into(),
            kind: ArtifactKind::Text,
            created_at: Utc::now(),
            path: None,
            mime_type: Some("text/plain".to_string()),
            content: Some(content.into()),
        }
    }
}
