use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

const OCTOMUS_HOME_OVERRIDE_ENV: &str = "OCTOMUS_HOME";
const BUNDLED_SKILLS_DIR_OVERRIDE_ENV: &str = "OCTOMUS_BUNDLED_SKILLS_DIR";

const DEFAULT_MCP_CONFIG: &str = r#"{
  "mcpServers": {}
}
"#;

const DEFAULT_KEYBINDINGS_CONFIG: &str = "{}\n";

#[derive(Debug, Clone)]
pub struct OctomusPaths {
    pub root: PathBuf,
}

impl Default for OctomusPaths {
    fn default() -> Self {
        Self::new(resolve_octomus_root())
    }
}

impl OctomusPaths {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn skills_dir(&self) -> PathBuf {
        self.root.join("skills")
    }

    pub fn tab_configs_dir(&self) -> PathBuf {
        self.root.join("tab_configs")
    }

    pub fn startup_config_path(&self) -> PathBuf {
        self.tab_configs_dir().join("startup_config.toml")
    }

    pub fn tab_config_path(&self) -> PathBuf {
        self.tab_configs_dir().join("my_tab_config.toml")
    }

    pub fn mcp_config_path(&self) -> PathBuf {
        self.root.join(".mcp.json")
    }

    pub fn keybindings_path(&self) -> PathBuf {
        self.root.join("keybindings.yaml")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.root.join("settings.toml")
    }

    pub fn ai_provider_config_path(&self) -> PathBuf {
        self.root.join("ai-provider.json")
    }

    pub fn ensure_layout(&self) -> Result<(), String> {
        fs::create_dir_all(&self.root)
            .map_err(|error| format!("failed to create Octomus root directory: {error}"))?;
        fs::create_dir_all(self.skills_dir())
            .map_err(|error| format!("failed to create skills directory: {error}"))?;
        fs::create_dir_all(self.tab_configs_dir())
            .map_err(|error| format!("failed to create tab configs directory: {error}"))?;

        ensure_file_with_default(&self.mcp_config_path(), DEFAULT_MCP_CONFIG)?;
        ensure_file_with_default(&self.keybindings_path(), DEFAULT_KEYBINDINGS_CONFIG)?;
        ensure_file_with_default(&self.settings_path(), &default_settings_config())?;
        ensure_file_with_default(&self.startup_config_path(), &default_startup_config())?;
        ensure_file_with_default(&self.tab_config_path(), &default_tab_config())?;

        Ok(())
    }
}

pub fn resolve_octomus_root() -> PathBuf {
    if let Some(root) = std::env::var_os(OCTOMUS_HOME_OVERRIDE_ENV) {
        return PathBuf::from(root);
    }

    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        return PathBuf::from(home).join(".octomus");
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".octomus")
}

pub fn bundled_skills_dir_candidates() -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();

    if let Some(path) = std::env::var_os(BUNDLED_SKILLS_DIR_OVERRIDE_ENV) {
        push_unique_dir(&mut candidates, &mut seen, PathBuf::from(path));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        push_unique_dir(
            &mut candidates,
            &mut seen,
            current_dir
                .join("src-tauri")
                .join("resources")
                .join("skills"),
        );
        push_unique_dir(
            &mut candidates,
            &mut seen,
            current_dir.join("resources").join("skills"),
        );
    }

    push_unique_dir(
        &mut candidates,
        &mut seen,
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("skills"),
    );

    candidates
}

fn ensure_file_with_default(path: &Path, default_contents: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create config parent directory: {error}"))?;
    }

    fs::write(path, default_contents).map_err(|error| {
        format!(
            "failed to create default config '{}': {error}",
            path.display()
        )
    })
}

fn push_unique_dir(candidates: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
    if seen.insert(path.clone()) {
        candidates.push(path);
    }
}

fn default_settings_config() -> String {
    r#"[appearance]

[appearance.themes]

[appearance.vertical_tabs]

[appearance.text]
notebook_font_size = 14.0
font_size = 13.0

[appearance.window]
zoom_level = 100

[appearance.cursor]
cursor_display_type = "bar"

[appearance.icon]
app_icon = "mono"

[terminal]
show_terminal_zero_state_block = false

[terminal.input]
input_box_type_setting = "universal"
honor_ps1 = false

[agents]

[agents.octomus_agent]

[agents.octomus_agent.input]
nld_in_terminal_enabled = false
ai_auto_detection_enabled = true

[agents.octomus_agent.other]

[agents.third_party]

[agents.profiles]
agent_mode_coding_permissions = "always_allow_reading"

[account]
is_settings_sync_enabled = true

[privacy]
telemetry_enabled = true
crash_reporting_enabled = true

[general]

[code]

[code.editor]

[octomus_drive]

[notifications]
toast_duration_secs = 8
"#
    .to_string()
}

fn default_tab_config() -> String {
    r#"# Octomus Tab Config
# Stored in ~/.octomus/tab_configs/ — rename this file and edit anytime!

name = "My Tab Config"

[[panes]]
id = "main"
type = "terminal"
# directory = "~/code/my-project"
commands = []
"#
    .to_string()
}

fn default_startup_config() -> String {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("~"));

    let username = home
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("user");

    format!(
        "name = \"New tab: {username}\"\n\n[[panes]]\nid = \"main\"\ntype = \"agent\"\ndirectory = {:?}\n\n[params]\n",
        home.display().to_string()
    )
}

#[cfg(test)]
mod tests {
    use super::OctomusPaths;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn ensure_layout_creates_expected_structure() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("octomus-layout-test-{unique}"));
        let paths = OctomusPaths::new(root.clone());

        paths.ensure_layout().expect("layout should be created");

        assert!(paths.root.is_dir());
        assert!(paths.skills_dir().is_dir());
        assert!(paths.tab_configs_dir().is_dir());
        assert!(paths.mcp_config_path().is_file());
        assert!(paths.keybindings_path().is_file());
        assert!(paths.settings_path().is_file());
        assert!(paths.startup_config_path().is_file());
        assert!(paths.tab_config_path().is_file());

        let _ = fs::remove_dir_all(root);
    }
}
