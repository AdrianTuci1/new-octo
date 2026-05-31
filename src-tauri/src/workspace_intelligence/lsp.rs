use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use serde::Deserialize;
use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    time::timeout,
};
use walkdir::WalkDir;

use crate::terminal::fs::{discover_shell_command_names, resolve_request_path};

use super::{
    formatting::{
        diagnostic_severity_label, lsp_symbol_kind_label, semantic_title, snippet_for_file_line,
    },
    types::{ExplorationMode, SemanticMatch, SymbolTarget, WorkspaceLanguage},
};

const MAX_LSP_RESULTS: usize = 32;
const MAX_LANGUAGE_SCAN_FILES: usize = 1_200;
const MAX_DIAGNOSTIC_WAIT: Duration = Duration::from_millis(350);
const IGNORED_DIRS: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".turbo",
    ".venv",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LspSymbolInformation {
    name: String,
    kind: u32,
    location: LspLocation,
    container_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct LspLocation {
    uri: String,
    range: LspRange,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
struct LspRange {
    start: LspPosition,
    end: LspPosition,
}

#[derive(Debug, Clone, Deserialize)]
struct LspPosition {
    line: u32,
    character: u32,
}

#[derive(Debug, Clone, Deserialize)]
struct LspDiagnosticNotification {
    uri: String,
    diagnostics: Vec<LspDiagnostic>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LspDiagnostic {
    range: LspRange,
    severity: Option<u32>,
    message: String,
    source: Option<String>,
}

#[derive(Debug, Clone)]
struct ServerLaunchSpec {
    language: WorkspaceLanguage,
    command: String,
    args: Vec<String>,
}

#[derive(Debug)]
struct LspClient {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

impl LspClient {
    async fn connect(spec: &ServerLaunchSpec, root_path: &Path) -> Result<Self, String> {
        let mut child = Command::new(&spec.command)
            .args(&spec.args)
            .current_dir(root_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| {
                format!(
                    "failed to start {} for {}: {error}",
                    spec.command,
                    spec.language.label()
                )
            })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| format!("{} did not expose stdin", spec.command))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| format!("{} did not expose stdout", spec.command))?;

        let mut client = Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 1,
        };
        client.initialize(root_path).await?;
        Ok(client)
    }

    async fn initialize(&mut self, root_path: &Path) -> Result<(), String> {
        let root_uri = path_to_file_uri(root_path)?;
        let params = json!({
            "processId": null,
            "rootUri": root_uri,
            "capabilities": {
                "workspace": { "symbol": { "dynamicRegistration": false } },
                "textDocument": {
                    "publishDiagnostics": { "relatedInformation": true },
                    "definition": { "dynamicRegistration": false },
                    "references": { "dynamicRegistration": false },
                    "documentSymbol": { "dynamicRegistration": false }
                }
            },
            "clientInfo": {
                "name": "octomus-launcher",
                "version": "0.1.0"
            }
        });
        let _: Value = self.request("initialize", params).await?;
        self.notify("initialized", json!({})).await?;
        Ok(())
    }

    async fn shutdown(mut self) {
        let _ = self.request::<Value>("shutdown", Value::Null).await;
        let _ = self.notify("exit", Value::Null).await;
        let _ = self.child.kill().await;
    }

    async fn request<T: for<'de> Deserialize<'de>>(
        &mut self,
        method: &str,
        params: Value,
    ) -> Result<T, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.send_message(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }))
        .await?;

        loop {
            let message = self.read_message().await?;
            if let Some(response_id) = message.get("id").and_then(Value::as_u64) {
                if response_id != id {
                    continue;
                }

                if let Some(error) = message.get("error") {
                    let text = error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown LSP error");
                    return Err(format!("{method} failed: {text}"));
                }

                let result = message.get("result").cloned().unwrap_or(Value::Null);
                return serde_json::from_value(result)
                    .map_err(|error| format!("failed to decode {method} response: {error}"));
            }
        }
    }

    async fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        self.send_message(&json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }))
        .await
    }

    async fn collect_diagnostics(
        &mut self,
        target_uri: &str,
        wait_for: Duration,
    ) -> Result<Vec<LspDiagnostic>, String> {
        let mut diagnostics = Vec::new();
        loop {
            let next = timeout(wait_for, self.read_message()).await;
            let Ok(message_result) = next else {
                break;
            };
            let message = message_result?;
            let is_publish = message
                .get("method")
                .and_then(Value::as_str)
                .map(|value| value == "textDocument/publishDiagnostics")
                .unwrap_or(false);
            if !is_publish {
                continue;
            }

            let Some(params) = message.get("params").cloned() else {
                continue;
            };
            let notification: LspDiagnosticNotification = serde_json::from_value(params)
                .map_err(|error| format!("failed to decode diagnostics: {error}"))?;
            if notification.uri == target_uri {
                diagnostics = notification.diagnostics;
                break;
            }
        }
        Ok(diagnostics)
    }

    async fn send_message(&mut self, value: &Value) -> Result<(), String> {
        let encoded = serde_json::to_vec(value)
            .map_err(|error| format!("failed to encode LSP message: {error}"))?;
        let header = format!("Content-Length: {}\r\n\r\n", encoded.len());
        self.stdin
            .write_all(header.as_bytes())
            .await
            .map_err(|error| format!("failed to write LSP header: {error}"))?;
        self.stdin
            .write_all(&encoded)
            .await
            .map_err(|error| format!("failed to write LSP body: {error}"))?;
        self.stdin
            .flush()
            .await
            .map_err(|error| format!("failed to flush LSP request: {error}"))?;
        Ok(())
    }

    async fn read_message(&mut self) -> Result<Value, String> {
        let mut header = Vec::new();
        loop {
            let mut byte = [0_u8; 1];
            self.stdout
                .read_exact(&mut byte)
                .await
                .map_err(|error| format!("failed to read LSP header: {error}"))?;
            header.push(byte[0]);
            if header.ends_with(b"\r\n\r\n") {
                break;
            }
        }

        let header_text = String::from_utf8(header)
            .map_err(|error| format!("invalid LSP header encoding: {error}"))?;
        let content_length = header_text
            .lines()
            .find_map(|line| {
                let lower = line.to_ascii_lowercase();
                lower
                    .strip_prefix("content-length:")
                    .and_then(|value| value.trim().parse::<usize>().ok())
            })
            .ok_or_else(|| "missing Content-Length in LSP response".to_string())?;

        let mut body = vec![0_u8; content_length];
        self.stdout
            .read_exact(&mut body)
            .await
            .map_err(|error| format!("failed to read LSP payload: {error}"))?;

        serde_json::from_slice(&body).map_err(|error| format!("invalid LSP payload: {error}"))
    }
}

