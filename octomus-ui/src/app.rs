use crate::themes::{Theme, ThemeKind};
use crate::tray::TrayHandle;
use crate::windows::{launcher::LauncherWindow, onboarding::OnboardingWindow, settings::SettingsWindow, Window};
use eframe::egui;

pub struct OctomusApp {
    theme: Theme,
    launcher: LauncherWindow,
    settings: Option<SettingsWindow>,
    onboarding: Option<OnboardingWindow>,
    #[allow(dead_code)]
    tray: Option<TrayHandle>,
    show_settings: bool,
    show_onboarding: bool,
}

impl OctomusApp {
    pub fn new(cc: &eframe::CreationContext<'_> ) -> Self {
        let theme = Theme::from_preference(ThemeKind::Dark);
        theme.apply(&cc.egui_ctx);

        let tray = TrayHandle::try_create().ok();

        let mut app = Self {
            theme,
            launcher: LauncherWindow::default(),
            settings: None,
            onboarding: None,
            tray,
            show_settings: false,
            show_onboarding: true,
        };

        app.onboarding = Some(OnboardingWindow::default());
        app
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
}

impl eframe::App for OctomusApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
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

        self.launcher.show(ctx, &mut true);

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
    }

    fn on_exit(&mut self, _ctx: Option<&eframe::glow::Context>) {
        if let Some(ref mut tray) = self.tray {
            tray.shutdown();
        }
    }
}
