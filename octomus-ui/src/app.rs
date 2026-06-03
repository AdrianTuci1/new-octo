use crate::chrome::agents_view::{render_agents_view, AgentsViewProps, AgentsViewState};
use crate::chrome::drawers::{render_app_window_drawers, AppWindowDrawersProps, DrawersState};
use crate::chrome::pane_tree::{render_workspace_pane_tree, WorkspacePaneTreeProps, WorkspacePaneTreeState};
use crate::chrome::settings_content::{render_settings_content, SettingsContentProps};
use crate::chrome::settings_sidebar::{render_settings_sidebar, SettingsSidebarProps, SettingsSidebarState};
use crate::chrome::settings_data::{settings_default_expanded_group_ids, settings_sidebar_items};
use crate::chrome::sidebar::{render_workspace_sidebar, WorkspaceSidebarProps, WorkspaceSidebarState};
use crate::chrome::topbar::{render_workspace_topbar, WorkspaceTopbarProps, WorkspaceTopbarState};
use crate::editor::EditorWidget;
use crate::state::editor::EditorStore;
use crate::state::shell::{ShellStore, WorkspacePaneNode as ShellPaneNode, WorkspacePaneLayout as ShellPaneLayout};
use crate::state::ui::UiStore;
use crate::themes::{Theme, ThemeKind};
use crate::tray::TrayHandle;
use crate::windows::{launcher::LauncherWindow, onboarding::OnboardingWindow, settings::SettingsWindow, Window};
use eframe::egui;
use egui::*;
use std::sync::{Arc, Mutex};

pub enum PanelMode {
    Launcher,
    Settings,
    Onboarding,
}

pub struct OctomusApp {
    theme: Theme,
    launcher: LauncherWindow,
    settings: Option<SettingsWindow>,
    onboarding: Option<OnboardingWindow>,
    #[allow(dead_code)]
    tray: Option<TrayHandle>,
    show_settings: bool,
    show_onboarding: bool,
    panel_mode: PanelMode,

    // ShellWindow state
    shell_store: Arc<Mutex<ShellStore>>,
    editor_store: Arc<Mutex<EditorStore>>,
    ui_store: Arc<Mutex<UiStore>>,
    editor_widget: EditorWidget,

    // UI state
    topbar_state: WorkspaceTopbarState,
    sidebar_state: WorkspaceSidebarState,
    pane_tree_state: WorkspacePaneTreeState,
    drawers_state: DrawersState,
    agents_view_state: AgentsViewState,
    sidebar_width: f32,
    is_keyboard_shortcuts_open: bool,
}

