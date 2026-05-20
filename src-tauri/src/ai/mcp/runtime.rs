use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap},
    path::PathBuf,
    sync::{Arc, LazyLock},
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStderr, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};

use super::read_mcp_config;

const MCP_PROTOCOL_VERSION: &str = "2024-11-05";
const MCP_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

static RUNTIME: LazyLock<McpRuntimeManager> = LazyLock::new(McpRuntimeManager::default);

#[derive(Debug, Clone)]
struct RuntimeServerConfig {
    id: String,
    name: String,
    command: Option<String>,
    args: Vec<String>,
    env: BTreeMap<String, String>,
    headers: BTreeMap<String, String>,
    working_directory: Option<PathBuf>,
    url: Option<String>,
    disabled: bool,
}

impl RuntimeServerConfig {
    fn fingerprint(&self) -> String {
        serde_json::to_string(&json!({
            "command": self.command,
            "args": self.args,
            "env": self.env,
            "headers": self.headers,
            "workingDirectory": self.working_directory,
            "url": self.url,
            "disabled": self.disabled
        }))
        .unwrap_or_else(|_| self.id.clone())
    }

    fn is_cli(&self) -> bool {
        self.command.as_deref().is_some_and(|command| !command.trim().is_empty())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRuntimeToolSummary {
    pub server_id: String,
    pub server_name: String,
    pub tool_name: String,
    pub openai_tool_name: String,
    pub description: String,
}

#[derive(Debug, Clone)]
struct McpToolRoute {
    server_id: String,
    server_name: String,
    tool_name: String,
}

#[derive(Default)]
struct McpRuntimeManager {
    sessions: Mutex<HashMap<String, Arc<Mutex<StdioMcpSession>>>>,
    routes: Mutex<HashMap<String, McpToolRoute>>,
}

struct StdioMcpSession {
    fingerprint: String,
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

impl Drop for StdioMcpSession {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

pub async fn mcp_list_runtime_tools() -> Result<Vec<McpRuntimeToolSummary>, String> {
    let definitions = mcp_build_openai_tool_definitions().await?;
    let routes = RUNTIME.routes.lock().await;

    Ok(definitions
        .iter()
        .filter_map(|definition| {
            let function = definition.get("function")?;
            let openai_tool_name = function.get("name")?.as_str()?.to_string();
            let route = routes.get(&openai_tool_name)?;
            let description = function
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            Some(McpRuntimeToolSummary {
                server_id: route.server_id.clone(),
                server_name: route.server_name.clone(),
                tool_name: route.tool_name.clone(),
                openai_tool_name,
                description,
            })
        })
        .collect())
}

pub async fn mcp_build_openai_tool_definitions() -> Result<Vec<Value>, String> {
    let configs = load_runtime_server_configs()?;
    let mut definitions = Vec::new();
    let mut routes = HashMap::new();

    for config in configs.into_iter().filter(|config| !config.disabled) {
        let tools = match list_tools_for_server(&config).await {
            Ok(tools) => tools,
            Err(error) => {
                eprintln!(
                    "[MCP] Failed to list tools for '{}': {}",
                    config.name, error
                );
                continue;
            }
        };

        for tool in tools {
            let Some(tool_name) = tool.get("name").and_then(Value::as_str) else {
                continue;
            };
            let openai_tool_name = unique_openai_tool_name(&config.id, tool_name, &routes);
            let description = tool
                .get("description")
                .and_then(Value::as_str)
                .filter(|description| !description.trim().is_empty())
                .map(|description| format!("MCP [{}]: {}", config.name, description.trim()))
                .unwrap_or_else(|| format!("MCP [{}]: call `{}`.", config.name, tool_name));
            let parameters = normalize_input_schema(
                tool.get("inputSchema")
                    .or_else(|| tool.get("input_schema"))
                    .cloned()
                    .unwrap_or_else(|| json!({ "type": "object", "properties": {} })),
            );

            definitions.push(json!({
                "type": "function",
                "function": {
                    "name": openai_tool_name,
                    "description": description,
                    "parameters": parameters
                }
            }));

            routes.insert(
                openai_tool_name,
                McpToolRoute {
                    server_id: config.id.clone(),
                    server_name: config.name.clone(),
                    tool_name: tool_name.to_string(),
                },
            );
        }
    }

    *RUNTIME.routes.lock().await = routes;
    Ok(definitions)
}

pub async fn call_openai_mcp_tool(openai_tool_name: &str, args: Value) -> Result<String, String> {
    let route = RUNTIME
        .routes
        .lock()
        .await
        .get(openai_tool_name)
        .cloned()
        .ok_or_else(|| format!("Unknown MCP tool `{openai_tool_name}`."))?;
    let config = load_runtime_server_configs()?
        .into_iter()
        .find(|config| config.id == route.server_id && !config.disabled)
        .ok_or_else(|| format!("MCP server `{}` is not configured.", route.server_name))?;

    let result = if config.is_cli() {
        let session = RUNTIME.get_or_spawn_stdio(&config).await?;
        let mut session = session.lock().await;
        session.call_tool(&route.tool_name, args).await?
    } else {
        call_http_mcp_tool(&config, &route.tool_name, args).await?
    };

    Ok(serde_json::to_string(&json!({
        "server": route.server_name,
        "tool": route.tool_name,
        "result": result
    }))
    .unwrap_or_else(|_| result.to_string()))
}

impl McpRuntimeManager {
    async fn get_or_spawn_stdio(
        &self,
        config: &RuntimeServerConfig,
    ) -> Result<Arc<Mutex<StdioMcpSession>>, String> {
        let fingerprint = config.fingerprint();

        if let Some(existing) = self.sessions.lock().await.get(&config.id).cloned() {
            if existing.lock().await.fingerprint == fingerprint {
                return Ok(existing);
            }
        }

        let session = Arc::new(Mutex::new(StdioMcpSession::spawn(config).await?));
        self.sessions
            .lock()
            .await
            .insert(config.id.clone(), session.clone());
        Ok(session)
    }
}

impl StdioMcpSession {
    async fn spawn(config: &RuntimeServerConfig) -> Result<Self, String> {
        let command = config
            .command
            .as_deref()
            .ok_or_else(|| format!("MCP server `{}` is missing a command.", config.name))?;
        let mut process = Command::new(command);
        process.args(&config.args);
        process.stdin(std::process::Stdio::piped());
        process.stdout(std::process::Stdio::piped());
        process.stderr(std::process::Stdio::piped());

        if let Some(cwd) = &config.working_directory {
            process.current_dir(cwd);
        }

        for (key, value) in &config.env {
            if !value.is_empty() {
                process.env(key, value);
            }
        }

        let mut child = process.spawn().map_err(|error| {
            format!(
                "Failed to spawn MCP server `{}` with command `{}`: {}",
                config.name, command, error
            )
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| format!("MCP server `{}` did not expose stdin.", config.name))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| format!("MCP server `{}` did not expose stdout.", config.name))?;

        if let Some(stderr) = child.stderr.take() {
            spawn_stderr_logger(config.name.clone(), stderr);
        }

        let mut session = Self {
            fingerprint: config.fingerprint(),
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 1,
        };
        session.initialize(&config.name).await?;
        Ok(session)
    }

    async fn initialize(&mut self, server_name: &str) -> Result<(), String> {
        let _ = self
            .request(
                "initialize",
                json!({
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {
                        "name": "Octomus",
                        "version": env!("CARGO_PKG_VERSION")
                    }
                }),
            )
            .await
            .map_err(|error| format!("Failed to initialize MCP server `{server_name}`: {error}"))?;
        self.notify("notifications/initialized", json!({})).await
    }

    async fn list_tools(&mut self) -> Result<Vec<Value>, String> {
        let result = self.request("tools/list", json!({})).await?;
        Ok(result
            .get("tools")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default())
    }

    async fn call_tool(&mut self, tool_name: &str, args: Value) -> Result<Value, String> {
        self.request(
            "tools/call",
            json!({
                "name": tool_name,
                "arguments": args
            }),
        )
        .await
    }

    async fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        let message = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        });
        self.write_message(&message).await
    }

    async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let message = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });
        self.write_message(&message).await?;

        tokio::time::timeout(MCP_REQUEST_TIMEOUT, self.read_response(id))
            .await
            .map_err(|_| format!("MCP request `{method}` timed out."))?
    }

    async fn write_message(&mut self, message: &Value) -> Result<(), String> {
        let payload = serde_json::to_string(message)
            .map_err(|error| format!("Failed to serialize MCP message: {error}"))?;
        self.stdin
            .write_all(payload.as_bytes())
            .await
            .map_err(|error| format!("Failed to write MCP message: {error}"))?;
        self.stdin
            .write_all(b"\n")
            .await
            .map_err(|error| format!("Failed to write MCP message delimiter: {error}"))?;
        self.stdin
            .flush()
            .await
            .map_err(|error| format!("Failed to flush MCP message: {error}"))
    }

    async fn read_response(&mut self, id: u64) -> Result<Value, String> {
        loop {
            let mut line = String::new();
            let bytes = self
                .stdout
                .read_line(&mut line)
                .await
                .map_err(|error| format!("Failed to read MCP response: {error}"))?;
            if bytes == 0 {
                return Err("MCP server closed stdout.".to_string());
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let message = serde_json::from_str::<Value>(trimmed)
                .map_err(|error| format!("Invalid MCP JSON-RPC response: {error}"))?;
            if message.get("id").and_then(Value::as_u64) != Some(id) {
                continue;
            }

            if let Some(error) = message.get("error") {
                return Err(format!("MCP server returned an error: {error}"));
            }

            return Ok(message.get("result").cloned().unwrap_or(Value::Null));
        }
    }
}

