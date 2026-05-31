use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};

use octomus_cloud_protocol::{
    CloudCliBootstrapSpec, CloudCliTransferMode, CloudProvider, CloudRunEvent, CloudRunEventKind,
    CloudRunGitSpec, CloudRunLaunchSpec, CloudRunLlmSpec, CloudRunPolicy, CloudRunSyncSpec,
    CloudSyncStrategy, HarnessKind, TerminalStream,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::ai::{agent::OpenAiCompatibleConfig, AgentHarnessManager};
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
    children: Arc<Mutex<HashMap<String, ManagedCloudProcess>>>,
}

struct ManagedCloudProcess {
    child: std::process::Child,
    cleanup_paths: Vec<PathBuf>,
}

impl CloudRuntimeManager {
    fn insert_child(
        &self,
        session_id: String,
        child: std::process::Child,
        cleanup_paths: Vec<PathBuf>,
    ) -> Result<(), String> {
        self.children
            .lock()
            .map_err(|_| "cloud runtime child map lock is poisoned".to_string())?
            .insert(
                session_id,
                ManagedCloudProcess {
                    child,
                    cleanup_paths,
                },
            );
        Ok(())
    }

    fn take_child(&self, session_id: &str) -> Option<ManagedCloudProcess> {
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
    pub sync_strategy: Option<String>,
    pub commit_message: Option<String>,
    pub artifact_path: Option<String>,
    pub bootstrap_install_url: Option<String>,
    pub bootstrap_install_dir: Option<String>,
    pub bootstrap_binary_name: Option<String>,
    pub bootstrap_transfer_mode: Option<String>,
    pub bootstrap_local_binary_path: Option<String>,
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
    pub bootstrap: CloudCliBootstrapSpec,
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

#[derive(Debug, Clone)]
struct ModalCredentials {
    token_id: String,
    token_secret: String,
}

struct ModalLaunchArtifacts {
    root_dir: PathBuf,
    script_path: PathBuf,
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
        TerminalSessionProvider::CustomVm => start_custom_vm_run(
            app,
            terminal_manager,
            cloud_manager,
            agent_manager,
            request.launch,
            target,
        ),
        TerminalSessionProvider::Modal => start_modal_run(
            app,
            terminal_manager,
            cloud_manager,
            agent_manager,
            request.launch,
            target,
        ),
        TerminalSessionProvider::Local => {
            Err("local provider cannot be used for a cloud run".to_string())
        }
    }
}

#[tauri::command]
pub fn cloud_runtime_cancel_run(
    cloud_manager: State<'_, CloudRuntimeManager>,
    request: crate::terminal::requests::TerminalSessionRequest,
) -> Result<(), String> {
    if let Some(mut process) = cloud_manager.take_child(&request.session_id) {
        let _ = process.child.kill();
        cleanup_cloud_paths(&process.cleanup_paths);
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
    let bootstrap = resolve_cli_bootstrap_spec(&request)?;
    let sync = CloudRunSyncSpec {
        strategy: parse_sync_strategy(
            request
                .sync_strategy
                .as_deref()
                .unwrap_or(if git.is_some() { "git" } else { "patch" }),
        )?,
        commit_message: request
            .commit_message
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        artifact_path: request
            .artifact_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
    };
    if matches!(sync.strategy, CloudSyncStrategy::Git) && git.is_none() {
        return Err("git sync strategy requires a repository URL".to_string());
    }
    let include_llm_credentials = request.include_llm_credentials.unwrap_or(true);
    let mut environment = build_passthrough_environment();
    if include_llm_credentials {
        environment.extend(build_llm_environment(llm_config.as_ref()));
    }
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
        sync,
        bootstrap: bootstrap.clone(),
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
        bootstrap,
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
    cloud_manager.insert_child(session.id.clone(), child, Vec::new())?;

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

fn start_modal_run(
    app: AppHandle,
    terminal_manager: State<'_, TerminalManager>,
    cloud_manager: State<'_, CloudRuntimeManager>,
    agent_manager: State<'_, AgentHarnessManager>,
    mut request: BuildCloudRunLaunchRequest,
    target: CreateTerminalSessionTargetRequest,
) -> Result<crate::terminal::session::TerminalSessionInfo, String> {
    let profile_id = clean_required_option(&target.profile_id, "cloud profile id")?;
    let modal_environment = target
        .environment
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("main")
        .to_string();
    let local_workspace_path = request
        .workspace
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    let remote_workspace = remote_modal_workspace_path(local_workspace_path.as_deref());
    request.workspace = Some(remote_workspace.clone());

    let launch_response = build_launch_response(&agent_manager, request)?;
    let modal_credentials = load_modal_credentials(&profile_id)?;
    let artifacts =
        prepare_modal_launch_artifacts(&launch_response, local_workspace_path.as_deref())?;
    let script_ref = format!(
        "{}::run_octomus_cloud_agent",
        artifacts.script_path.to_string_lossy()
    );

    let mut command = Command::new("modal");
    command
        .arg("run")
        .arg("-q")
        .arg("--env")
        .arg(&modal_environment)
        .arg(&script_ref)
        .env("MODAL_TOKEN_ID", &modal_credentials.token_id)
        .env("MODAL_TOKEN_SECRET", &modal_credentials.token_secret)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "failed to start Modal cloud agent run: `modal` CLI is not installed or not on PATH"
                .to_string()
        } else {
            format!("failed to start Modal cloud agent run: {error}")
        }
    })?;

