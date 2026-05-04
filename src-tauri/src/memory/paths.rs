use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use uuid::Uuid;

use crate::memory::{
    storage::{now_string, safe_file_component, write_json_atomic},
    types::{MemoryMeta, MEMORY_SCHEMA_VERSION},
};

#[derive(Clone)]
pub struct OctomusMemoryManager {
    pub(crate) paths: Arc<MemoryPaths>,
    pub(crate) lock: Arc<Mutex<()>>,
}

impl Default for OctomusMemoryManager {
    fn default() -> Self {
        Self {
            paths: Arc::new(MemoryPaths::new(resolve_octomus_root())),
            lock: Arc::new(Mutex::new(())),
        }
    }
}

#[derive(Debug)]
pub(crate) struct MemoryPaths {
    pub(crate) root: PathBuf,
}

impl MemoryPaths {
    pub(crate) fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub(crate) fn memory_dir(&self) -> PathBuf {
        self.root.join("memory").join("v1")
    }

    pub(crate) fn meta_path(&self) -> PathBuf {
        self.memory_dir().join("meta.json")
    }

    pub(crate) fn settings_path(&self) -> PathBuf {
        self.memory_dir().join("settings.json")
    }

    pub(crate) fn workspace_path(&self) -> PathBuf {
        self.memory_dir().join("workspace_snapshot.json")
    }

    pub(crate) fn conversation_index_path(&self) -> PathBuf {
        self.memory_dir().join("conversation_index.json")
    }

    pub(crate) fn conversations_dir(&self) -> PathBuf {
        self.memory_dir().join("conversations")
    }

    pub(crate) fn conversation_path(&self, conversation_id: &str) -> PathBuf {
        self.conversations_dir()
            .join(format!("{}.json", safe_file_component(conversation_id)))
    }

    pub(crate) fn cloud_index_path(&self) -> PathBuf {
        self.memory_dir().join("cloud_objects_index.json")
    }

    pub(crate) fn cloud_objects_dir(&self) -> PathBuf {
        self.memory_dir().join("cloud_objects")
    }

    pub(crate) fn cloud_object_path(&self, uid: &str) -> PathBuf {
        self.cloud_objects_dir()
            .join(format!("{}.json", safe_file_component(uid)))
    }

    pub(crate) fn sync_queue_path(&self) -> PathBuf {
        self.memory_dir().join("sync_queue.json")
    }

    pub(crate) fn ensure_layout(&self) -> Result<(), String> {
        fs::create_dir_all(self.conversations_dir())
            .map_err(|error| format!("failed to create conversations directory: {error}"))?;
        fs::create_dir_all(self.cloud_objects_dir())
            .map_err(|error| format!("failed to create cloud objects directory: {error}"))?;

        if !self.meta_path().exists() {
            let now = now_string();
            let meta = MemoryMeta {
                schema_version: MEMORY_SCHEMA_VERSION,
                device_id: format!("octomus-device-{}", Uuid::new_v4()),
                created_at: now.clone(),
                updated_at: now,
                sync_endpoint: None,
            };
            write_json_atomic(&self.meta_path(), &meta)?;
        }

        Ok(())
    }
}

fn resolve_octomus_root() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        return PathBuf::from(home).join(".octomus");
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".octomus")
}
