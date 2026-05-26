#![allow(dead_code)]

use crate::octomus_paths::OctomusPaths;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{collections::BTreeMap, fs};

mod runtime;
pub use runtime::{call_openai_mcp_tool, mcp_build_openai_tool_definitions};

#[tauri::command]
pub async fn mcp_list_runtime_tools() -> Result<Vec<runtime::McpRuntimeToolSummary>, String> {
    runtime::mcp_list_runtime_tools().await
}

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub transport: String,
    pub status: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env_keys: Vec<String>,
    pub header_keys: Vec<String>,
    pub source: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerUpsertRequest {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub transport: String,
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    pub url: Option<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRemoveRequest {
    pub id: String,
}

#[tauri::command]
pub fn mcp_list_servers() -> Result<Vec<McpServerSummary>, String> {
    let config = read_mcp_config()?;
    let Some(servers) = config.get("mcpServers").and_then(Value::as_object) else {
        return Ok(Vec::new());
    };

    let mut summaries = servers
        .iter()
        .map(|(name, value)| summarize_server(name, value))
        .collect::<Vec<_>>();
    summaries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(summaries)
}

#[tauri::command]
pub fn mcp_upsert_server(request: McpServerUpsertRequest) -> Result<McpServerSummary, String> {
    let name = request.name.trim();
    if name.is_empty() {
        return Err("MCP server name cannot be empty".to_string());
    }

    let transport = normalize_transport(&request.transport)?;
    let command = request.command.as_deref().unwrap_or("").trim().to_string();
    let url = request.url.as_deref().unwrap_or("").trim().to_string();

    if transport == "cli" && command.is_empty() {
        return Err("CLI MCP servers need a command.".to_string());
    }

    if transport == "sse" && !is_valid_url(&url) {
        return Err("Remote MCP servers need an http(s) URL.".to_string());
    }

    let mut config = read_mcp_config()?;
    ensure_config_shape(&mut config);
    let servers = config
        .get_mut("mcpServers")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Invalid MCP config shape.".to_string())?;
    let existing_server = request
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .and_then(|id| servers.get(id))
        .or_else(|| servers.get(name))
        .cloned();

    if let Some(previous_id) = request
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        if previous_id != name {
            servers.remove(previous_id);
        }
    }

    let mut server = Map::new();
    if transport == "cli" {
        server.insert("command".to_string(), Value::String(command));
        if !request.args.is_empty() {
            server.insert(
                "args".to_string(),
                Value::Array(
                    request
                        .args
                        .iter()
                        .map(|arg| arg.trim())
                        .filter(|arg| !arg.is_empty())
                        .map(|arg| Value::String(arg.to_string()))
                        .collect(),
                ),
            );
        }
        let env = merge_env_with_existing(&request.env, existing_server.as_ref());
        if !env.is_empty() {
            server.insert("env".to_string(), json!(env));
        }
    } else {
        server.insert("url".to_string(), Value::String(url));
        let headers =
            merge_secret_map_with_existing(&request.headers, existing_server.as_ref(), "headers");
        if !headers.is_empty() {
            server.insert("headers".to_string(), json!(headers));
        }
    }

    if request.disabled {
        server.insert("disabled".to_string(), Value::Bool(true));
    }

    if let Some(description) = request
        .description
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        server.insert(
            "_octomusDescription".to_string(),
            Value::String(description.to_string()),
        );
    }

    let inserted = Value::Object(server);
    servers.insert(name.to_string(), inserted.clone());
    write_mcp_config(&config)?;
    Ok(summarize_server(name, &inserted))
}

#[tauri::command]
pub fn mcp_remove_server(request: McpRemoveRequest) -> Result<(), String> {
    let mut config = read_mcp_config()?;
    ensure_config_shape(&mut config);
    let servers = config
        .get_mut("mcpServers")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Invalid MCP config shape.".to_string())?;
    servers.remove(request.id.trim());
    write_mcp_config(&config)
}