    let session = Arc::new(TerminalSession::new_headless(
        TerminalSessionRuntime {
            kind: TerminalSessionKind::Cloud,
            provider: TerminalSessionProvider::Modal,
            profile_id: Some(profile_id.clone()),
        },
        TerminalSessionStatus::Running,
        "modal".to_string(),
        Some(remote_workspace),
    ));
    let info = session.info();
    terminal_manager.insert(session.clone())?;
    emit_session_state(&app, &session, TerminalSessionStatus::Running);

    let block = session
        .with_blocks(|blocks| {
            blocks.begin_command(
                &session.id,
                format!(
                    "MODAL_TOKEN_ID=******** MODAL_TOKEN_SECRET=******** modal run -q --env {} {}",
                    modal_environment,
                    shell_quote(&script_ref)
                ),
            )
        })
        .unwrap_or_default()
        .into_iter()
        .next()
        .ok_or_else(|| "failed to create modal cloud agent terminal block".to_string())?;
    let block_id = block.block.id.clone();
    let _ = app.emit(EVENT_BLOCK, block);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    cloud_manager.insert_child(session.id.clone(), child, vec![artifacts.root_dir.clone()])?;

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
    argv.extend([
        "--sync-strategy".to_string(),
        sync_strategy_arg(&launch.sync.strategy).to_string(),
    ]);
    if let Some(commit_message) = &launch.sync.commit_message {
        argv.extend(["--commit-message".to_string(), commit_message.clone()]);
    }
    if let Some(artifact_path) = &launch.sync.artifact_path {
        argv.extend(["--artifact-path".to_string(), artifact_path.clone()]);
    }
    if launch.policy.allow_push {
        argv.push("--allow-push".to_string());
    }
    if launch.policy.allow_pr_create {
        argv.push("--allow-pr-create".to_string());
    }

    argv
}

fn parse_sync_strategy(value: &str) -> Result<CloudSyncStrategy, String> {
    match value.trim() {
        "none" => Ok(CloudSyncStrategy::None),
        "git" => Ok(CloudSyncStrategy::Git),
        "patch" | "artifact" => Ok(CloudSyncStrategy::Patch),
        other => Err(format!("unsupported cloud sync strategy: {other}")),
    }
}

fn sync_strategy_arg(strategy: &CloudSyncStrategy) -> &'static str {
    match strategy {
        CloudSyncStrategy::None => "none",
        CloudSyncStrategy::Git => "git",
        CloudSyncStrategy::Patch => "patch",
    }
}

fn parse_transfer_mode(value: &str) -> Result<CloudCliTransferMode, String> {
    match value.trim() {
        "download" => Ok(CloudCliTransferMode::Download),
        "inline" | "inline-base64" => Ok(CloudCliTransferMode::InlineBase64),
        other => Err(format!("unsupported cloud CLI transfer mode: {other}")),
    }
}

