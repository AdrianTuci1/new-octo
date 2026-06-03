use super::SettingsSidebarItem;

/// Renders settings sidebar navigation state.
///
/// This mirrors the React `SettingsSidebar` component logic:
/// - headings, leaf items, and expandable groups.
pub struct SettingsSidebar {
    pub active_section_id: String,
    pub expanded_group_ids: Vec<String>,
}

impl SettingsSidebar {
    pub fn new(active_section_id: String, expanded_group_ids: Vec<String>) -> Self {
        Self {
            active_section_id,
            expanded_group_ids,
        }
    }

    pub fn is_group_expanded(&self, group_id: &str) -> bool {
        self.expanded_group_ids.iter().any(|id| id == group_id)
    }

    pub fn is_leaf_active(&self, leaf_id: &str) -> bool {
        self.active_section_id == leaf_id
    }
}

/// Flattened navigation entry for UI consumption.
#[derive(Debug, Clone)]
pub enum NavEntry {
    Heading { label: String },
    Leaf { id: String, label: String, depth: usize },
    GroupHeader { id: String, label: String, expanded: bool },
}

/// Build a flattened list of navigation entries from sidebar items.
pub fn flatten_sidebar_items(items: &[SettingsSidebarItem], expanded_ids: &[String]) -> Vec<NavEntry> {
    let mut out = Vec::new();
    for item in items {
        flatten_item(item, 0, &mut out, expanded_ids);
    }
    out
}

fn flatten_item(item: &SettingsSidebarItem, depth: usize, out: &mut Vec<NavEntry>, expanded_ids: &[String]) {
    match item {
        SettingsSidebarItem::Heading(h) => {
            out.push(NavEntry::Heading {
                label: h.label.clone(),
            });
        }
        SettingsSidebarItem::Leaf(leaf) => {
            out.push(NavEntry::Leaf {
                id: leaf.id.clone(),
                label: leaf.label.clone(),
                depth,
            });
        }
        SettingsSidebarItem::Group(group) => {
            let expanded = expanded_ids.iter().any(|id| id == &group.id);
            out.push(NavEntry::GroupHeader {
                id: group.id.clone(),
                label: group.label.clone(),
                expanded,
            });
            if expanded {
                for child in &group.children {
                    flatten_item(
                        &SettingsSidebarItem::Leaf(child.clone()),
                        depth + 1,
                        out,
                        expanded_ids,
                    );
                }
            }
        }
    }
}
