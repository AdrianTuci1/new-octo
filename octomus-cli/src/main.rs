use octomus_cloud_protocol::{
    CloudArtifactFormat, CloudChangedFile, CloudChangedFileKind, CloudCliBootstrapSpec,
    CloudProvider, CloudRunEvent, CloudRunEventKind, CloudRunGitSpec, CloudRunLaunchSpec,
    CloudRunLlmSpec, CloudRunPolicy, CloudRunStatus, CloudSyncStrategy, HarnessKind,
    TerminalStream,
};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    env, fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Command, ExitCode},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub target_os: &'static str,
    pub target_arch: &'static str,
    pub supported_session_kinds: Vec<&'static str>,
    pub supported_cloud_providers: Vec<&'static str>,
}

pub fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        name: "octomus-cli",
        version: env!("CARGO_PKG_VERSION"),
        target_os: std::env::consts::OS,
        target_arch: std::env::consts::ARCH,
        supported_session_kinds: vec!["local", "cloud"],
        supported_cloud_providers: vec!["custom-vm", "modal"],
    }
}

fn print_help() {
    println!(
        "\
octomus-cli

USAGE:
  octomus-cli <command>

COMMANDS:
  run-agent      Start a headless cloud agent runtime and emit JSONL events
  runtime-info   Print JSON metadata about the current headless runtime
  version        Print the CLI version
  help           Print this help message
"
    );
}

fn main() -> ExitCode {
    let mut args = env::args().skip(1);

    match args.next().as_deref() {
        Some("run-agent") => match run_agent(args.collect()) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        },
        Some("runtime-info") => match serde_json::to_string_pretty(&runtime_info()) {
            Ok(json) => {
                println!("{json}");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("failed to serialize runtime info: {error}");
                ExitCode::FAILURE
            }
        },
        Some("version") | Some("--version") | Some("-V") => {
            println!("{}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        Some("help") | Some("--help") | Some("-h") | None => {
            print_help();
            ExitCode::SUCCESS
        }
        Some(command) => {
            eprintln!("unknown command: {command}");
            eprintln!();
            print_help();
            ExitCode::FAILURE
        }
    }
}

struct EventEmitter {
    session_id: String,
    sequence: u64,
}