fn resolve_cli_bootstrap_spec(
    request: &BuildCloudRunLaunchRequest,
) -> Result<CloudCliBootstrapSpec, String> {
    let mut bootstrap = CloudCliBootstrapSpec::default();
    if let Some(value) = request
        .bootstrap_install_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        bootstrap.install_url = value.to_string();
    }
    if let Some(value) = request
        .bootstrap_install_dir
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        bootstrap.install_dir = value.to_string();
    }
    if let Some(value) = request
        .bootstrap_binary_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        bootstrap.binary_name = value.to_string();
    }

    let requested_local_path = request
        .bootstrap_local_binary_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    let requested_mode = request
        .bootstrap_transfer_mode
        .as_deref()
        .map(parse_transfer_mode)
        .transpose()?;

    bootstrap.transfer_mode = requested_mode.unwrap_or(CloudCliTransferMode::Download);

    if matches!(bootstrap.transfer_mode, CloudCliTransferMode::InlineBase64) {
        let local_binary_path = requested_local_path
            .or_else(detect_local_cli_binary_path)
            .ok_or_else(|| {
                "inline CLI bootstrap requested but no local octomus-cli binary could be found"
                    .to_string()
            })?;
        bootstrap.local_binary_path = Some(local_binary_path.to_string_lossy().to_string());
    }

    Ok(bootstrap)
}

fn detect_local_cli_binary_path() -> Option<PathBuf> {
    if let Ok(value) = std::env::var("OCTOMUS_CLI_BOOTSTRAP_BINARY") {
        let path = PathBuf::from(value);
        if path.exists() {
            return Some(path);
        }
    }

    let mut candidates = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("target/release/octomus-cli"));
        candidates.push(cwd.join("target/debug/octomus-cli"));
    }

    candidates.into_iter().find(|path| path.exists())
}

