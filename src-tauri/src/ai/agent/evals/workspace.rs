use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

use uuid::Uuid;

use super::scenarios::{EvalScenario, EvalSkillFixture, EvalWorkspaceFile};

static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub(super) struct EvalWorkspace {
    root: PathBuf,
    _env_override: Option<ScopedEnvOverride>,
}

impl EvalWorkspace {
    pub(super) fn create(scenario: &EvalScenario) -> Result<Self, String> {
        let root = std::env::temp_dir().join(format!("octomus-agent-eval-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root)
            .map_err(|error| format!("failed to create eval workspace root: {error}"))?;
        write_workspace_files(&root, scenario.workspace_files)?;

        let env_override = if scenario.skill_fixtures.is_empty() {
            None
        } else {
            let octomus_home = root.join(".octomus-eval");
            write_skill_fixtures(&octomus_home, scenario.skill_fixtures)?;
            Some(ScopedEnvOverride::set(
                "OCTOMUS_HOME",
                octomus_home.as_os_str(),
            )?)
        };

        Ok(Self {
            root,
            _env_override: env_override,
        })
    }

    pub(super) fn root(&self) -> &Path {
        &self.root
    }

    pub(super) fn changed_file_exists(&self, relative_path: &str) -> bool {
        self.root.join(relative_path).exists()
    }
}

impl Drop for EvalWorkspace {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn write_workspace_files(root: &Path, files: &[EvalWorkspaceFile]) -> Result<(), String> {
    for file in files {
        let path = root.join(file.path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create workspace dir: {error}"))?;
        }
        std::fs::write(&path, file.contents)
            .map_err(|error| format!("failed to write workspace file '{}': {error}", file.path))?;
    }
    Ok(())
}

fn write_skill_fixtures(octomus_home: &Path, skills: &[EvalSkillFixture]) -> Result<(), String> {
    let skills_dir = octomus_home.join("skills");
    std::fs::create_dir_all(&skills_dir)
        .map_err(|error| format!("failed to create eval skills dir: {error}"))?;

    for skill in skills {
        let skill_dir = skills_dir.join(skill.name);
        std::fs::create_dir_all(&skill_dir)
            .map_err(|error| format!("failed to create skill dir '{}': {error}", skill.name))?;
        let skill_md = format!(
            "---\nname: {}\ndescription: {}\n---\n\n{}\n",
            skill.name, skill.description, skill.instructions
        );
        std::fs::write(skill_dir.join("SKILL.md"), skill_md)
            .map_err(|error| format!("failed to write SKILL.md for '{}': {error}", skill.name))?;
    }

    Ok(())
}

struct ScopedEnvOverride {
    key: &'static str,
    old_value: Option<OsString>,
    _guard: MutexGuard<'static, ()>,
}

impl ScopedEnvOverride {
    fn set(key: &'static str, value: &std::ffi::OsStr) -> Result<Self, String> {
        let guard = ENV_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .map_err(|_| "eval env lock is poisoned".to_string())?;
        let old_value = std::env::var_os(key);
        // SAFETY: tests hold a process-wide mutex while mutating environment.
        unsafe {
            std::env::set_var(key, value);
        }
        Ok(Self {
            key,
            old_value,
            _guard: guard,
        })
    }
}

impl Drop for ScopedEnvOverride {
    fn drop(&mut self) {
        // SAFETY: tests hold a process-wide mutex while mutating environment.
        unsafe {
            if let Some(old_value) = &self.old_value {
                std::env::set_var(self.key, old_value);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }
}
