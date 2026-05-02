#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum McpTransportKind {
    CliServer,
    SseServer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplatedMcpServer {
    pub name: String,
    pub transport: McpTransportKind,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub raw_json: String,
    pub template_variables: Vec<String>,
}

impl TemplatedMcpServer {
    pub fn from_json(name: impl Into<String>, raw_json: impl Into<String>) -> Self {
        let raw_json = raw_json.into();
        let transport = if raw_json.contains("\"url\"") {
            McpTransportKind::SseServer
        } else {
            McpTransportKind::CliServer
        };

        Self {
            name: name.into(),
            transport,
            command: None,
            args: Vec::new(),
            url: None,
            template_variables: extract_template_variables(&raw_json),
            raw_json,
        }
    }
}

pub fn extract_template_variables(input: &str) -> Vec<String> {
    let mut variables = Vec::new();
    let mut rest = input;

    while let Some(start) = rest.find("{{") {
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find("}}") else {
            break;
        };

        let variable = after_start[..end].trim();
        if !variable.is_empty() && !variables.iter().any(|existing| existing == variable) {
            variables.push(variable.to_string());
        }

        rest = &after_start[end + 2..];
    }

    variables
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_template_variables_without_duplicates() {
        let variables = extract_template_variables(
            r#"{"command":"npx","args":["{{TOKEN}}","{{ TOKEN }}","{{URL}}"]}"#,
        );
        assert_eq!(variables, vec!["TOKEN".to_string(), "URL".to_string()]);
    }
}