fn build_remote_agent_script(launch_response: &BuildCloudRunLaunchResponse) -> String {
    let bootstrap = &launch_response.bootstrap;
    let mut script = String::new();
    script.push_str("set -eu\n");
    script.push_str(&format!(
        "octomus_dir={}\n",
        shell_quote(&bootstrap.install_dir)
    ));
    script.push_str(&format!(
        "octomus_url=\"${{OCTOMUS_CLI_URL:-{}}}\"\n",
        bootstrap.install_url
    ));
    script.push_str(&format!(
        "octomus_name={}\n",
        shell_quote(&bootstrap.binary_name)
    ));
    script.push_str("octomus_bin=\"$octomus_dir/$octomus_name\"\n");
    script.push_str("mkdir -p \"$octomus_dir\"\n");
    script.push_str("if [ ! -x \"$octomus_bin\" ]; then\n");
    script.push_str("  tmp=\"$octomus_bin.tmp.$$\"\n");
    match bootstrap.transfer_mode {
        CloudCliTransferMode::Download => {
            script.push_str("  if command -v curl >/dev/null 2>&1; then curl -fsSL \"$octomus_url\" -o \"$tmp\"; elif command -v wget >/dev/null 2>&1; then wget -qO \"$tmp\" \"$octomus_url\"; else echo \"curl or wget is required to install octomus-cli\" >&2; exit 127; fi\n");
        }
        CloudCliTransferMode::InlineBase64 => {
            let local_path = bootstrap
                .local_binary_path
                .as_deref()
                .ok_or_else(|| "inline CLI bootstrap requires a local binary path".to_string())
                .expect("validated when building launch response");
            let binary_bytes =
                fs::read(local_path).expect("inline CLI bootstrap path should be readable");
            let encoded = {
                use base64::Engine as _;
                base64::engine::general_purpose::STANDARD.encode(binary_bytes)
            };
            script.push_str("  if command -v base64 >/dev/null 2>&1; then\n");
            script.push_str("    cat <<'__OCTOMUS_CLI_B64__' | base64 --decode > \"$tmp\"\n");
            script.push_str(&encoded);
            script.push('\n');
            script.push_str("__OCTOMUS_CLI_B64__\n");
            script.push_str("  elif command -v python3 >/dev/null 2>&1; then\n");
            script.push_str("    OCTOMUS_TMP_PATH=\"$tmp\" python3 - <<'PY'\n");
            script.push_str("import base64, os, pathlib\n");
            script.push_str("data = \"\"\"\n");
            script.push_str(&encoded);
            script.push_str("\n\"\"\".strip()\n");
            script.push_str("pathlib.Path(os.environ['OCTOMUS_TMP_PATH']).write_bytes(base64.b64decode(data))\n");
            script.push_str("PY\n");
            script.push_str("  else\n");
            script.push_str("    echo \"base64 or python3 is required to install the inline octomus-cli bundle\" >&2\n");
            script.push_str("    exit 127\n");
            script.push_str("  fi\n");
        }
    }
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

fn remote_modal_workspace_path(local_workspace: Option<&Path>) -> String {
    let name = local_workspace
        .and_then(|path| path.file_name())
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("workspace");
    format!("/workspace/{name}")
}

fn load_modal_credentials(profile_id: &str) -> Result<ModalCredentials, String> {
    let account = format!("cloud-profile:{profile_id}:modal-token");
    let raw_secret = secure_store::load_secret(&account)?.ok_or_else(|| {
        "Modal token is missing from secure storage for this cloud profile".to_string()
    })?;
    parse_modal_credentials(raw_secret.trim())
}

fn parse_modal_credentials(raw: &str) -> Result<ModalCredentials, String> {
    if raw.is_empty() {
        return Err("Modal token is empty".to_string());
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) {
        if let Some(object) = value.as_object() {
            let token_id = object
                .get("token_id")
                .or_else(|| object.get("tokenId"))
                .or_else(|| object.get("id"))
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let token_secret = object
                .get("token_secret")
                .or_else(|| object.get("tokenSecret"))
                .or_else(|| object.get("secret"))
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty());
            if let (Some(token_id), Some(token_secret)) = (token_id, token_secret) {
                return Ok(ModalCredentials {
                    token_id: token_id.to_string(),
                    token_secret: token_secret.to_string(),
                });
            }
        }
    }

    let mut token_id = None;
    let mut token_secret = None;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(value) = trimmed.strip_prefix("MODAL_TOKEN_ID=") {
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                token_id = Some(value.to_string());
            }
        } else if let Some(value) = trimmed.strip_prefix("MODAL_TOKEN_SECRET=") {
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                token_secret = Some(value.to_string());
            }
        }
    }
    if let (Some(token_id), Some(token_secret)) = (token_id, token_secret) {
        return Ok(ModalCredentials {
            token_id,
            token_secret,
        });
    }

    if let Some((token_id, token_secret)) = raw.split_once(':') {
        let token_id = token_id.trim();
        let token_secret = token_secret.trim();
        if !token_id.is_empty() && !token_secret.is_empty() {
            return Ok(ModalCredentials {
                token_id: token_id.to_string(),
                token_secret: token_secret.to_string(),
            });
        }
    }

    let mut parts = raw.split_whitespace();
    if let (Some(token_id), Some(token_secret), None) = (parts.next(), parts.next(), parts.next()) {
        if !token_id.trim().is_empty() && !token_secret.trim().is_empty() {
            return Ok(ModalCredentials {
                token_id: token_id.trim().to_string(),
                token_secret: token_secret.trim().to_string(),
            });
        }
    }

    Err(
        "Modal token must contain both token id and token secret. Supported formats: MODAL_TOKEN_ID/MODAL_TOKEN_SECRET lines, JSON with token_id/token_secret, or token_id:token_secret."
            .to_string(),
    )
}

fn prepare_modal_launch_artifacts(
    launch_response: &BuildCloudRunLaunchResponse,
    local_workspace_path: Option<&Path>,
) -> Result<ModalLaunchArtifacts, String> {
    if matches!(
        launch_response.launch.sync.strategy,
        CloudSyncStrategy::Patch
    ) && launch_response.launch.git.is_none()
    {
        let workspace = local_workspace_path.ok_or_else(|| {
            "patch sync for Modal requires a local workspace directory to upload".to_string()
        })?;
        if !workspace.exists() {
            return Err(format!(
                "local workspace '{}' does not exist",
                workspace.display()
            ));
        }
        if !workspace.is_dir() {
            return Err(format!(
                "local workspace '{}' is not a directory",
                workspace.display()
            ));
        }
    }

    let mut root_dir = std::env::temp_dir();
    root_dir.push(format!(
        "octomus-modal-{}-{}",
        sanitize_filename(&launch_response.launch.session_id),
        Uuid::new_v4()
    ));
    fs::create_dir_all(&root_dir)
        .map_err(|error| format!("failed to create Modal launch staging directory: {error}"))?;

    let script_path = root_dir.join("octomus_modal_run.py");
    let script_contents = build_modal_runner_script(launch_response, local_workspace_path)?;
    fs::write(&script_path, script_contents)
        .map_err(|error| format!("failed to write Modal runner script: {error}"))?;

    Ok(ModalLaunchArtifacts {
        root_dir,
        script_path,
    })
}