impl OctomusApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let theme = Theme::from_preference(ThemeKind::Dark);
        theme.apply(&cc.egui_ctx);

        let tray = TrayHandle::try_create().ok();
        let shell_store = Arc::new(Mutex::new(ShellStore::new()));
        let editor_store = Arc::new(Mutex::new(EditorStore::new()));
        let ui_store = Arc::new(Mutex::new(UiStore::new()));

        Self {
            theme,
            launcher: LauncherWindow::default(),
            settings: None,
            onboarding: Some(OnboardingWindow::default()),
            tray,
            show_settings: false,
            show_onboarding: true,
            panel_mode: PanelMode::Launcher,
            shell_store,
            editor_store,
            ui_store,
            editor_widget: EditorWidget::default(),
            topbar_state: WorkspaceTopbarState::default(),
            sidebar_state: WorkspaceSidebarState::default(),
            pane_tree_state: WorkspacePaneTreeState::default(),
            drawers_state: DrawersState::new(),
            agents_view_state: AgentsViewState::default(),
            sidebar_width: 240.0,
            is_keyboard_shortcuts_open: false,
        }
    }

    fn ensure_settings(&mut self) {
        if self.settings.is_none() {
            self.settings = Some(SettingsWindow::default());
        }
    }

    pub fn set_theme(&mut self, ctx: &egui::Context, kind: ThemeKind) {
        self.theme = Theme::from_preference(kind);
        self.theme.apply(ctx);
    }

    fn get_shell_state(&self) -> crate::state::shell::ShellState {
        self.shell_store.lock().unwrap().get_state()
    }

    fn render_shell_window(&mut self, ctx: &egui::Context) {
        let shell_state = self.get_shell_state();
        let is_settings_view = shell_state.selected_tab_id == "settings";
        let is_launcher_view = !is_settings_view;
        let is_sidebar_open = shell_state.is_sidebar_open;
        let is_agents_active = shell_state.is_agents_active;

        let selected_tab = shell_state.tabs.iter()
            .find(|t| t.id == shell_state.selected_tab_id)
            .cloned()
            .unwrap_or_else(|| crate::state::shell::WorkspaceChromeTab {
                id: "terminal-main".to_string(),
                label: "Terminal".to_string(),
                kind: "terminal".to_string(),
                ..Default::default()
            });

        let can_show_git_diff = selected_tab.kind != "settings";

        // Central panel - main content
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.vertical(|ui| {
                // Topbar
                let mut topbar_props = WorkspaceTopbarProps::default();

                let shell_store_clone = self.shell_store.clone();
                topbar_props.on_toggle_sidebar = Some(Box::new(move || {
                    let mut guard = shell_store_clone.lock().unwrap();
                    guard.with_state(|state| {
                        state.is_sidebar_open = !state.is_sidebar_open;
                    });
                }));

                let shell_store_clone = self.shell_store.clone();
                topbar_props.on_toggle_agents = Some(Box::new(move || {
                    let mut guard = shell_store_clone.lock().unwrap();
                    guard.with_state(|state| {
                        state.is_agents_active = !state.is_agents_active;
                    });
                }));

                let shell_store_clone = self.shell_store.clone();
                topbar_props.on_select_tab = Some(Box::new(move |id| {
                    let mut guard = shell_store_clone.lock().unwrap();
                    guard.with_state(|state| {
                        state.selected_tab_id = id;
                    });
                }));

                let shell_store_clone = self.shell_store.clone();
                topbar_props.on_close_tab = Some(Box::new(move |id| {
                    let mut guard = shell_store_clone.lock().unwrap();
                    guard.with_state(|state| {
                        state.tabs.retain(|t| t.id != id);
                        if state.selected_tab_id == id {
                            state.selected_tab_id = state.tabs.first()
                                .map(|t| t.id.clone())
                                .unwrap_or_default();
                        }
                    });
                }));

                let shell_store_clone = self.shell_store.clone();
                topbar_props.on_new_terminal_tab = Some(Box::new(move || {
                    let mut guard = shell_store_clone.lock().unwrap();
                    guard.with_state(|state| {
                        let idx = state.next_terminal_index;
                        state.next_terminal_index += 1;
                        let id = format!("terminal-{}", idx);
                        state.tabs.push(crate::state::shell::WorkspaceChromeTab {
                            id: id.clone(),
                            label: "~".to_string(),
                            kind: "terminal".to_string(),
                            ..Default::default()
                        });
                        state.selected_tab_id = id.clone();
                        state.pane_layouts_by_tab_id.insert(id.clone(), ShellPaneLayout {
                            active_pane_id: id.clone(),
                            root: ShellPaneNode::Leaf { pane_id: id },
                        });
                    });
                }));

                let shell_store_clone = self.shell_store.clone();
                topbar_props.on_open_settings_section = Some(Box::new(move |section| {
                    let mut guard = shell_store_clone.lock().unwrap();
                    guard.with_state(|state| {
                        state.selected_tab_id = "settings".to_string();
                        if let Some(s) = section {
                            state.active_section_id = s;
                        }
                    });
                }));

                let shortcuts_open = Arc::new(Mutex::new(false));
                let app_shortcuts_open = Arc::clone(&shortcuts_open);
                topbar_props.on_open_keyboard_shortcuts_drawer = Some(Box::new(move || {
                    if let Ok(mut open) = app_shortcuts_open.lock() {
                        *open = true;
                    }
                }));

                self.topbar_state.active_tab_id = Some(shell_state.selected_tab_id.clone());
                self.topbar_state.launcher_tab_id = shell_state.launcher_tab_id.clone();
                self.topbar_state.tabs = shell_state.tabs.iter().map(|t| crate::chrome::workspace_types::WorkspaceChromeTab {
                    id: t.id.clone(),
                    label: t.label.clone(),
                    kind: match t.kind.as_str() {
                        "tools" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Tools,
                        "agents" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Agents,
                        "terminal" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Terminal,
                        "conversation" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Conversation,
                        "settings" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Settings,
                        _ => crate::chrome::workspace_types::WorkspaceChromeTabKind::Terminal,
                    },
                    subtitle: t.subtitle.clone(),
                    custom_label: t.custom_label.clone(),
                    tint_color: t.tint_color.clone(),
                    last_execution_status: t.last_execution_status.clone(),
                }).collect();
                self.topbar_state.is_sidebar_open = is_sidebar_open;
                self.topbar_state.is_agents_active = is_agents_active;
                self.topbar_state.active_pane_context = Some(crate::chrome::workspace_types::WorkspaceActivePaneContext {
                    tab_kind: match selected_tab.kind.as_str() {
                        "tools" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Tools,
                        "agents" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Agents,
                        "terminal" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Terminal,
                        "conversation" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Conversation,
                        "settings" => crate::chrome::workspace_types::WorkspaceChromeTabKind::Settings,
                        _ => crate::chrome::workspace_types::WorkspaceChromeTabKind::Terminal,
                    },
                    pane_id: Some(shell_state.selected_tab_id.clone()),
                    launcher_session_id: None,
                    working_directory: None,
                    composer_surface: Some("terminal".to_string()),
                    active_conversation_id: None,
                    can_show_git_diff,
                });

                render_workspace_topbar(ui, &mut topbar_props, &mut self.topbar_state);
                ui.separator();

                // Main container
                ui.horizontal(|ui| {
                    // Sidebar
                    if is_sidebar_open {
                        let sidebar_width = self.sidebar_width.min(ui.available_width() * 0.5).max(150.0);
                        ui.allocate_ui_with_layout(
                            Vec2::new(sidebar_width, ui.available_height()),
                            Layout::top_down(Align::Min),
                            |ui| {
                                let mut sidebar_props = WorkspaceSidebarProps {
                                    is_open: true,
                                    conversations: Vec::new(),
                                    ..Default::default()
                                };

                                let shell_store_clone = self.shell_store.clone();
                                sidebar_props.on_close = Some(Box::new(move || {
                                    let mut guard = shell_store_clone.lock().unwrap();
                                    guard.with_state(|state| {
                                        state.is_sidebar_open = false;
                                    });
                                }));

                                render_workspace_sidebar(ui, &mut sidebar_props, &mut self.sidebar_state);
                            },
                        );
                        ui.separator();
                    }

                    // Main content area
                    ui.vertical(|ui| {
                        if is_settings_view {
                            // Settings view
                            ui.horizontal(|ui| {
                                // Settings sidebar
                                ui.allocate_ui_with_layout(
                                    Vec2::new(200.0, ui.available_height()),
                                    Layout::top_down(Align::Min),
                                    |ui| {
                                        let mut sidebar_props = SettingsSidebarProps {
                                            items: settings_sidebar_items(),
                                            ..Default::default()
                                        };

                                        let shell_store_clone = self.shell_store.clone();
                                        sidebar_props.on_select_item = Some(Box::new(move |id| {
                                            let mut guard = shell_store_clone.lock().unwrap();
                                            guard.with_state(|state| {
                                                state.active_section_id = id;
                                            });
                                        }));

                                        let shell_store_clone = self.shell_store.clone();
                                        sidebar_props.on_toggle_group = Some(Box::new(move |id| {
                                            let mut guard = shell_store_clone.lock().unwrap();
                                            guard.with_state(|state| {
                                                if let Some(pos) = state.expanded_group_ids.iter().position(|g| g == &id) {
                                                    state.expanded_group_ids.remove(pos);
                                                } else {
                                                    state.expanded_group_ids.push(id);
                                                }
                                            });
                                        }));

                                        let mut sidebar_state = SettingsSidebarState {
                                            selected_item_id: Some(shell_state.active_section_id.clone()),
                                            expanded_groups: shell_state.expanded_group_ids.clone(),
                                            is_open: true,
                                            ..Default::default()
                                        };

                                        render_settings_sidebar(ui, &mut sidebar_props, &mut sidebar_state);
                                    },
                                );
                                ui.separator();

                                // Settings content
                                let mut content_props = SettingsContentProps {
                                    section_id: shell_state.active_section_id.clone(),
                                };
                                render_settings_content(ui, &mut content_props);
                            });
                        } else if is_launcher_view {
                            // Launcher view with pane tree
                            let pane_layout = shell_state.pane_layouts_by_tab_id
                                .get(&shell_state.selected_tab_id)
                                .cloned();

                            let mut pane_props = WorkspacePaneTreeProps::default();

                            let shell_store_clone = self.shell_store.clone();
                            pane_props.on_focus_pane = Some(Box::new(move |id| {
                                let mut guard = shell_store_clone.lock().unwrap();
                                guard.with_state(|state| {
                                    if let Some(layout) = state.pane_layouts_by_tab_id.get_mut(&state.selected_tab_id) {
                                        layout.active_pane_id = id;
                                    }
                                });
                            }));

                            self.pane_tree_state.layout = pane_layout.map(|l| crate::chrome::workspace_types::WorkspacePaneLayout {
                                active_pane_id: l.active_pane_id,
                                root: convert_shell_pane_node(&l.root),
                            }).unwrap_or_default();
                            self.pane_tree_state.active_pane_id = Some(shell_state.selected_tab_id.clone());
                            self.pane_tree_state.selected_tab_id = shell_state.selected_tab_id.clone();

                            render_workspace_pane_tree(ui, &mut pane_props, &mut self.pane_tree_state);
                        } else {
                            // Panel placeholder
                            ui.vertical_centered(|ui| {
                                ui.add_space(64.0);
                                ui.heading(&selected_tab.label);
                                ui.label(format!("Workspace for {} is still a placeholder.", selected_tab.label.to_lowercase()));
                            });
                        }

                        // Drawers layer
                        let mut drawer_props = AppWindowDrawersProps {
                            is_editor_open: !self.editor_widget.tabs.is_empty(),
                            is_keyboard_shortcuts_drawer_open: self.is_keyboard_shortcuts_open,
                            active_working_directory: None,
                            ..Default::default()
                        };

                        let shortcuts_open = Arc::new(Mutex::new(false));
                        let app_shortcuts_open = Arc::clone(&shortcuts_open);
                        drawer_props.on_close_keyboard_shortcuts = Some(Box::new(move || {
                            if let Ok(mut open) = app_shortcuts_open.lock() {
                                *open = false;
                            }
                        }));

                        let ui_state = self.ui_store.lock().unwrap().get_state();
                        render_app_window_drawers(
                            ui,
                            &mut drawer_props,
                            &mut self.drawers_state,
                            &mut self.editor_widget,
                            &self.editor_store.lock().unwrap(),
                            &ui_state,
                        );
                    });
                });

                // Agents overlay
                if is_agents_active {
                    let overlay_area = ui.available_rect_before_wrap();
                    let panel_rect = egui::Rect::from_min_size(
                        overlay_area.min,
                        Vec2::new(overlay_area.width().min(600.0), overlay_area.height()),
                    );

                    let mut agents_props = AgentsViewProps {
                        conversations: Vec::new(),
                        ..Default::default()
                    };

                    let shell_store_clone = self.shell_store.clone();
                    agents_props.on_close = Some(Box::new(move || {
                        let mut guard = shell_store_clone.lock().unwrap();
                        guard.with_state(|state| {
                            state.is_agents_active = false;
                        });
                    }));

                    ui.allocate_ui_at_rect(panel_rect, |ui| {
                        Frame::popup(ui.style()).show(ui, |ui| {
                            render_agents_view(ui, &mut agents_props, &mut self.agents_view_state);
                        });
                    });
                }
            });
        });
    }
}

