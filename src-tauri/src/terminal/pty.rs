use std::{
    env, fs,
    io::Read,
    path::{Path, PathBuf},
};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

use super::session::TerminalSession;

pub struct SpawnedPty {
    pub session: TerminalSession,
    pub reader: Box<dyn Read + Send>,
}

pub fn spawn_terminal(rows: u16, cols: u16, cwd: Option<String>) -> Result<SpawnedPty, String> {
    let shell = default_shell();
    let shell_kind = ShellKind::from_shell_path(&shell);
    let integration = ShellIntegration::create(shell_kind)?;

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("failed to open PTY: {error}"))?;

    let mut command = CommandBuilder::new(&shell);
    shell_kind.configure_command(&mut command, &integration);
    command.env("OCTOMUS_TERMINAL", "1");

    if let Some(cwd) = cwd.as_deref().filter(|value| !value.is_empty()) {
        command.cwd(cwd);
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("failed to spawn shell '{shell}': {error}"))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("failed to clone PTY reader: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("failed to open PTY writer: {error}"))?;

    drop(pair.slave);

    Ok(SpawnedPty {
        session: TerminalSession::new(shell, cwd, pair.master, writer, child),
        reader,
    })
}

fn default_shell() -> String {
    if cfg!(target_os = "windows") {
        return env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string());
    }

    env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

#[derive(Debug, Clone, Copy)]
enum ShellKind {
    Zsh,
    Bash,
    Fish,
    OtherUnix,
    Windows,
}

impl ShellKind {
    fn from_shell_path(shell: &str) -> Self {
        if cfg!(target_os = "windows") {
            return Self::Windows;
        }

        let name = Path::new(shell)
            .file_name()
            .and_then(|file_name| file_name.to_str())
            .unwrap_or_default();

        match name {
            "zsh" => Self::Zsh,
            "bash" => Self::Bash,
            "fish" => Self::Fish,
            _ => Self::OtherUnix,
        }
    }

    fn configure_command(self, command: &mut CommandBuilder, integration: &ShellIntegration) {
        match self {
            Self::Zsh => {
                if let Some(dir) = integration.dir.as_ref() {
                    command.env("ZDOTDIR", dir);
                }
                command.arg("-i");
            }
            Self::Bash => {
                if let Some(rc_file) = integration.rc_file.as_ref() {
                    command.arg("--rcfile");
                    command.arg(rc_file);
                }
                command.arg("-i");
            }
            Self::Fish => {
                if let Some(dir) = integration.dir.as_ref() {
                    command.env("XDG_CONFIG_HOME", dir);
                }
                command.arg("-i");
            }
            Self::OtherUnix => {
                command.arg("-i");
            }
            Self::Windows => {}
        }
    }
}

struct ShellIntegration {
    dir: Option<PathBuf>,
    rc_file: Option<PathBuf>,
}

impl ShellIntegration {
    fn create(kind: ShellKind) -> Result<Self, String> {
        match kind {
            ShellKind::Zsh => create_zsh_integration(),
            ShellKind::Bash => create_bash_integration(),
            ShellKind::Fish => create_fish_integration(),
            ShellKind::OtherUnix | ShellKind::Windows => Ok(Self {
                dir: None,
                rc_file: None,
            }),
        }
    }
}

fn create_zsh_integration() -> Result<ShellIntegration, String> {
    let dir = integration_dir("zsh")?;
    let rc_file = dir.join(".zshrc");
    let original_zdotdir = env::var("ZDOTDIR")
        .map(PathBuf::from)
        .or_else(|_| env::var("HOME").map(PathBuf::from))
        .ok();
    let original_rc = original_zdotdir.map(|dir| dir.join(".zshrc"));

    let mut rc = String::new();
    if let Some(original_rc) = original_rc.as_ref().filter(|path| path.exists()) {
        if let Some(original_dir) = original_rc.parent() {
            rc.push_str(&format!(
                "__octomus_temp_zdotdir=\"$ZDOTDIR\"\nexport ZDOTDIR={}\nsource {}\nexport ZDOTDIR=\"$__octomus_temp_zdotdir\"\nunset __octomus_temp_zdotdir\n",
                shell_quote(original_dir),
                shell_quote(original_rc)
            ));
        }
    }

    rc.push_str(
        r#"
autoload -Uz add-zsh-hook 2>/dev/null || true

__octomus_escape_osc() {
  local value="${1//$'\a'/}"
  value="${value//$'\e'/}"
  printf '%s' "$value"
}

__octomus_preexec() {
  if [[ "$1" == *__octomus_suppress_hooks=1* ]]; then
    return
  fi
  printf '\033]7777;preexec;'
  __octomus_escape_osc "$1"
  printf '\007'
}

__octomus_precmd() {
  local status="$?"
  printf '\033]7777;precmd;%s\007' "$status"
}

if typeset -f add-zsh-hook >/dev/null 2>&1; then
  add-zsh-hook preexec __octomus_preexec
  add-zsh-hook precmd __octomus_precmd
fi
"#,
    );

    fs::write(&rc_file, rc).map_err(|error| format!("failed to write zsh integration: {error}"))?;
    Ok(ShellIntegration {
        dir: Some(dir),
        rc_file: Some(rc_file),
    })
}