pub(crate) struct SemanticExplorationResult {
    pub(crate) title: String,
    pub(crate) source: String,
    pub(crate) matches: Vec<SemanticMatch>,
}

pub(crate) async fn run_semantic_exploration(
    mode: ExplorationMode,
    query: &str,
    target_path: &Path,
    request_file_path: Option<&str>,
    request_line: Option<u32>,
    request_column: Option<u32>,
    max_results: usize,
) -> Result<SemanticExplorationResult, String> {
    let semantic_query = query.trim();
    if semantic_query.is_empty() && mode != ExplorationMode::Diagnostics {
        return Ok(SemanticExplorationResult {
            title: "Semantic workspace search".to_string(),
            source: "lsp".to_string(),
            matches: Vec::new(),
        });
    }

    let root_path = if target_path.is_dir() {
        target_path.to_path_buf()
    } else {
        target_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| target_path.to_path_buf())
    };
    let launches = discover_language_servers(&root_path, request_file_path)?;
    if launches.is_empty() {
        return Err(
            "No supported language server was detected in PATH for this workspace.".to_string(),
        );
    }

    let mut all_matches = Vec::new();
    let mut used_sources = HashSet::new();

    for launch in launches {
        let mut client = match LspClient::connect(&launch, &root_path).await {
            Ok(client) => client,
            Err(_) => continue,
        };

        let result = match mode {
            ExplorationMode::Search | ExplorationMode::Symbols => {
                collect_workspace_symbols(&mut client, semantic_query, max_results, launch.language)
                    .await
            }
            ExplorationMode::Definition => {
                collect_symbol_navigation(
                    &mut client,
                    semantic_query,
                    &root_path,
                    request_file_path,
                    request_line,
                    request_column,
                    launch.language,
                    NavigationKind::Definition,
                    max_results,
                )
                .await
            }
            ExplorationMode::References => {
                collect_symbol_navigation(
                    &mut client,
                    semantic_query,
                    &root_path,
                    request_file_path,
                    request_line,
                    request_column,
                    launch.language,
                    NavigationKind::References,
                    max_results,
                )
                .await
            }
            ExplorationMode::Diagnostics => {
                collect_diagnostics(
                    &mut client,
                    &root_path,
                    request_file_path,
                    launch.language,
                    max_results,
                )
                .await
            }
            ExplorationMode::List => Ok(Vec::new()),
        };

        if let Ok(mut matches) = result {
            if !matches.is_empty() {
                used_sources.insert(format!("lsp:{}", launch.command));
                all_matches.append(&mut matches);
            }
        }

        client.shutdown().await;
    }

    all_matches.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then(left.detail.cmp(&right.detail))
    });
    all_matches.truncate(max_results);

    Ok(SemanticExplorationResult {
        title: semantic_title(mode, semantic_query),
        source: used_sources
            .into_iter()
            .next()
            .unwrap_or_else(|| "lsp".to_string()),
        matches: all_matches,
    })
}