fn convert_shell_pane_node(node: &ShellPaneNode) -> crate::chrome::workspace_types::WorkspacePaneNode {
    match node {
        ShellPaneNode::Leaf { pane_id } => {
            crate::chrome::workspace_types::WorkspacePaneNode::Leaf { pane_id: pane_id.clone() }
        }
        ShellPaneNode::Split { direction, children } => {
            let dir = match direction.as_str() {
                "horizontal" => crate::chrome::workspace_types::WorkspacePaneDirection::Horizontal,
                _ => crate::chrome::workspace_types::WorkspacePaneDirection::Vertical,
            };
            crate::chrome::workspace_types::WorkspacePaneNode::Split {
                direction: dir,
                children: children.iter().map(convert_shell_pane_node).collect(),
            }
        }
    }
}

impl eframe::App for OctomusApp {
    fn update(
        &mut self, ctx: &egui::Context, _frame: &mut eframe::Frame
    ) {
        if self.show_onboarding {
            if let Some(ref mut win) = self.onboarding {
                let mut open = true;
                win.show(ctx, &mut open);
                if !open {
                    self.show_onboarding = false;
                }
                if win.is_completed() {
                    self.show_onboarding = false;
                }
            }
            return;
        }

        match self.panel_mode {
            PanelMode::Onboarding => {
                if let Some(ref mut win) = self.onboarding {
                    let mut open = true;
                    win.show(ctx, &mut open);
                    if !open || win.is_completed() {
                        self.show_onboarding = false;
                        self.panel_mode = PanelMode::Launcher;
                    }
                }
            }
            PanelMode::Settings => {
                self.render_shell_window(ctx);
            }
            PanelMode::Launcher => {
                self.render_shell_window(ctx);
            }
        }

        // Status bar
        egui::TopBottomPanel::bottom("status_bar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label("Octomus");
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("⚙").clicked() {
                        self.show_settings = !self.show_settings;
                    }
                    let theme_label = match self.theme.kind() {
                        ThemeKind::Dark => "🌙",
                        ThemeKind::Light => "☀",
                    };
                    if ui.button(theme_label).clicked() {
                        let next = match self.theme.kind() {
                            ThemeKind::Dark => ThemeKind::Light,
                            ThemeKind::Light => ThemeKind::Dark,
                        };
                        self.set_theme(ctx, next);
                    }
                });
            });
        });

        // Settings window
        if self.show_settings {
            self.ensure_settings();
            if let Some(ref mut win) = self.settings {
                let mut open = true;
                win.show(ctx, &mut open);
                if !open {
                    self.show_settings = false;
                }
            }
        }
    }

    fn on_exit(&mut self, _ctx: Option<&eframe::glow::Context>) {
        if let Some(ref mut tray) = self.tray {
            tray.shutdown();
        }
    }
}
