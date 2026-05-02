use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use chrono::Utc;
use serde_json::Value;

use crate::ai::agent::{
    openai::OpenAiCompatibleConfig,
    types::{AgentRunSnapshot, AgentRunStatus},
};

#[derive(Clone, Default)]
pub struct AgentHarnessManager {
    runs: Arc<Mutex<HashMap<String, ManagedAgentRun>>>,
    provider_config: Arc<Mutex<Option<OpenAiCompatibleConfig>>>,
}

struct ManagedAgentRun {
    snapshot: AgentRunSnapshot,
    cancel_flag: Arc<AtomicBool>,
}

impl AgentHarnessManager {
    pub fn provider_config(&self) -> Result<Option<OpenAiCompatibleConfig>, String> {
        Ok(self
            .provider_config
            .lock()
            .map_err(|_| "agent provider config lock is poisoned".to_string())?
            .clone())
    }

    pub fn set_provider_config(&self, config: OpenAiCompatibleConfig) -> Result<(), String> {
        *self
            .provider_config
            .lock()
            .map_err(|_| "agent provider config lock is poisoned".to_string())? = Some(config);

        Ok(())
    }

    pub fn load_provider_config_from_disk(&self) -> Result<Option<OpenAiCompatibleConfig>, String> {
        if let Some(config) = read_persisted_provider_config()? {
            let mut lock = self
                .provider_config
                .lock()
                .map_err(|_| "agent provider config lock is poisoned".to_string())?;
            if lock.is_none() {
                *lock = Some(config.clone());
            }

            return Ok(Some(config));
        }

        Ok(None)
    }

    pub fn insert(
        &self,
        snapshot: AgentRunSnapshot,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<(), String> {
        self.runs
            .lock()
            .map_err(|_| "agent run map lock is poisoned".to_string())?
            .insert(
                snapshot.run_id.clone(),
                ManagedAgentRun {
                    snapshot,
                    cancel_flag,
                },
            );

        Ok(())
    }

    pub fn cancel(&self, run_id: &str) -> Result<AgentRunSnapshot, String> {
        let mut runs = self
            .runs
            .lock()
            .map_err(|_| "agent run map lock is poisoned".to_string())?;
        let run = runs
            .get_mut(run_id)
            .ok_or_else(|| format!("agent run '{run_id}' was not found"))?;

        run.cancel_flag.store(true, Ordering::SeqCst);
        if !run.snapshot.status.is_terminal() {
            run.snapshot.status = AgentRunStatus::Cancelled;
            run.snapshot.status_message = Some("Cancellation requested.".to_string());
            run.snapshot.finished_at = Some(Utc::now());
        }

        Ok(run.snapshot.clone())
    }

    pub fn get(&self, run_id: &str) -> Result<AgentRunSnapshot, String> {
        self.runs
            .lock()
            .map_err(|_| "agent run map lock is poisoned".to_string())?
            .get(run_id)
            .map(|run| run.snapshot.clone())
            .ok_or_else(|| format!("agent run '{run_id}' was not found"))
    }

    pub fn list(&self) -> Result<Vec<AgentRunSnapshot>, String> {
        let mut snapshots = self
            .runs
            .lock()
            .map_err(|_| "agent run map lock is poisoned".to_string())?
            .values()
            .map(|run| run.snapshot.clone())
            .collect::<Vec<_>>();

        snapshots.sort_by_key(|snapshot| snapshot.started_at);
        Ok(snapshots)
    }

    pub fn set_status(
        &self,
        run_id: &str,
        status: AgentRunStatus,
        status_message: Option<String>,
    ) -> Result<AgentRunSnapshot, String> {
        self.update(run_id, |snapshot| {
            snapshot.status = status;
            snapshot.status_message = status_message;
            if status.is_terminal() && snapshot.finished_at.is_none() {
                snapshot.finished_at = Some(Utc::now());
            }
        })
    }

    pub fn fail(&self, run_id: &str, error: String) -> Result<AgentRunSnapshot, String> {
        self.update(run_id, |snapshot| {
            snapshot.status = AgentRunStatus::Failed;
            snapshot.status_message = Some("Harness failed.".to_string());
            snapshot.error = Some(error);
            snapshot.finished_at = Some(Utc::now());
        })
    }

    fn update<F>(&self, run_id: &str, update: F) -> Result<AgentRunSnapshot, String>
    where
        F: FnOnce(&mut AgentRunSnapshot),
    {
        let mut runs = self
            .runs
            .lock()
            .map_err(|_| "agent run map lock is poisoned".to_string())?;
        let run = runs
            .get_mut(run_id)
            .ok_or_else(|| format!("agent run '{run_id}' was not found"))?;

        update(&mut run.snapshot);
        Ok(run.snapshot.clone())
    }
}

pub fn persist_provider_config(config: &OpenAiCompatibleConfig) -> Result<(), String> {
    let path = provider_config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create provider config dir: {error}"))?;
    }

    let value = config.to_persisted_value();
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&value)
            .map_err(|error| format!("failed to serialize provider config: {error}"))?,
    )
    .map_err(|error| format!("failed to write provider config: {error}"))
}

pub fn read_persisted_provider_config() -> Result<Option<OpenAiCompatibleConfig>, String> {
    let path = provider_config_path()?;
    let Ok(contents) = std::fs::read_to_string(&path) else {
        return Ok(None);
    };

    let value: Value = serde_json::from_str(&contents)
        .map_err(|error| format!("failed to parse provider config: {error}"))?;
    Ok(OpenAiCompatibleConfig::from_persisted_value(&value))
}

fn provider_config_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or_else(|| "home directory was not found".to_string())?;

    Ok(std::path::PathBuf::from(home)
        .join(".octomus")
        .join("ai-provider.json"))
}