fn build_modal_runner_script(
    launch_response: &BuildCloudRunLaunchResponse,
    local_workspace_path: Option<&Path>,
) -> Result<String, String> {
    let local_workspace = if launch_response.launch.git.is_none() {
        local_workspace_path
            .map(|path| path.to_string_lossy().to_string())
            .filter(|value| !value.trim().is_empty())
    } else {
        None
    };
    let launch_json = serde_json::to_string(&launch_response.launch)
        .map_err(|error| format!("failed to encode Modal launch spec: {error}"))?;
    let environment_json = serde_json::to_string(
        &launch_response
            .environment
            .iter()
            .map(|var| (&var.name, &var.value))
            .collect::<HashMap<_, _>>(),
    )
    .map_err(|error| format!("failed to encode Modal environment map: {error}"))?;
    let bootstrap_script_json = serde_json::to_string(&build_remote_agent_script(launch_response))
        .map_err(|error| format!("failed to encode Modal bootstrap script: {error}"))?;
    let local_workspace_json = serde_json::to_string(&local_workspace)
        .map_err(|error| format!("failed to encode Modal workspace source: {error}"))?;

    Ok(format!(
        r#"import json
import os
import subprocess
import sys

import modal

LAUNCH = json.loads({launch_json})
BOOTSTRAP_SCRIPT = json.loads({bootstrap_script_json})
ENV_VARS = json.loads({environment_json})
LOCAL_WORKSPACE = json.loads({local_workspace_json})
REMOTE_WORKSPACE = LAUNCH["workspace"]
TIMEOUT_SECONDS = int((LAUNCH.get("policy") or {{}}).get("maxRuntimeMinutes") or 60) * 60

image = modal.Image.debian_slim().apt_install("bash", "curl", "git", "ca-certificates")
if LOCAL_WORKSPACE:
    image = image.add_local_dir(LOCAL_WORKSPACE, REMOTE_WORKSPACE)

app = modal.App("octomus-cloud-agent")
secrets = [modal.Secret.from_dict(ENV_VARS)] if ENV_VARS else []

@app.function(image=image, secrets=secrets, timeout=TIMEOUT_SECONDS)
def run_octomus_cloud_agent():
    os.makedirs(REMOTE_WORKSPACE, exist_ok=True)
    proc = subprocess.Popen(
        ["bash", "-lc", BOOTSTRAP_SCRIPT],
        cwd="/",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        print(line, end="")
        sys.stdout.flush()
    exit_code = proc.wait()
    if exit_code != 0:
        raise RuntimeError(f"octomus-cli exited with status {{exit_code}}")
    return exit_code
"#
    ))
}

fn cleanup_cloud_paths(paths: &[PathBuf]) {
    for path in paths {
        let _ = if path.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        };
    }
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
        let exit_code = if let Some(mut process) = cloud_manager.take_child(&session.id) {
            let exit_code = process.child.wait().ok().and_then(|status| status.code());
            cleanup_cloud_paths(&process.cleanup_paths);
            exit_code
        } else {
            None
        };
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
        CloudRunEventKind::GitCommitCreated { branch, commit_sha } => {
            format!("[cloud:git-commit] branch={branch} sha={commit_sha}\n")
        }
        CloudRunEventKind::SyncArtifactReady {
            strategy,
            format,
            path,
            changed_files,
        } => {
            format!(
                "[cloud:artifact] strategy={strategy:?} format={format:?} path={} changedFiles={}\n",
                path,
                changed_files.len()
            )
        }
        CloudRunEventKind::Bootstrap {
            transfer_mode,
            binary_name,
            install_dir,
        } => format!(
            "[cloud:bootstrap] mode={transfer_mode:?} binary={binary_name} dir={install_dir}\n"
        ),
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

fn build_passthrough_environment() -> Vec<CloudRuntimeEnvVar> {
    passthrough_env_specs()
        .iter()
        .filter_map(|(name, sensitive)| {
            std::env::var(name).ok().and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(CloudRuntimeEnvVar {
                        name: (*name).to_string(),
                        value,
                        sensitive: *sensitive,
                    })
                }
            })
        })
        .collect()
}