#[derive(Clone, Copy)]
enum NavigationKind {
    Definition,
    References,
}

async fn collect_workspace_symbols(
    client: &mut LspClient,
    query: &str,
    max_results: usize,
    language: WorkspaceLanguage,
) -> Result<Vec<SemanticMatch>, String> {
    let response: Vec<LspSymbolInformation> = client
        .request("workspace/symbol", json!({ "query": query }))
        .await?;

    Ok(response
        .into_iter()
        .take(max_results.min(MAX_LSP_RESULTS))
        .filter_map(|symbol| semantic_match_from_symbol(symbol, language).ok())
        .collect())
}

async fn collect_symbol_navigation(
    client: &mut LspClient,
    query: &str,
    root_path: &Path,
    request_file_path: Option<&str>,
    request_line: Option<u32>,
    request_column: Option<u32>,
    language: WorkspaceLanguage,
    kind: NavigationKind,
    max_results: usize,
) -> Result<Vec<SemanticMatch>, String> {
    let target = resolve_symbol_target(
        client,
        query,
        root_path,
        request_file_path,
        request_line,
        request_column,
        language,
    )
    .await?;
    let file_uri = path_to_file_uri(&target.path)?;
    let text = fs::read_to_string(&target.path)
        .map_err(|error| format!("failed to read '{}': {error}", target.path.display()))?;

    client
        .notify(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": file_uri,
                    "languageId": target.language.language_id(),
                    "version": 1,
                    "text": text
                }
            }),
        )
        .await?;

    match kind {
        NavigationKind::Definition => {
            let definitions: Value = client
                .request(
                    "textDocument/definition",
                    json!({
                        "textDocument": { "uri": file_uri },
                        "position": {
                            "line": target.line,
                            "character": target.column
                        }
                    }),
                )
                .await?;
            Ok(locations_from_value(definitions)
                .into_iter()
                .take(max_results.min(MAX_LSP_RESULTS))
                .filter_map(|location| {
                    semantic_match_from_location(location, "lsp:definition").ok()
                })
                .collect())
        }
        NavigationKind::References => {
            let references: Vec<LspLocation> = client
                .request(
                    "textDocument/references",
                    json!({
                        "textDocument": { "uri": file_uri },
                        "position": {
                            "line": target.line,
                            "character": target.column
                        },
                        "context": {
                            "includeDeclaration": true
                        }
                    }),
                )
                .await?;
            Ok(references
                .into_iter()
                .take(max_results.min(MAX_LSP_RESULTS))
                .filter_map(|location| {
                    semantic_match_from_location(location, "lsp:references").ok()
                })
                .collect())
        }
    }
}

