use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

use octomus_cloud_protocol::{
    CloudProvider, CloudRunEvent, CloudRunEventKind, CloudRunGitSpec, CloudRunLaunchSpec,
    CloudRunLlmSpec, CloudRunPolicy, HarnessKind, TerminalStream,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::ai::{agent::openai::OpenAiCompatibleConfig, AgentHarnessManager};
use crate::secure_store;
use crate::terminal::{
    events::{
        emit_session_state, TerminalBlockOutputEvent, TerminalExitEvent, EVENT_BLOCK,
        EVENT_BLOCK_OUTPUT, EVENT_EXIT,
    },
    requests::CreateTerminalSessionTargetRequest,
    session::{
        TerminalSession, TerminalSessionKind, TerminalSessionProvider, TerminalSessionRuntime,
        TerminalSessionStatus,
    },
    TerminalManager,
};

#[derive(Clone, Default)]
pub struct CloudRuntimeManager {
    children: Arc<Mutex<HashMap<String, std::process::Child>>>,
}

impl CloudRuntimeManager {
    fn insert_child(&self, session_id: String, child: std::process::Child) -> Result<(), String> {
        self.children
            .lock()
            .map_err(|_| "cloud runtime child map lock is poisoned".to_string())?
            .insert(session_id, child);
        Ok(())
    }

    fn take_child(&self, session_id: &str) -> Option<std::process::Child> {
        self.children.lock().ok()?.remove(session_id)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildCloudRunLaunchRequest {
    pub session_id: String,
    pub provider: Option<String>,
    pub harness: Option<String>,
    pub control_url: Option<String>,
    pub workspace: Option<String>,
    pub prompt: Option<String>,
    pub repo: Option<String>,
    pub base_branch: Option<String>,
    pub work_branch: Option<String>,
    pub allow_push: Option<bool>,
    pub allow_pr_create: Option<bool>,
    #[serde(default)]
    pub include_llm_credentials: Option<bool>,
    #[serde(default)]
    pub include_secrets_in_shell_command: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildCloudRunLaunchResponse {
    pub launch: CloudRunLaunchSpec,
    pub argv: Vec<String>,
    pub shell_command: String,
    pub environment: Vec<CloudRuntimeEnvVar>,
    pub redacted_environment: Vec<CloudRuntimeEnvVar>,
    pub llm: Option<CloudRunLlmSpec>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCloudRunRequest {
    #[serde(flatten)]
    pub launch: BuildCloudRunLaunchRequest,
    pub target: CreateTerminalSessionTargetRequest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRuntimeEnvVar {
    pub name: String,
    pub value: String,
    pub sensitive: bool,
}

#[tauri::command]
pub fn cloud_runtime_build_launch_command(
    manager: State<'_, AgentHarnessManager>,
    request: BuildCloudRunLaunchRequest,
) -> Result<BuildCloudRunLaunchResponse, String> {
    build_launch_response(&manager, request)
}

#[tauri::command]
pub fn cloud_runtime_start_run(
    app: AppHandle,
    terminal_manager: State<'_, TerminalManager>,
    cloud_manager: State<'_, CloudRuntimeManager>,
    agent_manager: State<'_, AgentHarnessManager>,
    request: StartCloudRunRequest,
) -> Result<crate::terminal::session::TerminalSessionInfo, String> {
    let target = request.target;
    match target.resolved_provider() {
        TerminalSessionProvider::CustomVm => {
            start_custom_vm_run(app, terminal_manager, cloud_manager, agent_manager, request.launch, target)
        }
        TerminalSessionProvider::Modal => Err(
            "Modal cloud agent runs need the Modal sandbox adapter; custom VM cloud agents are ready."
                .to_string(),
        ),
        TerminalSessionProvider::Local => Err("local provider cannot be used for a cloud run".to_string()),
    }
}

#[tauri::command]
pub fn cloud_runtime_cancel_run(
    cloud_manager: State<'_, CloudRuntimeManager>,
    request: crate::terminal::requests::TerminalSessionRequest,
) -> Result<(), String> {
    if let Some(mut child) = cloud_manager.take_child(&request.session_id) {
        let _ = child.kill();
    }
    Ok(())
}

fn build_launch_response(
    manager: &AgentHarnessManager,
    request: BuildCloudRunLaunchRequest,
) -> Result<BuildCloudRunLaunchResponse, String> {
    let session_id = clean_required(&request.session_id, "session id")?;
    let provider = parse_provider(request.provider.as_deref().unwrap_or("custom-vm"))?;
    let harness = parse_harness(request.harness.as_deref().unwrap_or("octomus"))?;
    let workspace = request
        .workspace
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("/workspace")
        .to_string();
    let git = match request
        .repo
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(repo) => Some(CloudRunGitSpec {
            repo: repo.to_string(),
            base_branch: request
                .base_branch
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("main")
                .to_string(),
            work_branch: request
                .work_branch
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("octomus/{session_id}")),
        }),
        None => None,
    };

    let llm_config = resolve_llm_config(&manager)?;
    let llm = llm_config.as_ref().map(|config| CloudRunLlmSpec {
        provider_label: config.source.clone(),
        base_url: config.base_url.clone(),
        model_id: config.model_id.clone(),
        has_api_key: !config.api_key.trim().is_empty(),
    });
    let include_llm_credentials = request.include_llm_credentials.unwrap_or(true);
    let environment = if include_llm_credentials {
        build_llm_environment(llm_config.as_ref())
    } else {
        Vec::new()
    };
    let redacted_environment = environment
        .iter()
        .map(|var| CloudRuntimeEnvVar {
            name: var.name.clone(),
            value: if var.sensitive {
                "********".to_string()
            } else {
                var.value.clone()
            },
            sensitive: var.sensitive,
        })
        .collect::<Vec<_>>();

    let launch = CloudRunLaunchSpec {
        session_id: session_id.clone(),
        provider: provider.clone(),
        harness: harness.clone(),
        control_url: request
            .control_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        workspace: workspace.clone(),
        prompt: request
            .prompt
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        git,
        llm: llm.clone(),
        policy: CloudRunPolicy {
            allow_push: request.allow_push.unwrap_or(false),
            allow_pr_create: request.allow_pr_create.unwrap_or(false),
            allow_merge: false,
            max_runtime_minutes: Some(60),
        },
    };
    let argv = build_argv(&launch);
    let mut command_parts = Vec::new();
    if request.include_secrets_in_shell_command.unwrap_or(false) {
        command_parts.extend(
            environment
                .iter()
                .map(|var| format!("{}={}", var.name, shell_quote(&var.value))),
        );
    }
    command_parts.extend(argv.iter().map(|arg| shell_quote(arg)));
    let shell_command = command_parts.join(" ");

    Ok(BuildCloudRunLaunchResponse {
        launch,
        argv,
        shell_command,
        environment,
        redacted_environment,
        llm,
    })
}

fn start_custom_vm_run(
    app: AppHandle,
    terminal_manager: State<'_, TerminalManager>,
    cloud_manager: State<'_, CloudRuntimeManager>,
    agent_manager: State<'_, AgentHarnessManager>,
    request: BuildCloudRunLaunchRequest,
    target: CreateTerminalSessionTargetRequest,
) -> Result<crate::terminal::session::TerminalSessionInfo, String> {
    let launch_response = build_launch_response(&agent_manager, request)?;
    let profile_id = clean_required_option(&target.profile_id, "cloud profile id")?;
    let host = clean_required_option(&target.host, "cloud host")?;
    let username = clean_required_option(&target.username, "cloud username")?;
    let connection_method = target
        .connection_method
        .as_deref()
        .unwrap_or("ssh-agent")
        .trim()
        .to_string();
    let mut key_path_to_remove = None;

    let mut command = Command::new("ssh");
    command
        .arg("-tt")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg("-o")
        .arg("ServerAliveCountMax=3")
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new");

    if connection_method == "ssh-key" {
        let account = format!("cloud-profile:{profile_id}:ssh-private-key");
        let private_key = secure_store::load_secret(&account)?.ok_or_else(|| {
            "SSH private key is missing from secure storage for this cloud profile".to_string()
        })?;
        let key_path = write_ephemeral_private_key(&profile_id, &private_key)?;
        command
            .arg("-i")
            .arg(&key_path)
            .arg("-o")
            .arg("IdentitiesOnly=yes");
        key_path_to_remove = Some(key_path);
    }

    command
        .arg(format!("{username}@{host}"))
        .arg("sh")
        .arg("-s")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to start cloud agent SSH run: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        let script = build_remote_agent_script(&launch_response);
        stdin
            .write_all(script.as_bytes())
            .map_err(|error| format!("failed to send cloud agent bootstrap script: {error}"))?;
    }

    if let Some(path) = key_path_to_remove {
        let _ = fs::remove_file(path);
    }

    let session = Arc::new(TerminalSession::new_headless(
        TerminalSessionRuntime {
            kind: TerminalSessionKind::Cloud,
            provider: TerminalSessionProvider::CustomVm,
            profile_id: Some(profile_id),
        },
        TerminalSessionStatus::Running,
        "octomus-cli".to_string(),
        Some(launch_response.launch.workspace.clone()),
    ));
    let info = session.info();
    terminal_manager.insert(session.clone())?;
    emit_session_state(&app, &session, TerminalSessionStatus::Running);

    let block = session
        .with_blocks(|blocks| {
            blocks.begin_command(
                &session.id,
                launch_response
                    .redacted_environment
                    .iter()
                    .map(|var| format!("{}={}", var.name, var.value))
                    .chain(launch_response.argv.iter().cloned())
                    .collect::<Vec<_>>()
                    .join(" "),
            )
        })
        .unwrap_or_default()
        .into_iter()
        .next()
        .ok_or_else(|| "failed to create cloud agent terminal block".to_string())?;
    let block_id = block.block.id.clone();
    let _ = app.emit(EVENT_BLOCK, block);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    cloud_manager.insert_child(session.id.clone(), child)?;

    if let Some(stdout) = stdout {
        spawn_cloud_output_reader(
            app.clone(),
            session.clone(),
            block_id.clone(),
            Box::new(BufReader::new(stdout)),
            TerminalStream::Stdout,
        );
    }
    if let Some(stderr) = stderr {
        spawn_cloud_output_reader(
            app.clone(),
            session.clone(),
            block_id.clone(),
            Box::new(BufReader::new(stderr)),
            TerminalStream::Stderr,
        );
    }

    spawn_cloud_waiter(app, cloud_manager.inner().clone(), session, block_id);

    Ok(info)
}

fn build_argv(launch: &CloudRunLaunchSpec) -> Vec<String> {
    let mut argv = vec![
        "octomus-cli".to_string(),
        "run-agent".to_string(),
        "--session-id".to_string(),
        launch.session_id.clone(),
        "--provider".to_string(),
        provider_arg(&launch.provider).to_string(),
        "--harness".to_string(),
        harness_arg(&launch.harness).to_string(),
        "--workspace".to_string(),
        launch.workspace.clone(),
    ];

    if let Some(control_url) = &launch.control_url {
        argv.extend(["--control-url".to_string(), control_url.clone()]);
    }
    if let Some(prompt) = &launch.prompt {
        argv.extend(["--prompt".to_string(), prompt.clone()]);
    }
    if let Some(git) = &launch.git {
        argv.extend([
            "--repo".to_string(),
            git.repo.clone(),
            "--base".to_string(),
            git.base_branch.clone(),
            "--branch".to_string(),
            git.work_branch.clone(),
        ]);
    }
    if launch.policy.allow_push {
        argv.push("--allow-push".to_string());
    }
    if launch.policy.allow_pr_create {
        argv.push("--allow-pr-create".to_string());
    }

    argv
}

fn build_remote_agent_script(launch_response: &BuildCloudRunLaunchResponse) -> String {
    let bootstrap = octomus_cloud_protocol::CloudCliBootstrapSpec::default();
    let mut script = String::new();
    script.push_str("set -eu\n");
    script.push_str("octomus_dir=\"$HOME/.octomus/bin\"\n");
    script.push_str(&format!(
        "octomus_url=\"${{OCTOMUS_CLI_URL:-{}}}\"\n",
        bootstrap.install_url
    ));
    script.push_str("octomus_bin=\"$octomus_dir/octomus-cli\"\n");
    script.push_str("mkdir -p \"$octomus_dir\"\n");
    script.push_str("if [ ! -x \"$octomus_bin\" ]; then\n");
    script.push_str("  tmp=\"$octomus_bin.tmp.$$\"\n");
    script.push_str("  if command -v curl >/dev/null 2>&1; then curl -fsSL \"$octomus_url\" -o \"$tmp\"; elif command -v wget >/dev/null 2>&1; then wget -qO \"$tmp\" \"$octomus_url\"; else echo \"curl or wget is required to install octomus-cli\" >&2; exit 127; fi\n");
    script.push_str("  chmod 0755 \"$tmp\"\n");
    script.push_str("  mv \"$tmp\" \"$octomus_bin\"\n");
    script.push_str("fi\n");
    script.push_str("export PATH=\"$octomus_dir:$PATH\"\n");

    for var in &launch_response.environment {
        script.push_str(&format!(
            "export {}={}\n",
            var.name,
            shell_quote(&var.value)
        ));
    }

    script.push_str("exec ");
    script.push_str(
        &launch_response
            .argv
            .iter()
            .map(|arg| shell_quote(arg))
            .collect::<Vec<_>>()
            .join(" "),
    );
    script.push('\n');
    script
}

fn spawn_cloud_output_reader(
    app: AppHandle,
    session: Arc<TerminalSession>,
    block_id: String,
    mut reader: Box<dyn BufRead + Send>,
    stream: TerminalStream,
) {
    thread::spawn(move || {
        let mut line = String::new();
        loop {
            line.clear();
            let Ok(bytes) = reader.read_line(&mut line) else {
                break;
            };
            if bytes == 0 {
                break;
            }

            let output = format_cloud_run_output(&line, &stream);
            if output.is_empty() {
                continue;
            }

            let _ = session.with_blocks(|blocks| blocks.append_output(&block_id, &output));
            let _ = app.emit(
                EVENT_BLOCK_OUTPUT,
                TerminalBlockOutputEvent {
                    session_id: session.id.clone(),
                    block_id: block_id.clone(),
                    data: output,
                },
            );
        }
    });
}

fn spawn_cloud_waiter(
    app: AppHandle,
    cloud_manager: CloudRuntimeManager,
    session: Arc<TerminalSession>,
    block_id: String,
) {
    thread::spawn(move || {
        let exit_code = cloud_manager
            .take_child(&session.id)
            .and_then(|mut child| child.wait().ok())
            .and_then(|status| status.code());
        let finished_events = session
            .with_blocks(|blocks| blocks.finish_command(&session.id, &block_id, exit_code))
            .unwrap_or_default();
        for event in finished_events {
            let _ = app.emit(EVENT_BLOCK, event);
        }
        emit_session_state(&app, &session, TerminalSessionStatus::Exited);
        let _ = app.emit(
            EVENT_EXIT,
            TerminalExitEvent {
                session_id: session.id.clone(),
                exit_code,
            },
        );
    });
}

fn format_cloud_run_output(line: &str, stream: &TerminalStream) -> String {
    let trimmed = line.trim_end_matches(['\r', '\n']);
    if trimmed.is_empty() {
        return String::new();
    }

    if let Ok(event) = serde_json::from_str::<CloudRunEvent>(trimmed) {
        return format_cloud_run_event(event);
    }

    match stream {
        TerminalStream::Stdout => line.to_string(),
        TerminalStream::Stderr => format!("[stderr] {line}"),
    }
}

fn format_cloud_run_event(event: CloudRunEvent) -> String {
    match event.event {
        CloudRunEventKind::Status { status, message } => {
            format!("[cloud:{:?}] {}\n", status, message.unwrap_or_default())
        }
        CloudRunEventKind::TerminalOutput { data, .. } => data,
        CloudRunEventKind::GitStatus { branch, dirty } => {
            format!(
                "[cloud:git] branch={} dirty={}\n",
                branch.unwrap_or_else(|| "-".to_string()),
                dirty
            )
        }
        CloudRunEventKind::LlmConfig {
            provider_label,
            base_url,
            model_id,
            has_api_key,
        } => format!(
            "[cloud:llm] provider={provider_label} model={model_id} baseUrl={base_url} apiKey={}\n",
            if has_api_key { "present" } else { "missing" }
        ),
        CloudRunEventKind::PullRequestCreated { url } => {
            format!("[cloud:pr] {url}\n")
        }
        CloudRunEventKind::Error { message } => format!("[cloud:error] {message}\n"),
        CloudRunEventKind::Done { status } => format!("[cloud:done] {:?}\n", status),
    }
}

fn clean_required(value: &str, label: &str) -> Result<String, String> {
    value
        .trim()
        .is_empty()
        .then(|| format!("{label} is required"))
        .map_or_else(|| Ok(value.trim().to_string()), Err)
}

fn clean_required_option(value: &Option<String>, label: &str) -> Result<String, String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("{label} is required for cloud run launch"))
}

fn parse_provider(value: &str) -> Result<CloudProvider, String> {
    match value {
        "custom-vm" | "custom_vm" => Ok(CloudProvider::CustomVm),
        "modal" => Ok(CloudProvider::Modal),
        other => Err(format!("unsupported cloud provider: {other}")),
    }
}

fn parse_harness(value: &str) -> Result<HarnessKind, String> {
    match value {
        "octomus" => Ok(HarnessKind::Octomus),
        "codex" => Ok(HarnessKind::Codex),
        "claude" | "claude-code" => Ok(HarnessKind::Claude),
        "gemini" => Ok(HarnessKind::Gemini),
        "custom" => Ok(HarnessKind::Custom),
        other => Err(format!("unsupported harness: {other}")),
    }
}

fn provider_arg(provider: &CloudProvider) -> &'static str {
    match provider {
        CloudProvider::CustomVm => "custom-vm",
        CloudProvider::Modal => "modal",
    }
}