#[derive(Clone)]
struct WorkspaceSnapshot {
    files: BTreeMap<String, Vec<u8>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonBundleArtifact {
    format: &'static str,
    workspace: String,
    files: Vec<JsonBundleFileChange>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonBundleFileChange {
    path: String,
    kind: CloudChangedFileKind,
    encoding: &'static str,
    data: String,
}

impl EventEmitter {
    fn new(session_id: String) -> Self {
        Self {
            session_id,
            sequence: 0,
        }
    }

    fn emit(&mut self, event: CloudRunEventKind) -> Result<(), String> {
        self.sequence += 1;
        let event = CloudRunEvent {
            session_id: self.session_id.clone(),
            sequence: self.sequence,
            event,
            timestamp_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| format!("system clock is before unix epoch: {error}"))?
                .as_millis(),
        };
        let line = serde_json::to_string(&event)
            .map_err(|error| format!("failed to encode cloud run event: {error}"))?;
        println!("{line}");
        Ok(())
    }

    fn status(
        &mut self,
        status: CloudRunStatus,
        message: impl Into<Option<String>>,
    ) -> Result<(), String> {
        self.emit(CloudRunEventKind::Status {
            status,
            message: message.into(),
        })
    }

    fn output(&mut self, stream: TerminalStream, data: impl Into<String>) -> Result<(), String> {
        let data = data.into();
        if data.is_empty() {
            return Ok(());
        }
        self.emit(CloudRunEventKind::TerminalOutput { stream, data })
    }
}

fn run_agent(args: Vec<String>) -> Result<(), String> {
    let launch = parse_launch_spec(args)?;
    let mut emitter = EventEmitter::new(launch.session_id.clone());

    if let Err(error) = run_agent_inner(&launch, &mut emitter) {
        let _ = emitter.emit(CloudRunEventKind::Error {
            message: error.clone(),
        });
        let _ = emitter.emit(CloudRunEventKind::Done {
            status: CloudRunStatus::Failed,
        });
        return Err(error);
    }

    Ok(())
}

fn run_agent_inner(launch: &CloudRunLaunchSpec, emitter: &mut EventEmitter) -> Result<(), String> {
    emitter.status(
        CloudRunStatus::Booting,
        Some(format!(
            "Starting {:?} harness on {:?}",
            launch.harness, launch.provider
        )),
    )?;
    emit_bootstrap_config(launch, emitter)?;

    let workspace = PathBuf::from(&launch.workspace);
    emit_llm_config(launch, emitter)?;
    prepare_workspace(&workspace, launch.git.as_ref(), emitter)?;
    let patch_snapshot = if matches!(launch.sync.strategy, CloudSyncStrategy::Patch)
        && !workspace.join(".git").exists()
    {
        Some(capture_workspace_snapshot(&workspace)?)
    } else {
        None
    };

    emitter.status(
        CloudRunStatus::RunningHarness,
        Some("Workspace is ready".to_string()),
    )?;
    run_configured_harness(&workspace, launch, emitter)?;
    sync_workspace(&workspace, launch, patch_snapshot.as_ref(), emitter)?;
    emit_git_status(&workspace, launch.git.as_ref(), emitter)?;

    emitter.emit(CloudRunEventKind::Done {
        status: CloudRunStatus::Completed,
    })?;
    Ok(())
}

fn parse_launch_spec(args: Vec<String>) -> Result<CloudRunLaunchSpec, String> {
    if let Some(path) = option_value(&args, "--launch-spec") {
        return read_launch_spec(path);
    }

    let session_id = option_value(&args, "--session-id")
        .or_else(|| env::var("OCTOMUS_SESSION_ID").ok())
        .ok_or_else(|| "run-agent requires --session-id or OCTOMUS_SESSION_ID".to_string())?;
    let provider = parse_provider(
        option_value(&args, "--provider")
            .or_else(|| env::var("OCTOMUS_PROVIDER").ok())
            .as_deref()
            .unwrap_or("custom-vm"),
    )?;
    let harness = parse_harness(
        option_value(&args, "--harness")
            .or_else(|| env::var("OCTOMUS_HARNESS").ok())
            .as_deref()
            .unwrap_or("octomus"),
    )?;
    let workspace = option_value(&args, "--workspace")
        .or_else(|| env::var("OCTOMUS_WORKSPACE").ok())
        .unwrap_or_else(|| "/workspace".to_string());
    let control_url =
        option_value(&args, "--control-url").or_else(|| env::var("OCTOMUS_CONTROL_URL").ok());
    let prompt = option_value(&args, "--prompt").or_else(|| env::var("OCTOMUS_PROMPT").ok());
    let git = match option_value(&args, "--repo").or_else(|| env::var("OCTOMUS_REPO").ok()) {
        Some(repo) => Some(CloudRunGitSpec {
            repo,
            base_branch: option_value(&args, "--base")
                .or_else(|| env::var("OCTOMUS_BASE_BRANCH").ok())
                .unwrap_or_else(|| "main".to_string()),
            work_branch: option_value(&args, "--branch")
                .or_else(|| env::var("OCTOMUS_WORK_BRANCH").ok())
                .unwrap_or_else(|| format!("octomus/{session_id}")),
        }),
        None => None,
    };
    let default_sync_strategy = if git.is_some() { "git" } else { "patch" };

    Ok(CloudRunLaunchSpec {
        session_id,
        provider,
        harness,
        control_url,
        workspace,
        prompt,
        git,
        llm: runtime_llm_spec(),
        policy: CloudRunPolicy {
            allow_push: has_flag(&args, "--allow-push"),
            allow_pr_create: has_flag(&args, "--allow-pr-create"),
            allow_merge: false,
            max_runtime_minutes: Some(60),
        },
        sync: octomus_cloud_protocol::CloudRunSyncSpec {
            strategy: parse_sync_strategy(
                option_value(&args, "--sync-strategy")
                    .or_else(|| env::var("OCTOMUS_SYNC_STRATEGY").ok())
                    .as_deref()
                    .unwrap_or(default_sync_strategy),
            )?,
            commit_message: option_value(&args, "--commit-message")
                .or_else(|| env::var("OCTOMUS_COMMIT_MESSAGE").ok()),
            artifact_path: option_value(&args, "--artifact-path")
                .or_else(|| env::var("OCTOMUS_ARTIFACT_PATH").ok()),
        },
        bootstrap: CloudCliBootstrapSpec::default(),
    })
}

fn runtime_llm_spec() -> Option<CloudRunLlmSpec> {
    let api_key = env::var("OCTOMUS_AI_API_KEY")
        .or_else(|_| env::var("OPENAI_API_KEY"))
        .ok();
    let base_url = env::var("OCTOMUS_AI_BASE_URL")
        .or_else(|_| env::var("OPENAI_BASE_URL"))
        .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());
    let model_id = env::var("OCTOMUS_AI_MODEL")
        .or_else(|_| env::var("OPENAI_MODEL"))
        .unwrap_or_else(|_| "gpt-4o-mini".to_string());

