use std::collections::HashMap;

pub mod sidebar;
pub mod drawer;
pub mod sections {
    pub mod profile;
    pub mod agent;
    pub mod appearance;
    pub mod mcp;
    pub mod cloud;
    pub mod keyboard;
    pub mod code;
}

/// Content kind for a settings section, mirroring the TS `SettingsSectionContentKind`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SettingsSectionContentKind {
    Profile,
    OctoAgent,
    Knowledge,
    Appearance,
    Profiles,
    McpServers,
    KeyboardShortcuts,
    ThirdPartyCliAgents,
    CloudTerminals,
    CodeIndexing,
    EditorCodeReview,
    Placeholder,
}

/// Meta information for a settings section.
#[derive(Debug, Clone)]
pub struct SettingsSectionMeta {
    pub title: String,
    pub description: String,
    pub content_kind: SettingsSectionContentKind,
}

/// A leaf item in the settings sidebar.
#[derive(Debug, Clone)]
pub struct SettingsSidebarLeafItem {
    pub id: String,
    pub label: String,
}

/// A group item in the settings sidebar.
#[derive(Debug, Clone)]
pub struct SettingsSidebarGroupItem {
    pub id: String,
    pub label: String,
    pub default_expanded: bool,
    pub children: Vec<SettingsSidebarLeafItem>,
}

/// A heading item in the settings sidebar.
#[derive(Debug, Clone)]
pub struct SettingsSidebarHeadingItem {
    pub label: String,
}

/// Union type for sidebar items.
#[derive(Debug, Clone)]
pub enum SettingsSidebarItem {
    Leaf(SettingsSidebarLeafItem),
    Group(SettingsSidebarGroupItem),
    Heading(SettingsSidebarHeadingItem),
}

/// The main settings window state.
pub struct SettingsWindow {
    pub active_section_id: String,
    pub expanded_group_ids: Vec<String>,
    pub search_query: String,
    pub section_meta_by_id: HashMap<String, SettingsSectionMeta>,
}

impl Default for SettingsWindow {
    fn default() -> Self {
        let mut meta = HashMap::new();
        meta.insert(
            "profile".to_string(),
            SettingsSectionMeta {
                title: "Profile".to_string(),
                description: "Manage your local workspace identity and avatar.".to_string(),
                content_kind: SettingsSectionContentKind::Profile,
            },
        );
        meta.insert(
            "agents/octo-agent".to_string(),
            SettingsSectionMeta {
                title: "Octo Agent".to_string(),
                description: "Configure default agent behavior and task routing.".to_string(),
                content_kind: SettingsSectionContentKind::OctoAgent,
            },
        );
        meta.insert(
            "agents/profiles".to_string(),
            SettingsSectionMeta {
                title: "Profiles".to_string(),
                description: "Prepare saved personas and prompt presets for the agent runtime.".to_string(),
                content_kind: SettingsSectionContentKind::Profiles,
            },
        );
        meta.insert(
            "agents/mcp-servers".to_string(),
            SettingsSectionMeta {
                title: "MCP servers".to_string(),
                description: "Connect and organize model context protocol servers.".to_string(),
                content_kind: SettingsSectionContentKind::McpServers,
            },
        );
        meta.insert(
            "agents/knowledge".to_string(),
            SettingsSectionMeta {
                title: "Knowledge".to_string(),
                description: "Manage the shared knowledge base that agents can reference.".to_string(),
                content_kind: SettingsSectionContentKind::Knowledge,
            },
        );
        meta.insert(
            "agents/third-party-cli-agents".to_string(),
            SettingsSectionMeta {
                title: "Third party CLI agents".to_string(),
                description: "Wire external CLI-based agents into the workspace.".to_string(),
                content_kind: SettingsSectionContentKind::ThirdPartyCliAgents,
            },
        );
        meta.insert(
            "appearance".to_string(),
            SettingsSectionMeta {
                title: "Appearance".to_string(),
                description: "Theme, cursor, tabs, window, and layout preferences.".to_string(),
                content_kind: SettingsSectionContentKind::Appearance,
            },
        );
        meta.insert(
            "cloud-platform/cloud".to_string(),
            SettingsSectionMeta {
                title: "Cloud".to_string(),
                description: "Configure cloud profiles, connection details, and credential bridging.".to_string(),
                content_kind: SettingsSectionContentKind::CloudTerminals,
            },
        );
        meta.insert(
            "code/indexing-and-projects".to_string(),
            SettingsSectionMeta {
                title: "Codebase Indexing".to_string(),
                description: "Tune project indexing and repository discovery behavior.".to_string(),
                content_kind: SettingsSectionContentKind::CodeIndexing,
            },
        );
        meta.insert(
            "code/editor-and-code-review".to_string(),
            SettingsSectionMeta {
                title: "Editor and Code Review".to_string(),
                description: "Configure code editing, review flows, and inline suggestions.".to_string(),
                content_kind: SettingsSectionContentKind::EditorCodeReview,
            },
        );
        meta.insert(
            "keyboard-shortcuts".to_string(),
            SettingsSectionMeta {
                title: "Keyboard shortcuts".to_string(),
                description: "Customize launcher and workspace shortcuts.".to_string(),
                content_kind: SettingsSectionContentKind::KeyboardShortcuts,
            },
        );

        Self {
            active_section_id: "profile".to_string(),
            expanded_group_ids: vec![
                "agents".to_string(),
                "code".to_string(),
            ],
            search_query: String::new(),
            section_meta_by_id: meta,
        }
    }
}

