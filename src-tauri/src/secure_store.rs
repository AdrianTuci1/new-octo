use std::process::{Command, Stdio};

const SERVICE_NAME: &str = "octomus.ai-provider";

pub fn store_secret(account: &str, secret: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return store_secret_macos(account, secret);
    }

    #[cfg(target_os = "linux")]
    {
        return store_secret_linux(account, secret);
    }

    #[cfg(target_os = "windows")]
    {
        return Err("secure secret storage is not yet implemented on Windows".to_string());
    }

    #[allow(unreachable_code)]
    Err("secure secret storage is not supported on this platform".to_string())
}

pub fn load_secret(account: &str) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        return load_secret_macos(account);
    }

    #[cfg(target_os = "linux")]
    {
        return load_secret_linux(account);
    }

    #[cfg(target_os = "windows")]
    {
        return Err("secure secret storage is not yet implemented on Windows".to_string());
    }

    #[allow(unreachable_code)]
    Err("secure secret storage is not supported on this platform".to_string())
}

pub fn delete_secret(account: &str) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        return delete_secret_macos(account);
    }

    #[cfg(target_os = "linux")]
    {
        return delete_secret_linux(account);
    }

    #[cfg(target_os = "windows")]
    {
        return Err("secure secret storage is not yet implemented on Windows".to_string());
    }

    #[allow(unreachable_code)]
    Err("secure secret storage is not supported on this platform".to_string())
}

#[cfg(target_os = "macos")]
fn store_secret_macos(account: &str, secret: &str) -> Result<(), String> {
    let output = Command::new("security")
        .args([
            "add-generic-password",
            "-a",
            account,
            "-s",
            SERVICE_NAME,
            "-w",
            secret,
            "-U",
        ])
        .output()
        .map_err(|error| format!("failed to invoke security: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!("failed to store secret: {}", stderr.trim()))
}

#[cfg(target_os = "macos")]
fn load_secret_macos(account: &str) -> Result<Option<String>, String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-a",
            account,
            "-s",
            SERVICE_NAME,
            "-w",
        ])
        .output()
        .map_err(|error| format!("failed to invoke security: {error}"))?;

    if output.status.success() {
        let secret = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(Some(secret));
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("could not be found")
        || stderr.contains("The specified item could not be found")
    {
        return Ok(None);
    }

    Err(format!("failed to load secret: {}", stderr.trim()))
}

#[cfg(target_os = "macos")]
fn delete_secret_macos(account: &str) -> Result<bool, String> {
    let output = Command::new("security")
        .args(["delete-generic-password", "-a", account, "-s", SERVICE_NAME])
        .output()
        .map_err(|error| format!("failed to invoke security: {error}"))?;

    if output.status.success() {
        return Ok(true);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("could not be found")
        || stderr.contains("The specified item could not be found")
    {
        return Ok(false);
    }

    Err(format!("failed to delete secret: {}", stderr.trim()))
}

#[cfg(target_os = "linux")]
fn store_secret_linux(account: &str, secret: &str) -> Result<(), String> {
    let mut child = Command::new("secret-tool")
        .args([
            "store",
            "--label=Octomus AI Provider",
            "service",
            SERVICE_NAME,
            "account",
            account,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to invoke secret-tool: {error}"))?;

    if let Some(stdin) = child.stdin.as_mut() {
        use std::io::Write;
        stdin
            .write_all(secret.as_bytes())
            .map_err(|error| format!("failed to write secret to secret-tool: {error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("failed to store secret: {error}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "failed to store secret: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(target_os = "linux")]
fn load_secret_linux(account: &str) -> Result<Option<String>, String> {
    let output = Command::new("secret-tool")
        .args(["lookup", "service", SERVICE_NAME, "account", account])
        .output()
        .map_err(|error| format!("failed to invoke secret-tool: {error}"))?;

    if output.status.success() {
        let secret = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(Some(secret));
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("No secret found") || stderr.contains("not found") {
        return Ok(None);
    }

    Err(format!("failed to load secret: {}", stderr.trim()))
}

#[cfg(target_os = "linux")]
fn delete_secret_linux(account: &str) -> Result<bool, String> {
    let output = Command::new("secret-tool")
        .args(["clear", "service", SERVICE_NAME, "account", account])
        .output()
        .map_err(|error| format!("failed to invoke secret-tool: {error}"))?;

    if output.status.success() {
        return Ok(true);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("No secret found") || stderr.contains("not found") {
        return Ok(false);
    }

    Err(format!("failed to delete secret: {}", stderr.trim()))
}
