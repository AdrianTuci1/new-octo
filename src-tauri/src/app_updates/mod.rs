use std::{
    env,
    sync::Mutex,
    time::Duration,
};

use chrono::Utc;
use reqwest::Url;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_updater::{Builder as UpdaterPluginBuilder, Update, UpdaterExt};

pub const EVENT_APP_UPDATE_STATE: &str = "app:update-state";

const STAGE_DISABLED: &str = "disabled";
const STAGE_IDLE: &str = "idle";
const STAGE_CHECKING: &str = "checking";
const STAGE_UPDATE_READY: &str = "updateReady";
const STAGE_DOWNLOADING: &str = "downloading";
const STAGE_INSTALLING: &str = "installing";
const STAGE_RESTART_REQUIRED: &str = "restartRequired";
const STAGE_ERROR: &str = "error";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateRelease {
    pub version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub target: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateStateSnapshot {
    pub current_version: String,
    pub enabled: bool,
    pub stage: String,
    pub available_update: Option<AppUpdateRelease>,
    pub last_checked_at: Option<String>,
    pub last_error: Option<String>,
    pub downloaded_bytes: Option<u64>,
    pub content_length: Option<u64>,
}

impl Default for AppUpdateStateSnapshot {
    fn default() -> Self {
        Self {
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            enabled: false,
            stage: STAGE_DISABLED.to_string(),
            available_update: None,
            last_checked_at: None,
            last_error: None,
            downloaded_bytes: None,
            content_length: None,
        }
    }
}

#[derive(Default)]
pub struct AppUpdateManager {
    snapshot: Mutex<AppUpdateStateSnapshot>,
}

impl AppUpdateManager {
    pub fn snapshot(&self) -> Result<AppUpdateStateSnapshot, String> {
        self.snapshot
            .lock()
            .map(|snapshot| snapshot.clone())
            .map_err(|_| "app update state lock is poisoned".to_string())
    }

    fn mutate<R: Runtime, F>(
        &self,
        app: &AppHandle<R>,
        update: F,
    ) -> Result<AppUpdateStateSnapshot, String>
    where
        F: FnOnce(&mut AppUpdateStateSnapshot),
    {
        let next_snapshot = {
            let mut snapshot = self
                .snapshot
                .lock()
                .map_err(|_| "app update state lock is poisoned".to_string())?;
            update(&mut snapshot);
            snapshot.clone()
        };

        let _ = app.emit(EVENT_APP_UPDATE_STATE, &next_snapshot);
        Ok(next_snapshot)
    }
}

#[derive(Debug, Clone)]
struct RuntimeUpdaterConfig {
    endpoints: Vec<Url>,
    pubkey: String,
    timeout: Duration,
}

impl RuntimeUpdaterConfig {
    fn from_env() -> Result<Option<Self>, String> {
        let pubkey = env::var("OCTOMUS_UPDATER_PUBKEY").unwrap_or_default();
        let endpoints_raw = env::var("OCTOMUS_UPDATER_ENDPOINTS").unwrap_or_default();

        if pubkey.trim().is_empty() || endpoints_raw.trim().is_empty() {
            return Ok(None);
        }

        let endpoints = endpoints_raw
            .split(|value| value == ',' || value == '\n')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                Url::parse(value).map_err(|error| format!("invalid updater endpoint `{value}`: {error}"))
            })
            .collect::<Result<Vec<_>, _>>()?;

        if endpoints.is_empty() {
            return Ok(None);
        }

        let timeout_ms = env::var("OCTOMUS_UPDATER_TIMEOUT_MS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(30_000);

        Ok(Some(Self {
            endpoints,
            pubkey,
            timeout: Duration::from_millis(timeout_ms),
        }))
    }
}

fn release_from_update(update: &Update) -> AppUpdateRelease {
    AppUpdateRelease {
        version: update.version.clone(),
        notes: update.body.clone(),
        pub_date: update.date.map(|value| value.to_string()),
        target: update.target.clone(),
    }
}

fn build_updater<R: Runtime>(
    app: &AppHandle<R>,
    config: &RuntimeUpdaterConfig,
) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder()
        .pubkey(config.pubkey.clone())
        .endpoints(config.endpoints.clone())
        .map_err(|error| format!("failed to configure updater endpoints: {error}"))?
        .timeout(config.timeout)
        .build()
        .map_err(|error| format!("failed to build updater: {error}"))
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    app.plugin(UpdaterPluginBuilder::new().build())
        .map_err(|error| format!("failed to register updater plugin: {error}"))?;

    let manager = app.state::<AppUpdateManager>();
    if RuntimeUpdaterConfig::from_env()?.is_some() {
        let _ = manager.mutate(app, |snapshot| {
            snapshot.enabled = true;
            snapshot.stage = STAGE_IDLE.to_string();
            snapshot.last_error = None;
        });

        if !cfg!(debug_assertions) {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let manager = handle.state::<AppUpdateManager>();
                let _ = perform_check(&handle, &manager, false).await;
            });
        }
    } else {
        let _ = manager.mutate(app, |snapshot| {
            snapshot.enabled = false;
            snapshot.stage = STAGE_DISABLED.to_string();
            snapshot.available_update = None;
            snapshot.last_error = None;
            snapshot.downloaded_bytes = None;
            snapshot.content_length = None;
        });
    }

    Ok(())
}

