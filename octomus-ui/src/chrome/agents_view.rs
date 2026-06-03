use crate::chrome::workspace_types::WorkspaceConversation;
use egui::*;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum ConversationGroup {
    #[default]
    Active,
    Past,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum StatusFilter {
    #[default]
    All,
    Active,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum GroupFilter {
    #[default]
    All,
    ActiveGroup,
    PastGroup,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum CreatedFilter {
    #[default]
    All,
    Today,
    Week,
    Month,
    Older,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct Run {
    pub conversation: WorkspaceConversation,
    pub group: ConversationGroup,
    pub display_status: StatusFilter,
}

#[derive(Debug, Clone, Default)]
pub struct AgentsViewState {
    pub status_filter: StatusFilter,
    pub group_filter: GroupFilter,
    pub created_filter: CreatedFilter,
    pub environment_filter: String,
    pub search_query: String,
}

pub struct AgentsViewProps {
    pub conversations: Vec<WorkspaceConversation>,
    pub open_conversation_ids: Vec<String>,
    pub selected_conversation_id: Option<String>,
    pub on_new_conversation: Option<Box<dyn FnMut()>>,
    pub on_select_conversation: Option<Box<dyn FnMut(String)>>,
    pub on_close: Option<Box<dyn FnMut()>>,
}

impl Default for AgentsViewProps {
    fn default() -> Self {
        Self {
            conversations: Vec::new(),
            open_conversation_ids: Vec::new(),
            selected_conversation_id: None,
            on_new_conversation: None,
            on_select_conversation: None,
            on_close: None,
        }
    }
}

pub fn render_agents_view(ui: &mut Ui, props: &mut AgentsViewProps, state: &mut AgentsViewState) {
    let open_set: std::collections::HashSet<String> = props.open_conversation_ids.iter().cloned().collect();
    
    let runs: Vec<Run> = props.conversations.iter().map(|c| {
        let group = if open_set.contains(&c.id) {
            ConversationGroup::Active
        } else {
            ConversationGroup::Past
        };
        let display_status = normalize_status(c, &group);
        Run {
            conversation: c.clone(),
            group,
            display_status,
        }
    }).collect();
    
    let environment_options: Vec<String> = {
        let mut labels: Vec<String> = runs.iter()
            .map(|r| environment_label(&r.conversation))
            .collect();
        labels.sort();
        labels.dedup();
        labels
    };
    
    let filtered_runs: Vec<&Run> = runs.iter().filter(|run| {
        let query = state.search_query.trim().to_lowercase();
        let searchable = [
            run.conversation.title.as_str(),
            run.conversation.id.as_str(),
            run.conversation.status.as_deref().unwrap_or(""),
            run.conversation.branch_label.as_deref().unwrap_or(""),
            run.conversation.cwd.as_deref().unwrap_or(""),
            run.conversation.model_id.as_deref().unwrap_or(""),
        ].join(" ").to_lowercase();
        
        let status_match = matches!(state.status_filter, StatusFilter::All) || run.display_status == state.status_filter;
        let group_match = matches!(state.group_filter, GroupFilter::All)
            || (matches!(state.group_filter, GroupFilter::ActiveGroup) && run.group == ConversationGroup::Active)
            || (matches!(state.group_filter, GroupFilter::PastGroup) && run.group == ConversationGroup::Past);
        let created_match = matches_created_filter(run.conversation.created_at.as_deref(), &state.created_filter);
        let env_match = state.environment_filter == "all" || environment_label(&run.conversation) == state.environment_filter;
        let search_match = query.is_empty() || searchable.contains(&query);
        
        status_match && group_match && created_match && env_match && search_match
    }).collect();
    
    let has_filters = !matches!(state.status_filter, StatusFilter::All)
        || !matches!(state.group_filter, GroupFilter::All)
        || !matches!(state.created_filter, CreatedFilter::All)
        || state.environment_filter != "all"
        || !state.search_query.trim().is_empty();
    
    ui.vertical(|ui| {
        // Header
        ui.horizontal(|ui| {
            ui.heading("Runs");
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                if ui.button("New agent").clicked() {
                    if let Some(ref mut cb) = props.on_new_conversation {
                        cb();
                    }
                    if let Some(ref mut cb) = props.on_close {
                        cb();
                    }
                }
                if has_filters {
                    if ui.button("Reset filters").clicked() {
                        *state = AgentsViewState::default();
                    }
                }
            });
        });
        ui.add_space(8.0);
        
        // Filters
        ui.horizontal_wrapped(|ui| {
            ui.label("Status:");
            egui::ComboBox::from_id_salt("status_filter")
                .selected_text(status_filter_label(&state.status_filter))
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut state.status_filter, StatusFilter::All, "All");
                    ui.selectable_value(&mut state.status_filter, StatusFilter::Active, "Active");
                    ui.selectable_value(&mut state.status_filter, StatusFilter::Completed, "Completed");
                    ui.selectable_value(&mut state.status_filter, StatusFilter::Failed, "Failed");
                    ui.selectable_value(&mut state.status_filter, StatusFilter::Cancelled, "Cancelled");
                });
            
            ui.label("Group:");
            egui::ComboBox::from_id_salt("group_filter")
                .selected_text(group_filter_label(&state.group_filter))
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut state.group_filter, GroupFilter::All, "All");
                    ui.selectable_value(&mut state.group_filter, GroupFilter::ActiveGroup, "Active");
                    ui.selectable_value(&mut state.group_filter, GroupFilter::PastGroup, "Past");
                });
            
            ui.label("Created:");
            egui::ComboBox::from_id_salt("created_filter")
                .selected_text(created_filter_label(&state.created_filter))
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut state.created_filter, CreatedFilter::All, "All");
                    ui.selectable_value(&mut state.created_filter, CreatedFilter::Today, "Today");
                    ui.selectable_value(&mut state.created_filter, CreatedFilter::Week, "Last 7 days");
                    ui.selectable_value(&mut state.created_filter, CreatedFilter::Month, "Last 30 days");
                    ui.selectable_value(&mut state.created_filter, CreatedFilter::Older, "Older");
                    ui.selectable_value(&mut state.created_filter, CreatedFilter::Unknown, "Unknown");
                });
            
            ui.label("Environment:");
            egui::ComboBox::from_id_salt("env_filter")
                .selected_text(if state.environment_filter == "all" { "All" } else { &state.environment_filter })
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut state.environment_filter, "all".to_string(), "All");
                    for env in &environment_options {
                        ui.selectable_value(&mut state.environment_filter, env.clone(), env.clone());
                    }
                });
        });
        
        ui.horizontal(|ui| {
            ui.label("🔍");
            ui.add(TextEdit::singleline(&mut state.search_query).hint_text("Search"));
        });
        ui.add_space(8.0);
        
        // Runs list
        ScrollArea::vertical().show(ui, |ui| {
            if filtered_runs.is_empty() {
                ui.vertical_centered(|ui| {
                    ui.add_space(32.0);
                    ui.label("No runs match the current filters.");
                    if has_filters {
                        if ui.button("Reset filters").clicked() {
                            *state = AgentsViewState::default();
                        }
                    }
                });
            } else {
                for (idx, run) in filtered_runs.iter().enumerate() {
                    let is_selected = props.selected_conversation_id.as_ref() == Some(&run.conversation.id);
                    let bg = if is_selected {
                        ui.visuals().selection.bg_fill
                    } else if idx % 2 == 0 {
                        ui.visuals().faint_bg_color
                    } else {
                        ui.visuals().panel_fill
                    };
                    
                    Frame::group(ui.style()).fill(bg).show(ui, |ui| {
                        ui.horizontal(|ui| {
                            // Status icon
                            let icon = match run.display_status {
                                StatusFilter::Completed => "✓",
                                StatusFilter::Active => "◐",
                                StatusFilter::Failed => "⚠",
                                StatusFilter::Cancelled => "⊘",
                                _ => "○",
                            };
                            ui.label(RichText::new(icon).size(16.0));
                            
                            ui.vertical(|ui| {
                                ui.horizontal(|ui| {
                                    ui.label(RichText::new(&run.conversation.title).strong());
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        let initials = initials_from_title(&run.conversation.title);
                                        ui.label(RichText::new(initials).monospace().size(11.0));
                                        ui.label(RichText::new(&run.conversation.time_label).color(ui.visuals().weak_text_color()).size(11.0));
                                    });
                                });
                                let meta = format!(
                                    "{} • {} • Environment: {}{}",
                                    status_label(&run.display_status),
                                    if run.group == ConversationGroup::Active { "Active conversation" } else { "Past conversation" },
                                    environment_label(&run.conversation),
                                    run.conversation.message_count.map(|c| format!(" • Messages: {}", c)).unwrap_or_default()
                                );
                                ui.label(RichText::new(meta).color(ui.visuals().weak_text_color()).size(11.0));
                            });
                        });
                        
                        let response = ui.interact(ui.min_rect(), ui.id().with(&run.conversation.id), Sense::click());
                        if response.clicked() {
                            if let Some(ref mut cb) = props.on_select_conversation {
                                cb(run.conversation.id.clone());
                            }
                            if let Some(ref mut cb) = props.on_close {
                                cb();
                            }
                        }
                    });
                }
            }
        });
    });
}