fn passthrough_env_specs() -> &'static [(&'static str, bool)] {
    &[
        ("GITHUB_TOKEN", true),
        ("GH_TOKEN", true),
        ("GIT_AUTHOR_NAME", false),
        ("GIT_AUTHOR_EMAIL", false),
        ("GIT_COMMITTER_NAME", false),
        ("GIT_COMMITTER_EMAIL", false),
        ("OCTOMUS_GIT_AUTHOR_NAME", false),
        ("OCTOMUS_GIT_AUTHOR_EMAIL", false),
    ]
}

#[cfg(test)]
mod tests {
    use super::{
        parse_modal_credentials, parse_sync_strategy, remote_modal_workspace_path,
        resolve_cli_bootstrap_spec, BuildCloudRunLaunchRequest,
    };
    use octomus_cloud_protocol::{CloudCliTransferMode, CloudSyncStrategy};
    use std::{
        fs,
        path::{Path, PathBuf},
    };
    use uuid::Uuid;

    fn empty_request() -> BuildCloudRunLaunchRequest {
        BuildCloudRunLaunchRequest {
            session_id: "session-test".to_string(),
            provider: None,
            harness: None,
            control_url: None,
            workspace: None,
            prompt: None,
            repo: None,
            base_branch: None,
            work_branch: None,
            allow_push: None,
            allow_pr_create: None,
            sync_strategy: None,
            commit_message: None,
            artifact_path: None,
            bootstrap_install_url: None,
            bootstrap_install_dir: None,
            bootstrap_binary_name: None,
            bootstrap_transfer_mode: None,
            bootstrap_local_binary_path: None,
            include_llm_credentials: None,
            include_secrets_in_shell_command: None,
        }
    }

    #[test]
    fn parses_sync_strategy_aliases() {
        assert!(matches!(
            parse_sync_strategy("git").expect("git should parse"),
            CloudSyncStrategy::Git
        ));
        assert!(matches!(
            parse_sync_strategy("artifact").expect("artifact should parse"),
            CloudSyncStrategy::Patch
        ));
    }

    #[test]
    fn defaults_to_download_bootstrap_mode() {
        let request = empty_request();
        let bootstrap = resolve_cli_bootstrap_spec(&request).expect("bootstrap should resolve");
        assert!(matches!(
            bootstrap.transfer_mode,
            CloudCliTransferMode::Download
        ));
        assert!(bootstrap.local_binary_path.is_none());
    }

    #[test]
    fn resolves_inline_bootstrap_from_explicit_binary_path() {
        let mut path = std::env::temp_dir();
        path.push(format!("octomus-cli-test-{}", Uuid::new_v4()));
        fs::write(&path, b"binary").expect("temp binary should write");

        let mut request = empty_request();
        request.bootstrap_transfer_mode = Some("inline".to_string());
        request.bootstrap_local_binary_path = Some(path.to_string_lossy().to_string());

        let bootstrap = resolve_cli_bootstrap_spec(&request).expect("bootstrap should resolve");
        assert!(matches!(
            bootstrap.transfer_mode,
            CloudCliTransferMode::InlineBase64
        ));
        assert_eq!(
            PathBuf::from(
                bootstrap
                    .local_binary_path
                    .expect("local path should be preserved")
            ),
            path
        );

        let _ = fs::remove_file(path);
    }

    #[test]
    fn parses_modal_credentials_from_env_lines() {
        let credentials =
            parse_modal_credentials("MODAL_TOKEN_ID=ak-test\nMODAL_TOKEN_SECRET=as-test\n")
                .expect("modal env var format should parse");
        assert_eq!(credentials.token_id, "ak-test");
        assert_eq!(credentials.token_secret, "as-test");
    }

    #[test]
    fn parses_modal_credentials_from_json() {
        let credentials =
            parse_modal_credentials(r#"{"token_id":"ak-json","token_secret":"as-json"}"#)
                .expect("modal JSON format should parse");
        assert_eq!(credentials.token_id, "ak-json");
        assert_eq!(credentials.token_secret, "as-json");
    }

    #[test]
    fn derives_modal_workspace_from_local_directory_name() {
        assert_eq!(
            remote_modal_workspace_path(Some(Path::new("/Users/example/project-name"))),
            "/workspace/project-name"
        );
        assert_eq!(remote_modal_workspace_path(None), "/workspace/workspace");
    }
}
