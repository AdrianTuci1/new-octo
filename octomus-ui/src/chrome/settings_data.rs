use crate::chrome::workspace_types::*;

pub fn settings_sidebar_items() -> Vec<SettingsSidebarItem> {
    vec![
        SettingsSidebarItem::Group(SettingsSidebarGroupItem {
            kind: "group".to_string(),
            id: "account".to_string(),
            label: "Account".to_string(),
            default_expanded: true,
            children: vec![
                SettingsSidebarLeafItem {
                    kind: "leaf".to_string(),
                    id: "profile".to_string(),
                    label: "Profile".to_string(),
                },
            ],
        }),
        SettingsSidebarItem::Group(SettingsSidebarGroupItem {
            kind: "group".to_string(),
            id: "agents".to_string(),
            label: "Agents".to_string(),
            default_expanded: true,
            children: vec![
                SettingsSidebarLeafItem {
                    kind: "leaf".to_string(),
                    id: "agents/octo-agent".to_string(),
                    label: "Octo Agent".to_string(),
                },
            ],
        }),
        SettingsSidebarItem::Group(SettingsSidebarGroupItem {
            kind: "group".to_string(),
            id: "code".to_string(),
            label: "Code".to_string(),
            default_expanded: true,
            children: vec![
                SettingsSidebarLeafItem {
                    kind: "leaf".to_string(),
                    id: "code/indexing".to_string(),
                    label: "Codebase Indexing".to_string(),
                },
                SettingsSidebarLeafItem {
                    kind: "leaf".to_string(),
                    id: "code/review".to_string(),
                    label: "Editor Code Review".to_string(),
                },
            ],
        }),
        SettingsSidebarItem::Group(SettingsSidebarGroupItem {
            kind: "group".to_string(),
            id: "cloud".to_string(),
            label: "Cloud".to_string(),
            default_expanded: true,
            children: vec![
                SettingsSidebarLeafItem {
                    kind: "leaf".to_string(),
                    id: "cloud/terminals".to_string(),
                    label: "Cloud Terminals".to_string(),
                },
            ],
        }),
        SettingsSidebarItem::Group(SettingsSidebarGroupItem {
            kind: "group".to_string(),
            id: "appearance".to_string(),
            label: "Appearance".to_string(),
            default_expanded: true,
            children: vec![
                SettingsSidebarLeafItem {
                    kind: "leaf".to_string(),
                    id: "appearance".to_string(),
                    label: "Appearance".to_string(),
                },
            ],
        }),
        SettingsSidebarItem::Group(SettingsSidebarGroupItem {
            kind: "group".to_string(),
            id: "keyboard".to_string(),
            label: "Keyboard".to_string(),
            default_expanded: true,
            children: vec![
                SettingsSidebarLeafItem {
                    kind: "leaf".to_string(),
                    id: "keyboard-shortcuts".to_string(),
                    label: "Keyboard Shortcuts".to_string(),
                },
            ],
        }),
    ]
}

pub fn settings_default_expanded_group_ids() -> Vec<String> {
    settings_sidebar_items()
        .into_iter()
        .filter_map(|item| match item {
            SettingsSidebarItem::Group(g) if g.default_expanded => Some(g.id),
            _ => None,
        })
        .collect()
}

pub const SETTINGS_DEFAULT_SECTION_ID: &str = "profile";

pub fn get_settings_section_meta(section_id: &str) -> SettingsSectionMeta {
    match section_id {
        "profile" | "account" => SettingsSectionMeta {
            title: "Profile".to_string(),
            description: "Manage your profile settings.".to_string(),
            content_kind: SettingsSectionContentKind::Profile,
        },
        "agents/octo-agent" | "agents/warp-agent" => SettingsSectionMeta {
            title: "Octo Agent".to_string(),
            description: "Configure default agent behavior and task routing.".to_string(),
            content_kind: SettingsSectionContentKind::OctoAgent,
        },
        "appearance" => SettingsSectionMeta {
            title: "Appearance".to_string(),
            description: "Customize the look and feel.".to_string(),
            content_kind: SettingsSectionContentKind::Appearance,
        },
        "keyboard-shortcuts" => SettingsSectionMeta {
            title: "Keyboard Shortcuts".to_string(),
            description: "View and customize keyboard shortcuts.".to_string(),
            content_kind: SettingsSectionContentKind::KeyboardShortcuts,
        },
        "code/indexing" => SettingsSectionMeta {
            title: "Codebase Indexing".to_string(),
            description: "Configure code indexing settings.".to_string(),
            content_kind: SettingsSectionContentKind::CodeIndexing,
        },
        "code/review" => SettingsSectionMeta {
            title: "Editor Code Review".to_string(),
            description: "Configure code review settings.".to_string(),
            content_kind: SettingsSectionContentKind::EditorCodeReview,
        },
        "cloud/terminals" => SettingsSectionMeta {
            title: "Cloud Terminals".to_string(),
            description: "Configure cloud terminal settings.".to_string(),
            content_kind: SettingsSectionContentKind::CloudTerminals,
        },
        _ => SettingsSectionMeta {
            title: "Settings".to_string(),
            description: "Choose a section from the sidebar.".to_string(),
            content_kind: SettingsSectionContentKind::Placeholder,
        },
    }
}