pub(super) fn read_mcp_config() -> Result<Value, String> {
    let paths = OctomusPaths::default();
    paths.ensure_layout()?;
    let contents = fs::read_to_string(paths.mcp_config_path())
        .map_err(|error| format!("failed to read MCP config: {error}"))?;
    let mut config: Value = serde_json::from_str(&contents)
        .map_err(|error| format!("failed to parse MCP config JSON: {error}"))?;
    ensure_config_shape(&mut config);
    Ok(config)
}

fn write_mcp_config(config: &Value) -> Result<(), String> {
    let paths = OctomusPaths::default();
    paths.ensure_layout()?;
    let path = paths.mcp_config_path();
    let contents = serde_json::to_string_pretty(config)
        .map_err(|error| format!("failed to serialize MCP config: {error}"))?;
    fs::write(path, format!("{contents}\n"))
        .map_err(|error| format!("failed to write MCP config: {error}"))
}

pub(super) fn ensure_config_shape(config: &mut Value) {
    if !config.is_object() {
        *config = json!({});
    }

    let object = config.as_object_mut().expect("config is object");
    if !object.get("mcpServers").is_some_and(Value::is_object) {
        object.insert("mcpServers".to_string(), json!({}));
    }
}

fn summarize_server(name: &str, value: &Value) -> McpServerSummary {
    let object = value.as_object();
    let command = object
        .and_then(|object| object.get("command"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let url = object
        .and_then(|object| object.get("url"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let args = object
        .and_then(|object| object.get("args"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let env_keys = object
        .and_then(|object| object.get("env"))
        .and_then(Value::as_object)
        .map(|env| env.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    let header_keys = object
        .and_then(|object| object.get("headers"))
        .and_then(Value::as_object)
        .map(|headers| headers.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    let description = object
        .and_then(|object| object.get("_octomusDescription"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| default_description(command.as_deref(), url.as_deref()));
    let disabled = object
        .and_then(|object| object.get("disabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    McpServerSummary {
        id: name.to_string(),
        name: name.to_string(),
        description,
        transport: if url.is_some() { "sse" } else { "cli" }.to_string(),
        status: if disabled { "disabled" } else { "configured" }.to_string(),
        command,
        args,
        url,
        env_keys,
        header_keys,
        source: OctomusPaths::default()
            .mcp_config_path()
            .display()
            .to_string(),
    }
}

fn merge_env_with_existing(
    requested_env: &BTreeMap<String, String>,
    existing_server: Option<&Value>,
) -> BTreeMap<String, String> {
    merge_secret_map_with_existing(requested_env, existing_server, "env")
}

pub(super) fn merge_secret_map_with_existing(
    requested_values: &BTreeMap<String, String>,
    existing_server: Option<&Value>,
    key: &str,
) -> BTreeMap<String, String> {
    let existing_values = existing_server
        .and_then(Value::as_object)
        .and_then(|object| object.get(key))
        .and_then(Value::as_object);

    if requested_values.is_empty() {
        return existing_values
            .map(|env| {
                env.iter()
                    .filter_map(|(key, value)| {
                        value.as_str().map(|value| (key.clone(), value.to_string()))
                    })
                    .collect()
            })
            .unwrap_or_default();
    }

    requested_values
        .iter()
        .map(|(key, value)| {
            let next_value = if value.is_empty() {
                existing_values
                    .and_then(|env| env.get(key))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string()
            } else {
                value.clone()
            };
            (key.clone(), next_value)
        })
        .collect()
}

fn default_description(command: Option<&str>, url: Option<&str>) -> String {
    if let Some(url) = url {
        return format!("Remote MCP server at {url}");
    }

    if let Some(command) = command {
        return format!("CLI server launched with `{command}`.");
    }

    "MCP server configured locally.".to_string()
}

fn normalize_transport(input: &str) -> Result<&'static str, String> {
    match input.trim().to_lowercase().as_str() {
        "cli" | "stdio" | "cli_server" | "cliserver" => Ok("cli"),
        "sse" | "http" | "sse_server" | "sseserver" => Ok("sse"),
        _ => Err("MCP transport must be either CLI or SSE.".to_string()),
    }
}

fn is_valid_url(input: &str) -> bool {
    input.starts_with("http://") || input.starts_with("https://")
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