async fn perform_check<R: Runtime>(
    app: &AppHandle<R>,
    manager: &AppUpdateManager,
    force_emit_checking: bool,
) -> Result<AppUpdateStateSnapshot, String> {
    let Some(config) = RuntimeUpdaterConfig::from_env()? else {
        return manager.mutate(app, |snapshot| {
            snapshot.enabled = false;
            snapshot.stage = STAGE_DISABLED.to_string();
            snapshot.available_update = None;
            snapshot.last_error = None;
            snapshot.downloaded_bytes = None;
            snapshot.content_length = None;
        });
    };

    if force_emit_checking {
        let _ = manager.mutate(app, |snapshot| {
            snapshot.enabled = true;
            snapshot.stage = STAGE_CHECKING.to_string();
            snapshot.last_error = None;
            snapshot.downloaded_bytes = None;
            snapshot.content_length = None;
        })?;
    }

    let updater = build_updater(app, &config)?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("failed to check for updates: {error}"))?;

    let checked_at = Utc::now().to_rfc3339();
    manager.mutate(app, move |snapshot| {
        snapshot.enabled = true;
        snapshot.last_checked_at = Some(checked_at);
        snapshot.last_error = None;
        snapshot.downloaded_bytes = None;
        snapshot.content_length = None;

        if let Some(update) = update {
            snapshot.stage = STAGE_UPDATE_READY.to_string();
            snapshot.available_update = Some(release_from_update(&update));
        } else {
            snapshot.stage = STAGE_IDLE.to_string();
            snapshot.available_update = None;
        }
    })
}

#[tauri::command]
pub fn app_updates_get_state(
    manager: State<'_, AppUpdateManager>,
) -> Result<AppUpdateStateSnapshot, String> {
    manager.snapshot()
}

#[tauri::command]
pub async fn app_updates_check<R: Runtime>(
    app: AppHandle<R>,
    manager: State<'_, AppUpdateManager>,
) -> Result<AppUpdateStateSnapshot, String> {
    match perform_check(&app, &manager, true).await {
        Ok(snapshot) => Ok(snapshot),
        Err(error) => manager.mutate(&app, |snapshot| {
            snapshot.enabled = RuntimeUpdaterConfig::from_env().ok().flatten().is_some();
            snapshot.stage = STAGE_ERROR.to_string();
            snapshot.available_update = None;
            snapshot.last_error = Some(error.clone());
            snapshot.downloaded_bytes = None;
            snapshot.content_length = None;
        }),
    }
}

#[tauri::command]
pub async fn app_updates_install<R: Runtime>(
    app: AppHandle<R>,
    manager: State<'_, AppUpdateManager>,
) -> Result<AppUpdateStateSnapshot, String> {
    let Some(config) = RuntimeUpdaterConfig::from_env()? else {
        return manager.mutate(&app, |snapshot| {
            snapshot.enabled = false;
            snapshot.stage = STAGE_DISABLED.to_string();
            snapshot.last_error = None;
        });
    };

    let _ = manager.mutate(&app, |snapshot| {
        snapshot.enabled = true;
        snapshot.stage = STAGE_CHECKING.to_string();
        snapshot.last_error = None;
        snapshot.downloaded_bytes = None;
        snapshot.content_length = None;
    })?;

    let updater = build_updater(&app, &config)?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("failed to refresh update metadata: {error}"))?
        .ok_or_else(|| "no update is currently available".to_string())?;

    let release = release_from_update(&update);

    let _ = manager.mutate(&app, |snapshot| {
        snapshot.enabled = true;
        snapshot.stage = STAGE_DOWNLOADING.to_string();
        snapshot.available_update = Some(release.clone());
        snapshot.last_error = None;
        snapshot.downloaded_bytes = Some(0);
    })?;

    let progress_manager = &*manager;
    let progress_app = app.clone();
    let release_for_download = release.clone();
    let release_for_install = release.clone();

    update
        .download_and_install(
            move |chunk_length, content_length| {
                let _ = progress_manager.mutate(&progress_app, |snapshot| {
                    snapshot.enabled = true;
                    snapshot.stage = STAGE_DOWNLOADING.to_string();
                    snapshot.available_update = Some(release_for_download.clone());
                    snapshot.downloaded_bytes = Some(
                        snapshot.downloaded_bytes.unwrap_or(0) + chunk_length as u64,
                    );
                    snapshot.content_length = content_length;
                    snapshot.last_error = None;
                });
            },
            {
                let install_app = app.clone();
                let install_manager = &*manager;
                let install_release = release_for_install;
                move || {
                    let _ = install_manager.mutate(&install_app, |snapshot| {
                        snapshot.enabled = true;
                        snapshot.stage = STAGE_INSTALLING.to_string();
                        snapshot.available_update = Some(install_release.clone());
                        snapshot.last_error = None;
                    });
                }
            },
        )
        .await
        .map_err(|error| format!("failed to download and install update: {error}"))?;

    manager.mutate(&app, |snapshot| {
        snapshot.enabled = true;
        snapshot.stage = STAGE_RESTART_REQUIRED.to_string();
        snapshot.available_update = Some(release);
        snapshot.last_error = None;
        snapshot.downloaded_bytes = None;
        snapshot.content_length = None;
    })
}

#[tauri::command]
pub fn app_updates_restart<R: Runtime>(app: AppHandle<R>) {
    app.request_restart();
}