fn normalize_status(conversation: &WorkspaceConversation, group: &ConversationGroup) -> StatusFilter {
    let status = conversation.status.as_deref().unwrap_or("").to_lowercase();
    if status.contains("cancel") {
        return StatusFilter::Cancelled;
    }
    if status.contains("fail") || status.contains("error") {
        return StatusFilter::Failed;
    }
    if matches!(group, ConversationGroup::Active)
        || status.contains("running")
        || status.contains("progress")
        || status.contains("pending")
        || status.contains("queued")
    {
        return StatusFilter::Active;
    }
    StatusFilter::Completed
}

fn environment_label(conversation: &WorkspaceConversation) -> String {
    conversation.branch_label.clone().unwrap_or_else(|| {
        conversation.cwd.as_deref()
            .unwrap_or("~")
            .split('/')
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or("~")
            .to_string()
    })
}

fn matches_created_filter(created_at: Option<&str>, filter: &CreatedFilter) -> bool {
    match filter {
        CreatedFilter::All => true,
        CreatedFilter::Unknown => created_at.is_none(),
        _ => {
            let created = match created_at {
                Some(c) => match chrono::DateTime::parse_from_rfc3339(c) {
                    Ok(d) => d,
                    Err(_) => return matches!(filter, CreatedFilter::Unknown),
                },
                None => return matches!(filter, CreatedFilter::Unknown),
            };
            let now = chrono::Utc::now();
            match filter {
                CreatedFilter::Today => {
                    created.date_naive() == now.date_naive()
                }
                CreatedFilter::Week => {
                    now.signed_duration_since(created).num_days() <= 7
                }
                CreatedFilter::Month => {
                    now.signed_duration_since(created).num_days() <= 30
                }
                CreatedFilter::Older => {
                    now.signed_duration_since(created).num_days() > 30
                }
                _ => true,
            }
        }
    }
}

fn initials_from_title(title: &str) -> String {
    title.split_whitespace()
        .filter(|s| !s.is_empty())
        .take(2)
        .filter_map(|word| word.chars().next().map(|c| c.to_uppercase().to_string()))
        .collect()
}

fn status_label(status: &StatusFilter) -> &'static str {
    match status {
        StatusFilter::Active => "Active",
        StatusFilter::Failed => "Failed",
        StatusFilter::Cancelled => "Cancelled",
        StatusFilter::Completed => "Completed",
        StatusFilter::All => "All",
    }
}

fn status_filter_label(filter: &StatusFilter) -> &'static str {
    status_label(filter)
}

fn group_filter_label(filter: &GroupFilter) -> &'static str {
    match filter {
        GroupFilter::All => "All",
        GroupFilter::ActiveGroup => "Active",
        GroupFilter::PastGroup => "Past",
    }
}

fn created_filter_label(filter: &CreatedFilter) -> &'static str {
    match filter {
        CreatedFilter::All => "All",
        CreatedFilter::Today => "Today",
        CreatedFilter::Week => "Last 7 days",
        CreatedFilter::Month => "Last 30 days",
        CreatedFilter::Older => "Older",
        CreatedFilter::Unknown => "Unknown",
    }
}