fn create_bash_integration() -> Result<ShellIntegration, String> {
    let dir = integration_dir("bash")?;
    let rc_file = dir.join("bashrc");
    let home = env::var("HOME").ok().map(PathBuf::from);
    let original_rc = home.map(|dir| dir.join(".bashrc"));

    let mut rc = String::new();
    if let Some(original_rc) = original_rc.as_ref().filter(|path| path.exists()) {
        rc.push_str(&format!("source {}\n", shell_quote(original_rc)));
    }

    rc.push_str(
        r#"
__octomus_escape_osc() {
  local value="${1//$'\a'/}"
  value="${value//$'\e'/}"
  printf '%s' "$value"
}

__octomus_preexec() {
  local command="$BASH_COMMAND"
  if [[ "$__octomus_suppress_hooks" == "1" ]]; then
    return
  fi
  if [[ "$__octomus_in_prompt" == "1" ]]; then
    return
  fi
  case "$command" in
    __octomus_*|trap\ *|PROMPT_COMMAND=*) return ;;
  esac
  printf '\033]7777;preexec;'
  __octomus_escape_osc "$command"
  printf '\007'
}

__octomus_precmd() {
  local status="$?"
  __octomus_in_prompt=1
  printf '\033]7777;precmd;%s\007' "$status"
  __octomus_in_prompt=0
  return "$status"
}

trap '__octomus_preexec' DEBUG
__octomus_original_prompt_command="${PROMPT_COMMAND:-}"
PROMPT_COMMAND='__octomus_precmd; if [[ -n "$__octomus_original_prompt_command" ]]; then eval "$__octomus_original_prompt_command"; fi'
"#,
    );

    fs::write(&rc_file, rc)
        .map_err(|error| format!("failed to write bash integration: {error}"))?;
    Ok(ShellIntegration {
        dir: Some(dir),
        rc_file: Some(rc_file),
    })
}

fn create_fish_integration() -> Result<ShellIntegration, String> {
    let dir = integration_dir("fish")?;
    let fish_dir = dir.join("fish");
    fs::create_dir_all(&fish_dir)
        .map_err(|error| format!("failed to create fish integration dir: {error}"))?;
    let config = fish_dir.join("config.fish");
    let original_config = env::var("HOME")
        .ok()
        .map(PathBuf::from)
        .map(|home| home.join(".config/fish/config.fish"));

    let mut rc = String::new();
    if let Some(original_config) = original_config.as_ref().filter(|path| path.exists()) {
        rc.push_str(&format!("source {}\n", shell_quote(original_config)));
    }

    rc.push_str(
        r#"
function __octomus_emit_precmd --on-event fish_prompt
  printf '\033]7777;precmd;%s\007' $status
end

function __octomus_emit_preexec --on-event fish_preexec
  set -l command (string replace -a \e '' -- $argv)
  set command (string replace -a \a '' -- $command)
  printf '\033]7777;preexec;%s\007' "$command"
end
"#,
    );

    fs::write(&config, rc).map_err(|error| format!("failed to write fish integration: {error}"))?;
    Ok(ShellIntegration {
        dir: Some(dir),
        rc_file: Some(config),
    })
}

fn integration_dir(shell: &str) -> Result<PathBuf, String> {
    let dir = env::temp_dir().join(format!(
        "octomus-terminal-{shell}-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create shell integration dir: {error}"))?;
    Ok(dir)
}

fn shell_quote(path: &Path) -> String {
    let value = path.to_string_lossy();
    format!("'{}'", value.replace('\'', "'\\''"))
}