    Some(CloudRunLlmSpec {
        provider_label: env::var("OCTOMUS_AI_PROVIDER")
            .unwrap_or_else(|_| "openai-compatible".to_string()),
        base_url,
        model_id,
        has_api_key: api_key
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty()),
    })
}

fn emit_llm_config(launch: &CloudRunLaunchSpec, emitter: &mut EventEmitter) -> Result<(), String> {
    let llm = launch.llm.clone().or_else(runtime_llm_spec);
    let Some(llm) = llm else {
        return Ok(());
    };

    emitter.emit(CloudRunEventKind::LlmConfig {
        provider_label: llm.provider_label,
        base_url: llm.base_url,
        model_id: llm.model_id,
        has_api_key: llm.has_api_key,
    })
}

fn read_launch_spec(path: String) -> Result<CloudRunLaunchSpec, String> {
    let json = if path == "-" {
        let mut input = String::new();
        io::stdin()
            .read_to_string(&mut input)
            .map_err(|error| format!("failed to read launch spec from stdin: {error}"))?;
        input
    } else {
        fs::read_to_string(&path)
            .map_err(|error| format!("failed to read launch spec '{path}': {error}"))?
    };
    serde_json::from_str(&json).map_err(|error| format!("invalid launch spec JSON: {error}"))
}

fn option_value(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].clone())
}

fn has_flag(args: &[String], name: &str) -> bool {
    args.iter().any(|arg| arg == name)
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

fn parse_sync_strategy(value: &str) -> Result<CloudSyncStrategy, String> {
    match value {
        "none" => Ok(CloudSyncStrategy::None),
        "git" => Ok(CloudSyncStrategy::Git),
        "patch" | "artifact" => Ok(CloudSyncStrategy::Patch),
        other => Err(format!("unsupported cloud sync strategy: {other}")),
    }
}

fn emit_bootstrap_config(
    launch: &CloudRunLaunchSpec,
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    emitter.emit(CloudRunEventKind::Bootstrap {
        transfer_mode: launch.bootstrap.transfer_mode.clone(),
        binary_name: launch.bootstrap.binary_name.clone(),
        install_dir: launch.bootstrap.install_dir.clone(),
    })
}

fn prepare_workspace(
    workspace: &Path,
    git: Option<&CloudRunGitSpec>,
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    emitter.status(
        CloudRunStatus::PreparingWorkspace,
        Some(format!("Preparing {}", workspace.display())),
    )?;
    fs::create_dir_all(workspace).map_err(|error| {
        format!(
            "failed to create workspace '{}': {error}",
            workspace.display()
        )
    })?;

    let Some(git) = git else {
        return Ok(());
    };

    if workspace.join(".git").exists() {
        run_command(
            workspace,
            "git",
            &["fetch", "origin", &git.base_branch],
            emitter,
        )?;
    } else {
        let parent = workspace.parent().unwrap_or_else(|| Path::new("/"));
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create workspace parent '{}': {error}",
                parent.display()
            )
        })?;
        if fs::read_dir(workspace)
            .map_err(|error| {
                format!(
                    "failed to inspect workspace '{}': {error}",
                    workspace.display()
                )
            })?
            .next()
            .is_some()
        {
            return Err(format!(
                "workspace '{}' is not empty and is not a git repository",
                workspace.display()
            ));
        }
        let workspace_arg = workspace
            .to_str()
            .ok_or_else(|| "workspace path is not valid UTF-8".to_string())?;
        run_command(
            parent,
            "git",
            &[
                "clone",
                "--branch",
                &git.base_branch,
                &git.repo,
                workspace_arg,
            ],
            emitter,
        )?;
    }

    run_command(
        workspace,
        "git",
        &[
            "checkout",
            "-B",
            &git.work_branch,
            &format!("origin/{}", git.base_branch),
        ],
        emitter,
    )?;
    Ok(())
}