fn harness_arg(harness: &HarnessKind) -> &'static str {
    match harness {
        HarnessKind::Octomus => "octomus",
        HarnessKind::Codex => "codex",
        HarnessKind::Claude => "claude",
        HarnessKind::Gemini => "gemini",
        HarnessKind::Custom => "custom",
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn write_ephemeral_private_key(profile_id: &str, private_key: &str) -> Result<PathBuf, String> {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "octomus-cloud-agent-key-{}-{}",
        sanitize_filename(profile_id),
        Uuid::new_v4()
    ));
    fs::write(&path, private_key).map_err(|error| format!("failed to prepare SSH key: {error}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("failed to secure SSH key permissions: {error}"))?;
    }

    Ok(path)
}

fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn resolve_llm_config(
    manager: &AgentHarnessManager,
) -> Result<Option<OpenAiCompatibleConfig>, String> {
    Ok(manager
        .load_provider_config_from_disk()?
        .filter(|config| !config.api_key.trim().is_empty())
        .or_else(|| {
            manager
                .provider_config()
                .ok()
                .flatten()
                .filter(|config| !config.api_key.trim().is_empty())
        })
        .or_else(OpenAiCompatibleConfig::from_env))
}

fn build_llm_environment(config: Option<&OpenAiCompatibleConfig>) -> Vec<CloudRuntimeEnvVar> {
    let Some(config) = config.filter(|config| !config.api_key.trim().is_empty()) else {
        return Vec::new();
    };

    vec![
        CloudRuntimeEnvVar {
            name: "OCTOMUS_AI_PROVIDER".to_string(),
            value: config.source.clone(),
            sensitive: false,
        },
        CloudRuntimeEnvVar {
            name: "OCTOMUS_AI_API_KEY".to_string(),
            value: config.api_key.clone(),
            sensitive: true,
        },
        CloudRuntimeEnvVar {
            name: "OCTOMUS_AI_BASE_URL".to_string(),
            value: config.base_url.clone(),
            sensitive: false,
        },
        CloudRuntimeEnvVar {
            name: "OCTOMUS_AI_MODEL".to_string(),
            value: config.model_id.clone(),
            sensitive: false,
        },
        CloudRuntimeEnvVar {
            name: "OPENAI_API_KEY".to_string(),
            value: config.api_key.clone(),
            sensitive: true,
        },
        CloudRuntimeEnvVar {
            name: "OPENAI_BASE_URL".to_string(),
            value: config.base_url.clone(),
            sensitive: false,
        },
        CloudRuntimeEnvVar {
            name: "OPENAI_MODEL".to_string(),
            value: config.model_id.clone(),
            sensitive: false,
        },
    ]
}
