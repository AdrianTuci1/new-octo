use serde_json::Value;
use tokio::process::Command;
use tokio::{
    fs,
    io::{AsyncBufReadExt, BufReader},
    process::Child,
};

use super::{
    harness::{
        AgentCancellation, AgentEventSink, AgentHarness, AgentHarnessContext, AgentHarnessError,
        AgentHarnessOutcome,
    },
    sources::AgentModelSourceKind,
    types::{AgentModelSourceConnectRequest, AgentRunStatus, AgentUsage},
};

pub struct CliDelegateHarness {
    kind: AgentModelSourceKind,
    model_alias: String,
    session_id: Option<String>,
}

impl CliDelegateHarness {
    pub fn new(
        kind: AgentModelSourceKind,
        model_alias: String,
        session_id: Option<String>,
    ) -> Self {
        Self {
            kind,
            model_alias,
            session_id,
        }
    }
}

impl AgentHarness for CliDelegateHarness {
    fn kind(&self) -> &'static str {
        match self.kind {
            AgentModelSourceKind::Codex => "codex-cli",
            AgentModelSourceKind::Claude => "claude-cli",
            AgentModelSourceKind::OpenAiCompatible => "openai-compatible",
        }
    }

    fn validate(&self) -> Result<(), AgentHarnessError> {
        match self.kind {
            AgentModelSourceKind::Codex => {
                super::sources::connect_model_source(AgentModelSourceConnectRequest {
                    kind: "codex".to_string(),
                })
                .map(|_| ())
                .map_err(AgentHarnessError::new)
            }
            AgentModelSourceKind::Claude => {
                super::sources::connect_model_source(AgentModelSourceConnectRequest {
                    kind: "claude".to_string(),
                })
                .map(|_| ())
                .map_err(AgentHarnessError::new)
            }
            AgentModelSourceKind::OpenAiCompatible => Ok(()),
        }
    }

    async fn run_async(
        &self,
        context: AgentHarnessContext,
        sink: AgentEventSink,
        cancellation: AgentCancellation,
    ) -> Result<AgentHarnessOutcome, AgentHarnessError> {
        match self.kind {
            AgentModelSourceKind::Codex => {
                run_codex(
                    context,
                    sink,
                    cancellation,
                    &self.model_alias,
                    self.session_id.clone(),
                )
                .await
            }
            AgentModelSourceKind::Claude => {
                run_claude(
                    context,
                    sink,
                    cancellation,
                    &self.model_alias,
                    self.session_id.clone(),
                )
                .await
            }
            AgentModelSourceKind::OpenAiCompatible => Err(AgentHarnessError::new(
                "openai-compatible should use the native runtime",
            )),
        }
    }
}