async fn collect_diagnostics(
    client: &mut LspClient,
    root_path: &Path,
    request_file_path: Option<&str>,
    language: WorkspaceLanguage,
    max_results: usize,
) -> Result<Vec<SemanticMatch>, String> {
    let file_path = resolve_diagnostic_file(root_path, request_file_path, language)?;
    let file_uri = path_to_file_uri(&file_path)?;
    let text = fs::read_to_string(&file_path)
        .map_err(|error| format!("failed to read '{}': {error}", file_path.display()))?;

    client
        .notify(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": file_uri,
                    "languageId": language.language_id(),
                    "version": 1,
                    "text": text
                }
            }),
        )
        .await?;
    let diagnostics = client
        .collect_diagnostics(&file_uri, MAX_DIAGNOSTIC_WAIT)
        .await?;

    Ok(diagnostics
        .into_iter()
        .take(max_results.min(MAX_LSP_RESULTS))
        .map(|diagnostic| SemanticMatch {
            path: file_path.to_string_lossy().to_string(),
            display_name: file_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("file")
                .to_string(),
            detail: format!(
                "{} at line {}{}",
                diagnostic.message.trim(),
                diagnostic.range.start.line + 1,
                diagnostic
                    .source
                    .as_deref()
                    .map(|source| format!(" ({source})"))
                    .unwrap_or_default()
            ),
            snippet: Some(format!(
                "{} line {}",
                diagnostic_severity_label(diagnostic.severity),
                diagnostic.range.start.line + 1
            )),
            source: "lsp:diagnostics".to_string(),
        })
        .collect())
}

async fn resolve_symbol_target(
    client: &mut LspClient,
    query: &str,
    root_path: &Path,
    request_file_path: Option<&str>,
    request_line: Option<u32>,
    request_column: Option<u32>,
    language: WorkspaceLanguage,
) -> Result<SymbolTarget, String> {
    if let Some(path) = request_file_path {
        let absolute = resolve_request_path(
            Some(path.to_string()),
            Some(root_path.to_string_lossy().to_string()),
        )?;
        return Ok(SymbolTarget {
            path: absolute,
            line: request_line.unwrap_or(0),
            column: request_column.unwrap_or(0),
            language,
        });
    }

    let symbols: Vec<LspSymbolInformation> = client
        .request("workspace/symbol", json!({ "query": query }))
        .await?;
    let Some(best) = symbols.into_iter().next() else {
        return Err(format!("No symbol location was found for `{query}`."));
    };
    let path = file_uri_to_path(&best.location.uri)?;
    Ok(SymbolTarget {
        path,
        line: best.location.range.start.line,
        column: best.location.range.start.character,
        language,
    })
}

fn resolve_diagnostic_file(
    root_path: &Path,
    request_file_path: Option<&str>,
    language: WorkspaceLanguage,
) -> Result<PathBuf, String> {
    if let Some(path) = request_file_path {
        return resolve_request_path(
            Some(path.to_string()),
            Some(root_path.to_string_lossy().to_string()),
        );
    }

    first_workspace_file_for_language(root_path, language)
        .ok_or_else(|| format!("No {} file was found for diagnostics.", language.label()))
}

fn discover_language_servers(
    root_path: &Path,
    request_file_path: Option<&str>,
) -> Result<Vec<ServerLaunchSpec>, String> {
    let available_commands = discover_shell_command_names();
    let languages = collect_workspace_languages(root_path, request_file_path);
    let mut launches = Vec::new();

    for language in languages {
        for (command, args) in language.server_candidates() {
            if available_commands.contains(*command) {
                launches.push(ServerLaunchSpec {
                    language,
                    command: (*command).to_string(),
                    args: args.iter().map(|value| (*value).to_string()).collect(),
                });
                break;
            }
        }
    }

    launches.truncate(3);
    Ok(launches)
}