fn run_configured_harness(
    workspace: &Path,
    launch: &CloudRunLaunchSpec,
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    if let Some(prompt) = &launch.prompt {
        emitter.output(TerminalStream::Stdout, format!("Prompt: {prompt}\n"))?;
    }

    let Ok(command) = env::var("OCTOMUS_HARNESS_COMMAND") else {
        return run_builtin_llm_harness(launch, emitter);
    };

    run_command(workspace, "sh", &["-lc", &command], emitter)
}

fn run_builtin_llm_harness(
    launch: &CloudRunLaunchSpec,
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    let prompt = launch
        .prompt
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "cloud agent prompt is required when no harness command is configured".to_string()
        })?;
    let api_key = env::var("OCTOMUS_AI_API_KEY")
        .or_else(|_| env::var("OPENAI_API_KEY"))
        .map_err(|_| {
            "OCTOMUS_AI_API_KEY or OPENAI_API_KEY is required for the built-in cloud harness"
                .to_string()
        })?;
    let base_url = env::var("OCTOMUS_AI_BASE_URL")
        .or_else(|_| env::var("OPENAI_BASE_URL"))
        .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());
    let model = env::var("OCTOMUS_AI_MODEL")
        .or_else(|_| env::var("OPENAI_MODEL"))
        .unwrap_or_else(|_| "gpt-4o-mini".to_string());
    let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    emitter.output(
        TerminalStream::Stdout,
        format!("Running built-in OpenAI-compatible cloud harness with model {model}.\n"),
    )?;

    let response: serde_json::Value = reqwest::blocking::Client::new()
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are Octomus running in a cloud runtime. Be concise, practical, and report any concrete commands or repository steps you would take."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }))
        .send()
        .map_err(|error| format!("cloud LLM request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("cloud LLM provider returned an error: {error}"))?
        .json()
        .map_err(|error| format!("failed to parse cloud LLM response: {error}"))?;

    let text = response
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
        .unwrap_or("")
        .trim();

    if text.is_empty() {
        return Err("cloud LLM response did not include assistant text".to_string());
    }

    emitter.output(TerminalStream::Stdout, format!("{text}\n"))?;
    Ok(())
}

fn sync_workspace(
    workspace: &Path,
    launch: &CloudRunLaunchSpec,
    patch_snapshot: Option<&WorkspaceSnapshot>,
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    match launch.sync.strategy {
        CloudSyncStrategy::None => Ok(()),
        CloudSyncStrategy::Git => sync_workspace_via_git(workspace, launch, emitter),
        CloudSyncStrategy::Patch => {
            sync_workspace_via_patch(workspace, launch, patch_snapshot, emitter)
        }
    }
}

fn sync_workspace_via_git(
    workspace: &Path,
    launch: &CloudRunLaunchSpec,
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    let git = launch
        .git
        .as_ref()
        .ok_or_else(|| "git sync requires git launch settings".to_string())?;

    let status_output = command_output(workspace, "git", &["status", "--porcelain"])?;
    let dirty = !String::from_utf8_lossy(&status_output.stdout)
        .trim()
        .is_empty();
    if !dirty {
        return Ok(());
    }

    emitter.status(
        CloudRunStatus::PushingChanges,
        Some("Collecting and committing workspace changes".to_string()),
    )?;
    ensure_git_identity(workspace, emitter)?;
    run_command(workspace, "git", &["add", "-A"], emitter)?;

    let commit_message = launch
        .sync
        .commit_message
        .clone()
        .unwrap_or_else(|| format!("Octomus cloud agent update for {}", launch.session_id));
    run_command(
        workspace,
        "git",
        &["commit", "-m", &commit_message],
        emitter,
    )?;

    let rev_parse = command_output(workspace, "git", &["rev-parse", "HEAD"])?;
    let commit_sha = String::from_utf8_lossy(&rev_parse.stdout)
        .trim()
        .to_string();
    emitter.emit(CloudRunEventKind::GitCommitCreated {
        branch: git.work_branch.clone(),
        commit_sha,
    })?;

    if launch.policy.allow_push {
        run_command(
            workspace,
            "git",
            &["push", "-u", "origin", &git.work_branch],
            emitter,
        )?;
    }

    if launch.policy.allow_pr_create {
        maybe_create_pull_request(workspace, git, &commit_message, emitter)?;
    }

    Ok(())
}

fn ensure_git_identity(workspace: &Path, emitter: &mut EventEmitter) -> Result<(), String> {
    let current_name = command_output(workspace, "git", &["config", "--get", "user.name"])
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default();
    let current_email = command_output(workspace, "git", &["config", "--get", "user.email"])
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default();

    let desired_name = env::var("OCTOMUS_GIT_AUTHOR_NAME")
        .or_else(|_| env::var("GIT_AUTHOR_NAME"))
        .or_else(|_| env::var("GIT_COMMITTER_NAME"))
        .unwrap_or_else(|_| "Octomus Cloud".to_string());
    let desired_email = env::var("OCTOMUS_GIT_AUTHOR_EMAIL")
        .or_else(|_| env::var("GIT_AUTHOR_EMAIL"))
        .or_else(|_| env::var("GIT_COMMITTER_EMAIL"))
        .unwrap_or_else(|_| "cloud@octomus.dev".to_string());

    if current_name.is_empty() {
        run_command(
            workspace,
            "git",
            &["config", "user.name", &desired_name],
            emitter,
        )?;
    }
    if current_email.is_empty() {
        run_command(
            workspace,
            "git",
            &["config", "user.email", &desired_email],
            emitter,
        )?;
    }

    Ok(())
}

fn maybe_create_pull_request(
    workspace: &Path,
    git: &CloudRunGitSpec,
    commit_message: &str,
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    let gh_check = Command::new("gh")
        .arg("--version")
        .current_dir(workspace)
        .output();
    let Ok(gh_check) = gh_check else {
        emitter.output(
            TerminalStream::Stderr,
            "GitHub CLI is not installed in the cloud runtime, skipping PR creation.\n",
        )?;
        return Ok(());
    };
    if !gh_check.status.success() {
        emitter.output(
            TerminalStream::Stderr,
            "GitHub CLI is unavailable in the cloud runtime, skipping PR creation.\n",
        )?;
        return Ok(());
    }

    emitter.status(
        CloudRunStatus::CreatingPullRequest,
        Some("Creating pull request from the cloud workspace".to_string()),
    )?;
    let output = command_output(
        workspace,
        "gh",
        &[
            "pr",
            "create",
            "--head",
            &git.work_branch,
            "--base",
            &git.base_branch,
            "--title",
            commit_message,
            "--body",
            "Created by the Octomus cloud agent runtime.",
        ],
    )?;
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !url.is_empty() {
        emitter.emit(CloudRunEventKind::PullRequestCreated { url })?;
    }
    Ok(())
}

fn sync_workspace_via_patch(
    workspace: &Path,
    launch: &CloudRunLaunchSpec,
    patch_snapshot: Option<&WorkspaceSnapshot>,
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    emitter.status(
        CloudRunStatus::PushingChanges,
        Some("Preparing a direct change artifact from the cloud workspace".to_string()),
    )?;

    let artifact_path = launch
        .sync
        .artifact_path
        .clone()
        .unwrap_or_else(|| default_artifact_path(workspace, workspace.join(".git").exists()));
    let artifact_path = workspace.join(artifact_path);
    if let Some(parent) = artifact_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create artifact directory '{}': {error}",
                parent.display()
            )
        })?;
    }

    if workspace.join(".git").exists() {
        let output = command_output(
            workspace,
            "git",
            &["diff", "--binary", "--find-renames", "HEAD"],
        )?;
        let patch = output.stdout;
        fs::write(&artifact_path, &patch).map_err(|error| {
            format!(
                "failed to write patch artifact '{}': {error}",
                artifact_path.display()
            )
        })?;
        let changed_files = git_changed_files(workspace)?;
        emitter.emit(CloudRunEventKind::SyncArtifactReady {
            strategy: CloudSyncStrategy::Patch,
            format: CloudArtifactFormat::UnifiedDiff,
            path: artifact_path.display().to_string(),
            changed_files,
        })?;
        return Ok(());
    }

    let baseline = patch_snapshot.ok_or_else(|| {
        "patch sync for a non-git workspace requires an initial workspace snapshot".to_string()
    })?;
    let artifact = build_json_bundle_artifact(workspace, baseline)?;
    let changed_files = artifact
        .files
        .iter()
        .map(|file| CloudChangedFile {
            path: file.path.clone(),
            kind: file.kind.clone(),
        })
        .collect::<Vec<_>>();
    let json = serde_json::to_vec_pretty(&artifact)
        .map_err(|error| format!("failed to encode patch artifact JSON: {error}"))?;
    fs::write(&artifact_path, json).map_err(|error| {
        format!(
            "failed to write patch artifact '{}': {error}",
            artifact_path.display()
        )
    })?;
    emitter.emit(CloudRunEventKind::SyncArtifactReady {
        strategy: CloudSyncStrategy::Patch,
        format: CloudArtifactFormat::JsonBundle,
        path: artifact_path.display().to_string(),
        changed_files,
    })?;
    Ok(())
}