async fn run_codex(
    context: AgentHarnessContext,
    sink: AgentEventSink,
    cancellation: AgentCancellation,
    model_alias: &str,
    session_id: Option<String>,
) -> Result<AgentHarnessOutcome, AgentHarnessError> {
    let output_file =
        std::env::temp_dir().join(format!("octomus-codex-{}.last-message.txt", context.run_id));
    let prompt = build_prompt_for_cli(&context);

    let mut command = Command::new("codex");
    command.current_dir(context.cwd.clone().unwrap_or_else(|| ".".to_string()));
    if let Some(existing) = session_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        command.arg("exec").arg("resume").arg(existing);
    } else {
        command.arg("exec");
    }
    command
        .arg("--ephemeral")
        .arg("--skip-git-repo-check")
        .arg("--color")
        .arg("never")
        .arg("--output-last-message")
        .arg(&output_file);
    if model_alias != "default" {
        command.arg("--model").arg(model_alias);
    }
    command.arg(prompt);
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    sink.status(
        AgentRunStatus::Running,
        Some("Running through Codex CLI.".to_string()),
    );
    let mut child = command
        .spawn()
        .map_err(|error| AgentHarnessError::new(format!("failed to launch Codex CLI: {error}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_task = tokio::spawn(stream_codex_stdout(stdout, sink.clone()));
    let stderr_task = tokio::spawn(stream_stderr(stderr, sink.clone()));

    let status = wait_for_child(&mut child, &cancellation).await?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    if status.is_none() {
        return Ok(AgentHarnessOutcome {
            status: AgentRunStatus::Cancelled,
            usage: AgentUsage::default(),
        });
    }
    let status = status.expect("checked above");

    if let Ok(contents) = fs::read_to_string(&output_file).await {
        let trimmed = contents.trim();
        if !trimmed.is_empty() {
            sink.token(format!("{trimmed}\n"));
        }
    }

    if status.success() {
        Ok(AgentHarnessOutcome {
            status: AgentRunStatus::Completed,
            usage: AgentUsage::default(),
        })
    } else {
        Err(AgentHarnessError::new(format!(
            "Codex CLI exited with status {}",
            status.code().unwrap_or(-1)
        )))
    }
}

async fn run_claude(
    context: AgentHarnessContext,
    sink: AgentEventSink,
    cancellation: AgentCancellation,
    model_alias: &str,
    session_id: Option<String>,
) -> Result<AgentHarnessOutcome, AgentHarnessError> {
    let prompt = build_prompt_for_cli(&context);
    let cwd = context.cwd.clone().unwrap_or_else(|| ".".to_string());
    let mut command = Command::new("claude");
    command.current_dir(cwd);

    if let Some(existing) = session_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        command.arg("-r").arg(existing);
    } else if context.prompt.trim().is_empty() {
        command.arg("-c");
    }

    command
        .arg("-p")
        .arg(&prompt)
        .arg("--output-format")
        .arg("stream-json")
        .arg("--verbose")
        .arg("--include-partial-messages");
    if model_alias != "default" {
        command.arg("--model").arg(model_alias);
    }
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    sink.status(
        AgentRunStatus::Running,
        Some("Running through Claude Code CLI.".to_string()),
    );
    let mut child = command.spawn().map_err(|error| {
        AgentHarnessError::new(format!("failed to launch Claude Code CLI: {error}"))
    })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_task = tokio::spawn(stream_claude_stdout(stdout, sink.clone()));
    let stderr_task = tokio::spawn(stream_stderr(stderr, sink.clone()));

    let status = wait_for_child(&mut child, &cancellation).await?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    if status.is_none() {
        return Ok(AgentHarnessOutcome {
            status: AgentRunStatus::Cancelled,
            usage: AgentUsage::default(),
        });
    }
    let status = status.expect("checked above");

    if status.success() {
        Ok(AgentHarnessOutcome {
            status: AgentRunStatus::Completed,
            usage: AgentUsage::default(),
        })
    } else {
        Err(AgentHarnessError::new(format!(
            "Claude Code CLI exited with status {}",
            status.code().unwrap_or(-1)
        )))
    }
}

async fn wait_for_child(
    child: &mut Child,
    cancellation: &AgentCancellation,
) -> Result<Option<std::process::ExitStatus>, AgentHarnessError> {
    loop {
        if cancellation.is_cancelled() {
            let _ = child.kill().await;
            return Ok(None);
        }
        if let Some(status) = child.try_wait().map_err(|error| {
            AgentHarnessError::new(format!("failed to poll child process: {error}"))
        })? {
            return Ok(Some(status));
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

async fn stream_codex_stdout(stdout: Option<tokio::process::ChildStdout>, sink: AgentEventSink) {
    let Some(stdout) = stdout else {
        return;
    };
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
            let event_type = value
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            match event_type {
                "thread.started" => {
                    if let Some(thread_id) = value.get("thread_id").and_then(Value::as_str) {
                        sink.register_external_session("codex", thread_id.to_string());
                    }
                }
                "error" => {
                    if let Some(message) = value.get("message").and_then(Value::as_str) {
                        sink.status(AgentRunStatus::Running, Some(message.to_string()));
                    }
                }
                _ => {}
            }
            continue;
        }
        sink.token(format!("{trimmed}\n"));
    }
}

async fn stream_claude_stdout(stdout: Option<tokio::process::ChildStdout>, sink: AgentEventSink) {
    let Some(stdout) = stdout else {
        return;
    };
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            sink.token(format!("{trimmed}\n"));
            continue;
        };
        let root_type = value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if root_type == "stream_event" {
            if let Some(text) = value
                .get("event")
                .and_then(|event| event.get("delta"))
                .and_then(|delta| delta.get("text"))
                .and_then(Value::as_str)
            {
                sink.token(text.to_string());
                continue;
            }
        }
        if root_type == "system"
            && value.get("subtype").and_then(Value::as_str) == Some("api_retry")
        {
            let attempt = value
                .get("attempt")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let max_retries = value
                .get("max_retries")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            sink.status(
                AgentRunStatus::Running,
                Some(format!(
                    "Claude Code retrying request ({attempt}/{max_retries})."
                )),
            );
            continue;
        }
        if let Some(session_id) = value
            .get("session_id")
            .and_then(Value::as_str)
            .or_else(|| value.get("sessionId").and_then(Value::as_str))
        {
            sink.register_external_session("claude", session_id.to_string());
        }
        if let Some(result) = value.get("result").and_then(Value::as_str) {
            sink.token(result.to_string());
        }
    }
}

async fn stream_stderr(stderr: Option<tokio::process::ChildStderr>, sink: AgentEventSink) {
    let Some(stderr) = stderr else {
        return;
    };
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            sink.status(AgentRunStatus::Running, Some(trimmed.to_string()));
        }
    }
}

fn build_prompt_for_cli(context: &AgentHarnessContext) -> String {
    if !context.prompt.trim().is_empty() {
        return context.prompt.trim().to_string();
    }

    context
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
        .map(|message| message.content.trim().to_string())
        .filter(|message| !message.is_empty())
        .unwrap_or_else(|| {
            "Continue the current task using the latest available context.".to_string()
        })
}