impl SettingsWindow {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn select_section(&mut self, id: &str) {
        self.active_section_id = id.to_string();
    }

    pub fn toggle_group(&mut self, id: &str) {
        if let Some(pos) = self.expanded_group_ids.iter().position(|x| x == id) {
            self.expanded_group_ids.remove(pos);
        } else {
            self.expanded_group_ids.push(id.to_string());
        }
    }

    pub fn section_meta(&self, id: &str) -> SettingsSectionMeta {
        self.section_meta_by_id
            .get(id)
            .cloned()
            .unwrap_or_else(|| SettingsSectionMeta {
                title: "Settings".to_string(),
                description: "Choose a section from the sidebar.".to_string(),
                content_kind: SettingsSectionContentKind::Placeholder,
            })
    }

    pub fn sidebar_items() -> Vec<SettingsSidebarItem> {
        vec![
            SettingsSidebarItem::Leaf(SettingsSidebarLeafItem {
                id: "profile".to_string(),
                label: "Profile".to_string(),
            }),
            SettingsSidebarItem::Group(SettingsSidebarGroupItem {
                id: "agents".to_string(),
                label: "Agents".to_string(),
                default_expanded: true,
                children: vec![
                    SettingsSidebarLeafItem {
                        id: "agents/octo-agent".to_string(),
                        label: "Octo Agent".to_string(),
                    },
                    SettingsSidebarLeafItem {
                        id: "agents/profiles".to_string(),
                        label: "Profiles".to_string(),
                    },
                    SettingsSidebarLeafItem {
                        id: "agents/mcp-servers".to_string(),
                        label: "MCP servers".to_string(),
                    },
                    SettingsSidebarLeafItem {
                        id: "agents/knowledge".to_string(),
                        label: "Knowledge".to_string(),
                    },
                    SettingsSidebarLeafItem {
                        id: "agents/third-party-cli-agents".to_string(),
                        label: "Third party CLI agents".to_string(),
                    },
                ],
            }),
            SettingsSidebarItem::Group(SettingsSidebarGroupItem {
                id: "code".to_string(),
                label: "Code".to_string(),
                default_expanded: true,
                children: vec![
                    SettingsSidebarLeafItem {
                        id: "code/indexing-and-projects".to_string(),
                        label: "Indexing and projects".to_string(),
                    },
                    SettingsSidebarLeafItem {
                        id: "code/editor-and-code-review".to_string(),
                        label: "Editor and Code Review".to_string(),
                    },
                ],
            }),
            SettingsSidebarItem::Leaf(SettingsSidebarLeafItem {
                id: "cloud-platform/cloud".to_string(),
                label: "Cloud".to_string(),
            }),
            SettingsSidebarItem::Leaf(SettingsSidebarLeafItem {
                id: "appearance".to_string(),
                label: "Appearance".to_string(),
            }),
            SettingsSidebarItem::Leaf(SettingsSidebarLeafItem {
                id: "keyboard-shortcuts".to_string(),
                label: "Keyboard shortcuts".to_string(),
            }),
        ]
    }
}