pub(crate) fn collect_workspace_languages(
    root_path: &Path,
    request_file_path: Option<&str>,
) -> Vec<WorkspaceLanguage> {
    if let Some(path) = request_file_path {
        let requested = Path::new(path);
        if let Some(extension) = requested.extension().and_then(|value| value.to_str()) {
            if let Some(language) = WorkspaceLanguage::from_extension(extension) {
                return vec![language];
            }
        }
    }

    let mut counts = HashMap::<WorkspaceLanguage, usize>::new();
    for entry in WalkDir::new(root_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !should_ignore_walk_entry(entry.path()))
        .filter_map(Result::ok)
        .take(MAX_LANGUAGE_SCAN_FILES)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let Some(extension) = entry.path().extension().and_then(|value| value.to_str()) else {
            continue;
        };
        if let Some(language) = WorkspaceLanguage::from_extension(extension) {
            *counts.entry(language).or_insert(0) += 1;
        }
    }

    let mut ranked = counts.into_iter().collect::<Vec<_>>();
    ranked.sort_by(|left, right| right.1.cmp(&left.1));
    ranked.into_iter().map(|(language, _)| language).collect()
}

fn should_ignore_walk_entry(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| IGNORED_DIRS.contains(&value))
        .unwrap_or(false)
}

fn first_workspace_file_for_language(
    root_path: &Path,
    language: WorkspaceLanguage,
) -> Option<PathBuf> {
    WalkDir::new(root_path)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !should_ignore_walk_entry(entry.path()))
        .filter_map(Result::ok)
        .find_map(|entry| {
            if !entry.file_type().is_file() {
                return None;
            }
            let extension = entry.path().extension().and_then(|value| value.to_str())?;
            (WorkspaceLanguage::from_extension(extension) == Some(language))
                .then(|| entry.path().to_path_buf())
        })
}

fn semantic_match_from_symbol(
    symbol: LspSymbolInformation,
    language: WorkspaceLanguage,
) -> Result<SemanticMatch, String> {
    let path = file_uri_to_path(&symbol.location.uri)?;
    let line_number = symbol.location.range.start.line + 1;
    Ok(SemanticMatch {
        path: path.to_string_lossy().to_string(),
        display_name: symbol.name.clone(),
        detail: format!(
            "{}{} at line {}",
            lsp_symbol_kind_label(symbol.kind),
            symbol
                .container_name
                .as_deref()
                .map(|container| format!(" in {container}"))
                .unwrap_or_default(),
            line_number
        ),
        snippet: snippet_for_file_line(&path, symbol.location.range.start.line).ok(),
        source: format!("lsp:{}", language.label()),
    })
}

fn semantic_match_from_location(
    location: LspLocation,
    source: &str,
) -> Result<SemanticMatch, String> {
    let path = file_uri_to_path(&location.uri)?;
    let line_number = location.range.start.line + 1;
    let display_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file")
        .to_string();
    Ok(SemanticMatch {
        path: path.to_string_lossy().to_string(),
        display_name,
        detail: format!("line {}", line_number),
        snippet: snippet_for_file_line(&path, location.range.start.line).ok(),
        source: source.to_string(),
    })
}

fn locations_from_value(value: Value) -> Vec<LspLocation> {
    if value.is_null() {
        return Vec::new();
    }

    if let Ok(single) = serde_json::from_value::<LspLocation>(value.clone()) {
        return vec![single];
    }

    if let Ok(list) = serde_json::from_value::<Vec<LspLocation>>(value) {
        return list;
    }

    Vec::new()
}

fn path_to_file_uri(path: &Path) -> Result<String, String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("failed to resolve '{}': {error}", path.display()))?;
    Ok(format!(
        "file://{}",
        percent_encode_path(canonical.to_string_lossy().as_ref())
    ))
}

fn file_uri_to_path(uri: &str) -> Result<PathBuf, String> {
    let trimmed = uri.trim();
    let Some(stripped) = trimmed.strip_prefix("file://") else {
        return Err(format!("unsupported LSP uri `{trimmed}`"));
    };
    Ok(PathBuf::from(percent_decode_path(stripped)))
}

fn percent_encode_path(path: &str) -> String {
    path.chars()
        .flat_map(|character| match character {
            ' ' => "%20".chars().collect::<Vec<_>>(),
            '#' => "%23".chars().collect(),
            '?' => "%3F".chars().collect(),
            '%' => "%25".chars().collect(),
            other => vec![other],
        })
        .collect()
}

fn percent_decode_path(path: &str) -> String {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = &path[index + 1..index + 3];
            if let Ok(value) = u8::from_str_radix(hex, 16) {
                decoded.push(value);
                index += 3;
                continue;
            }
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&decoded).to_string()
}
