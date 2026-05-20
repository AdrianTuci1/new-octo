use std::{
    fs,
    io::Read,
    path::PathBuf,
    sync::Arc,
};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use uuid::Uuid;

use crate::{
    secure_store,
    terminal::{
        requests::CreateTerminalSessionTargetRequest,
        session::{
            TerminalSession, TerminalSessionKind, TerminalSessionProvider, TerminalSessionRuntime,
            TerminalSessionStatus,
        },
    },
};

use super::local::LocalTerminalSpawn;

pub fn create_session(
    rows: u16,
    cols: u16,
    cwd: Option<String>,
    target: &CreateTerminalSessionTargetRequest,
) -> Result<LocalTerminalSpawn, String> {
    let provider = target.resolved_provider();
    match provider {
        TerminalSessionProvider::CustomVm => create_custom_vm_session(rows, cols, cwd, target),
        TerminalSessionProvider::Modal => Err(
            "Modal cloud terminals are configured securely, but launching them requires the Octomus cloud CLI runner on the remote runtime."
                .to_string(),
        ),
        TerminalSessionProvider::Local => Err("local provider cannot be used for a cloud session".to_string()),
    }
}

fn create_custom_vm_session(
    rows: u16,
    cols: u16,
    cwd: Option<String>,
    target: &CreateTerminalSessionTargetRequest,
) -> Result<LocalTerminalSpawn, String> {
    let profile_id = clean_required(&target.profile_id, "cloud profile id")?;
    let host = clean_required(&target.host, "cloud host")?;
    let username = clean_required(&target.username, "cloud username")?;
    let connection_method = target
        .connection_method
        .as_deref()
        .unwrap_or("ssh-agent")
        .trim()
        .to_string();
    let mut key_path_to_remove = None;

    let mut command = CommandBuilder::new("ssh");
    command.arg("-tt");
    command.arg("-o");
    command.arg("ServerAliveInterval=30");
    command.arg("-o");
    command.arg("ServerAliveCountMax=3");
    command.arg("-o");
    command.arg("StrictHostKeyChecking=accept-new");

    if connection_method == "ssh-key" {
        let account = format!("cloud-profile:{profile_id}:ssh-private-key");
        let private_key = secure_store::load_secret(&account)?
            .ok_or_else(|| "SSH private key is missing from secure storage for this cloud profile".to_string())?;
        let key_path = write_ephemeral_private_key(&profile_id, &private_key)?;
        command.arg("-i");
        command.arg(key_path.to_string_lossy().to_string());
        command.arg("-o");
        command.arg("IdentitiesOnly=yes");
        key_path_to_remove = Some(key_path);
    }

    command.arg(format!("{username}@{host}"));
    if let Some(cwd) = cwd.as_deref().filter(|value| !value.trim().is_empty()) {
        command.arg(format!("cd {} && exec $SHELL -l", shell_quote(cwd)));
    }

    let spawn_result = spawn_cloud_command(
        rows,
        cols,
        command,
        TerminalSessionRuntime {
            kind: TerminalSessionKind::Cloud,
            provider: TerminalSessionProvider::CustomVm,
            profile_id: Some(profile_id),
        },
        cwd,
    );

    if let Some(path) = key_path_to_remove {
        let _ = fs::remove_file(path);
    }

    spawn_result
}

fn spawn_cloud_command(
    rows: u16,
    cols: u16,
    command: CommandBuilder,
    runtime: TerminalSessionRuntime,
    cwd: Option<String>,
) -> Result<LocalTerminalSpawn, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("failed to open cloud PTY: {error}"))?;

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("failed to spawn cloud terminal: {error}"))?;
    let reader: Box<dyn Read + Send> = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("failed to clone cloud PTY reader: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("failed to open cloud PTY writer: {error}"))?;

    drop(pair.slave);

    Ok(LocalTerminalSpawn {
        session: Arc::new(TerminalSession::new(
            runtime,
            TerminalSessionStatus::Running,
            "ssh".to_string(),
            cwd,
            pair.master,
            writer,
            child,
        )),
        reader: Some(reader),
    })
}

fn clean_required(value: &Option<String>, label: &str) -> Result<String, String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("{label} is required for cloud terminal launch"))
}

fn write_ephemeral_private_key(profile_id: &str, private_key: &str) -> Result<PathBuf, String> {
    let mut path = std::env::temp_dir();
    path.push(format!("octomus-cloud-key-{}-{}", sanitize_filename(profile_id), Uuid::new_v4()));
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
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '_' })
        .collect()
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