async fn list_tools_for_server(config: &RuntimeServerConfig) -> Result<Vec<Value>, String> {
    if config.is_cli() {
        let session = RUNTIME.get_or_spawn_stdio(config).await?;
        return session.lock().await.list_tools().await;
    }

    list_http_mcp_tools(config).await
}

async fn list_http_mcp_tools(config: &RuntimeServerConfig) -> Result<Vec<Value>, String> {
    let initialize = http_json_rpc(
        config,
        1,
        "initialize",
        json!({
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {
                "name": "Octomus",
                "version": env!("CARGO_PKG_VERSION")
            }
        }),
    )
    .await?;
    if initialize.get("error").is_some() {
        return Err(format!("HTTP MCP initialize failed: {initialize}"));
    }

    let result = http_json_rpc(config, 2, "tools/list", json!({})).await?;
    if let Some(error) = result.get("error") {
        return Err(format!("HTTP MCP tools/list failed: {error}"));
    }

    Ok(result
        .get("result")
        .and_then(|result| result.get("tools"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

async fn call_http_mcp_tool(
    config: &RuntimeServerConfig,
    tool_name: &str,
    args: Value,
) -> Result<Value, String> {
    let response = http_json_rpc(
        config,
        3,
        "tools/call",
        json!({
            "name": tool_name,
            "arguments": args
        }),
    )
    .await?;

    if let Some(error) = response.get("error") {
        return Err(format!("HTTP MCP tools/call failed: {error}"));
    }

    Ok(response.get("result").cloned().unwrap_or(Value::Null))
}

async fn http_json_rpc(
    config: &RuntimeServerConfig,
    id: u64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let url = config
        .url
        .as_deref()
        .ok_or_else(|| format!("MCP server `{}` is missing a URL.", config.name))?;
    let client = reqwest::Client::builder()
        .timeout(MCP_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to build MCP HTTP client: {error}"))?;
    let mut request = client.post(url);
    for (key, value) in &config.headers {
        if !value.is_empty() {
            request = request.header(key, value);
        }
    }
    let response = request
        .json(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        }))
        .send()
        .await
        .map_err(|error| format!("HTTP MCP request failed: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Failed to read HTTP MCP response: {error}"))?;
    if !status.is_success() {
        return Err(format!("HTTP MCP request returned {status}: {body}"));
    }

    serde_json::from_str::<Value>(&body)
        .map_err(|error| format!("HTTP MCP response was not JSON-RPC JSON: {error}"))
}

fn load_runtime_server_configs() -> Result<Vec<RuntimeServerConfig>, String> {
    let config = read_mcp_config()?;
    let Some(servers) = config.get("mcpServers").and_then(Value::as_object) else {
        return Ok(Vec::new());
    };

    Ok(servers
        .iter()
        .filter_map(|(id, value)| {
            let object = value.as_object()?;
            let command = object
                .get("command")
                .and_then(Value::as_str)
                .map(str::to_string);
            let url = object.get("url").and_then(Value::as_str).map(str::to_string);
            let args = object
                .get("args")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let env = object
                .get("env")
                .and_then(Value::as_object)
                .map(|env| {
                    env.iter()
                        .filter_map(|(key, value)| {
                            value.as_str().map(|value| (key.clone(), value.to_string()))
                        })
                        .collect::<BTreeMap<_, _>>()
                })
                .unwrap_or_default();
            let headers = object
                .get("headers")
                .and_then(Value::as_object)
                .map(|headers| {
                    headers
                        .iter()
                        .filter_map(|(key, value)| {
                            value.as_str().map(|value| (key.clone(), value.to_string()))
                        })
                        .collect::<BTreeMap<_, _>>()
                })
                .unwrap_or_default();
            let working_directory = object
                .get("working_directory")
                .or_else(|| object.get("workingDirectory"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .map(PathBuf::from);
            let disabled = object
                .get("disabled")
                .and_then(Value::as_bool)
                .unwrap_or(false);

            Some(RuntimeServerConfig {
                id: id.clone(),
                name: id.clone(),
                command,
                args,
                env,
                headers,
                working_directory,
                url,
                disabled,
            })
        })
        .collect())
}

fn normalize_input_schema(schema: Value) -> Value {
    if schema.is_object() {
        let mut schema = schema;
        if schema.get("type").is_none() {
            schema["type"] = Value::String("object".to_string());
        }
        return schema;
    }

    json!({
        "type": "object",
        "properties": {}
    })
}

fn unique_openai_tool_name(
    server_id: &str,
    tool_name: &str,
    existing: &HashMap<String, McpToolRoute>,
) -> String {
    let base = format!(
        "mcp__{}__{}",
        sanitize_tool_name(server_id),
        sanitize_tool_name(tool_name)
    );
    let base = truncate_tool_name(&base);
    if !existing.contains_key(&base) {
        return base;
    }

    for index in 2..100 {
        let suffix = format!("_{index}");
        let candidate = truncate_tool_name_with_suffix(&base, &suffix);
        if !existing.contains_key(&candidate) {
            return candidate;
        }
    }

    truncate_tool_name_with_suffix(&base, "_x")
}

fn sanitize_tool_name(input: &str) -> String {
    let mut output = input
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '_' || character == '-' {
                character.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>();

    while output.contains("__") {
        output = output.replace("__", "_");
    }

    output.trim_matches('_').to_string()
}

fn truncate_tool_name(input: &str) -> String {
    input.chars().take(64).collect()
}

fn truncate_tool_name_with_suffix(input: &str, suffix: &str) -> String {
    let max_base_len = 64usize.saturating_sub(suffix.len());
    format!("{}{}", input.chars().take(max_base_len).collect::<String>(), suffix)
}

fn spawn_stderr_logger(server_name: String, stderr: ChildStderr) {
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line).await {
                Ok(0) => return,
                Ok(_) => eprintln!("[MCP:{server_name}] stderr: {}", line.trim_end()),
                Err(error) => {
                    eprintln!("[MCP:{server_name}] failed to read stderr: {error}");
                    return;
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{sanitize_tool_name, unique_openai_tool_name, McpToolRoute};
    use std::collections::HashMap;

    #[test]
    fn sanitizes_openai_tool_names() {
        assert_eq!(sanitize_tool_name("GitHub MCP"), "github_mcp");
        assert_eq!(sanitize_tool_name("repo.search/issues"), "repo_search_issues");
    }

    #[test]
    fn generates_unique_tool_names() {
        let mut existing = HashMap::new();
        existing.insert(
            "mcp__github__search".to_string(),
            McpToolRoute {
                server_id: "github".to_string(),
                server_name: "github".to_string(),
                tool_name: "search".to_string(),
            },
        );

        assert_eq!(
            unique_openai_tool_name("github", "search", &existing),
            "mcp__github__search_2"
        );
    }
}