fn default_artifact_path(workspace: &Path, has_git: bool) -> String {
    let _ = workspace;
    if has_git {
        ".octomus-cloud/changes.patch".to_string()
    } else {
        ".octomus-cloud/changes.json".to_string()
    }
}

fn git_changed_files(workspace: &Path) -> Result<Vec<CloudChangedFile>, String> {
    let output = command_output(workspace, "git", &["status", "--porcelain"])?;
    Ok(parse_git_status_porcelain(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

fn parse_git_status_porcelain(output: &str) -> Vec<CloudChangedFile> {
    output
        .lines()
        .filter_map(|line| {
            if line.len() < 4 {
                return None;
            }
            let status = &line[..2];
            let path = line[3..].trim();
            if path.is_empty() {
                return None;
            }
            let kind = if status.contains('D') {
                CloudChangedFileKind::Deleted
            } else if status.contains('?') || status.contains('A') {
                CloudChangedFileKind::Created
            } else {
                CloudChangedFileKind::Updated
            };
            Some(CloudChangedFile {
                path: path.to_string(),
                kind,
            })
        })
        .collect()
}

fn capture_workspace_snapshot(workspace: &Path) -> Result<WorkspaceSnapshot, String> {
    let mut files = BTreeMap::new();
    collect_workspace_files(workspace, workspace, &mut files)?;
    Ok(WorkspaceSnapshot { files })
}

fn collect_workspace_files(
    root: &Path,
    current: &Path,
    files: &mut BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(|error| {
        format!(
            "failed to read workspace directory '{}': {error}",
            current.display()
        )
    })? {
        let entry = entry.map_err(|error| format!("failed to inspect workspace entry: {error}"))?;
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if file_name == ".git" || file_name == ".octomus-cloud" {
            continue;
        }
        let file_type = entry.file_type().map_err(|error| {
            format!("failed to inspect file type '{}': {error}", path.display())
        })?;
        if file_type.is_dir() {
            collect_workspace_files(root, &path, files)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let relative_path = path
            .strip_prefix(root)
            .map_err(|error| format!("failed to relativize '{}': {error}", path.display()))?
            .to_string_lossy()
            .to_string();
        files.insert(
            relative_path,
            fs::read(&path)
                .map_err(|error| format!("failed to read file '{}': {error}", path.display()))?,
        );
    }
    Ok(())
}

fn build_json_bundle_artifact(
    workspace: &Path,
    baseline: &WorkspaceSnapshot,
) -> Result<JsonBundleArtifact, String> {
    let current = capture_workspace_snapshot(workspace)?;
    let all_paths = baseline
        .files
        .keys()
        .chain(current.files.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut files = Vec::new();

    for path in all_paths {
        match (baseline.files.get(&path), current.files.get(&path)) {
            (None, Some(current_bytes)) => files.push(bundle_file_change(
                path,
                CloudChangedFileKind::Created,
                current_bytes,
            )),
            (Some(_), None) => files.push(JsonBundleFileChange {
                path,
                kind: CloudChangedFileKind::Deleted,
                encoding: "utf-8",
                data: String::new(),
            }),
            (Some(previous), Some(current_bytes)) if previous != current_bytes => files.push(
                bundle_file_change(path, CloudChangedFileKind::Updated, current_bytes),
            ),
            _ => {}
        }
    }

    Ok(JsonBundleArtifact {
        format: "octomus-json-bundle/v1",
        workspace: workspace.display().to_string(),
        files,
    })
}

fn bundle_file_change(
    path: String,
    kind: CloudChangedFileKind,
    bytes: &[u8],
) -> JsonBundleFileChange {
    match std::str::from_utf8(bytes) {
        Ok(text) => JsonBundleFileChange {
            path,
            kind,
            encoding: "utf-8",
            data: text.to_string(),
        },
        Err(_) => JsonBundleFileChange {
            path,
            kind,
            encoding: "base64",
            data: {
                use base64::Engine as _;
                base64::engine::general_purpose::STANDARD.encode(bytes)
            },
        },
    }
}

fn emit_git_status(
    workspace: &Path,
    git: Option<&CloudRunGitSpec>,
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    let Some(git) = git else {
        return Ok(());
    };
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(workspace)
        .output()
        .map_err(|error| format!("failed to inspect git status: {error}"))?;
    let dirty = !String::from_utf8_lossy(&output.stdout).trim().is_empty();
    emitter.emit(CloudRunEventKind::GitStatus {
        branch: Some(git.work_branch.clone()),
        dirty,
    })
}

fn run_command(
    cwd: &Path,
    program: &str,
    args: &[&str],
    emitter: &mut EventEmitter,
) -> Result<(), String> {
    emitter.output(
        TerminalStream::Stdout,
        format!("$ {} {}\n", program, args.join(" ")),
    )?;
    let output = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("failed to run {program}: {error}"))?;
    emitter.output(
        TerminalStream::Stdout,
        String::from_utf8_lossy(&output.stdout).to_string(),
    )?;
    emitter.output(
        TerminalStream::Stderr,
        String::from_utf8_lossy(&output.stderr).to_string(),
    )?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "{program} exited with status {}",
            output
                .status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        ))
    }
}

fn command_output(
    cwd: &Path,
    program: &str,
    args: &[&str],
) -> Result<std::process::Output, String> {
    Command::new(program)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("failed to run {program}: {error}"))
        .and_then(|output| {
            if output.status.success() {
                Ok(output)
            } else {
                Err(format!(
                    "{program} exited with status {}",
                    output
                        .status
                        .code()
                        .map(|code| code.to_string())
                        .unwrap_or_else(|| "unknown".to_string())
                ))
            }
        })
}
