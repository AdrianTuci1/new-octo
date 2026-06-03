use egui::{Color32, Response, RichText, Stroke, Ui, Widget};

pub struct ChatFindOverlay {
    pub is_open: bool,
    pub query: String,
    pub case_sensitive: bool,
    pub use_regex: bool,
    pub whole_word: bool,
    pub match_count: usize,
    pub active_index: i32,
    pub on_close: Option<Box<dyn FnOnce()>>,
    pub on_next: Option<Box<dyn FnOnce()>>,
    pub on_previous: Option<Box<dyn FnOnce()>>,
    pub on_toggle_regex: Option<Box<dyn FnOnce()>>,
    pub on_toggle_case: Option<Box<dyn FnOnce()>>,
    pub on_toggle_whole_word: Option<Box<dyn FnOnce()>>,
}

impl Default for ChatFindOverlay {
    fn default() -> Self {
        Self {
            is_open: false,
            query: String::new(),
            case_sensitive: false,
            use_regex: false,
            whole_word: false,
            match_count: 0,
            active_index: -1,
            on_close: None,
            on_next: None,
            on_previous: None,
            on_toggle_regex: None,
            on_toggle_case: None,
            on_toggle_whole_word: None,
        }
    }
}

impl ChatFindOverlay {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_query(mut self, query: impl Into<String>) -> Self {
        self.query = query.into();
        self
    }

    pub fn with_case_sensitive(mut self, value: bool) -> Self {
        self.case_sensitive = value;
        self
    }

    pub fn with_use_regex(mut self, value: bool) -> Self {
        self.use_regex = value;
        self
    }

    pub fn with_whole_word(mut self, value: bool) -> Self {
        self.whole_word = value;
        self
    }

    pub fn with_match_count(mut self, count: usize) -> Self {
        self.match_count = count;
        self
    }

    pub fn with_active_index(mut self, index: i32) -> Self {
        self.active_index = index;
        self
    }

    pub fn on_close(mut self, cb: impl FnOnce() + 'static) -> Self {
        self.on_close = Some(Box::new(cb));
        self
    }

    pub fn on_next(mut self, cb: impl FnOnce() + 'static) -> Self {
        self.on_next = Some(Box::new(cb));
        self
    }

    pub fn on_previous(mut self, cb: impl FnOnce() + 'static) -> Self {
        self.on_previous = Some(Box::new(cb));
        self
    }

    pub fn on_toggle_regex(mut self, cb: impl FnOnce() + 'static) -> Self {
        self.on_toggle_regex = Some(Box::new(cb));
        self
    }

    pub fn on_toggle_case(mut self, cb: impl FnOnce() + 'static) -> Self {
        self.on_toggle_case = Some(Box::new(cb));
        self
    }

    pub fn on_toggle_whole_word(mut self, cb: impl FnOnce() + 'static) -> Self {
        self.on_toggle_whole_word = Some(Box::new(cb));
        self
    }
}

impl Widget for ChatFindOverlay {
    fn ui(self, ui: &mut Ui) -> Response {
        if !self.is_open {
            return ui.allocate_response(egui::Vec2::ZERO, egui::Sense::hover());
        }

        let frame_bg = Color32::from_rgb(30, 30, 30).gamma_multiply(0.9);
        let border_color = Color32::from_rgb(255, 255, 255).gamma_multiply(0.08);

        egui::Frame::NONE
            .fill(frame_bg)
            .stroke(Stroke::new(1.0, border_color))
            .corner_radius(egui::CornerRadius::same(8))
            .inner_margin(egui::vec2(10.0, 4.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.set_min_height(28.0);

                    // Input container
                    ui.horizontal(|ui| {
                        let input_bg = Color32::from_rgb(21, 21, 21);
                        let input_border = Color32::from_rgb(255, 255, 255).gamma_multiply(0.08);

                        let mut text = self.query.clone();
                        let response = ui.add(
                            egui::TextEdit::singleline(&mut text)
                                .desired_width(240.0)
                                .hint_text("Find")
                                .margin(egui::vec2(10.0, 4.0)),
                        );

                        // Toggle buttons inside input
                        let regex_active = if self.use_regex {
                            Color32::from_rgb(64, 198, 255)
                        } else {
                            Color32::from_rgb(255, 255, 255).gamma_multiply(0.4)
                        };
                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new(".*")
                                        .monospace()
                                        .size(11.0)
                                        .strong()
                                        .color(regex_active),
                                )
                                .frame(false)
                                .min_size(egui::vec2(22.0, 22.0)),
                            )
                            .clicked()
                        {
                            if let Some(cb) = self.on_toggle_regex {
                                cb();
                            }
                        }

                        let case_active = if self.case_sensitive {
                            Color32::from_rgb(64, 198, 255)
                        } else {
                            Color32::from_rgb(255, 255, 255).gamma_multiply(0.4)
                        };
                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new("Aa")
                                        .monospace()
                                        .size(11.0)
                                        .strong()
                                        .color(case_active),
                                )
                                .frame(false)
                                .min_size(egui::vec2(22.0, 22.0)),
                            )
                            .clicked()
                        {
                            if let Some(cb) = self.on_toggle_case {
                                cb();
                            }
                        }

                        let word_active = if self.whole_word {
                            Color32::from_rgb(64, 198, 255)
                        } else {
                            Color32::from_rgb(255, 255, 255).gamma_multiply(0.4)
                        };
                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new("◊")
                                        .monospace()
                                        .size(11.0)
                                        .strong()
                                        .color(word_active),
                                )
                                .frame(false)
                                .min_size(egui::vec2(22.0, 22.0)),
                            )
                            .clicked()
                        {
                            if let Some(cb) = self.on_toggle_whole_word {
                                cb();
                            }
                        }

                        response
                    });

                    ui.add_space(12.0);

                    // Match count
                    let count_text = if self.match_count > 0 {
                        format!("{}/{}", self.active_index + 1, self.match_count)
                    } else {
                        "0/0".to_string()
                    };
                    ui.label(
                        RichText::new(count_text)
                            .monospace()
                            .size(12.0)
                            .color(Color32::from_rgb(255, 255, 255).gamma_multiply(0.5)),
                    );

                    ui.add_space(12.0);

                    // Nav buttons
                    ui.horizontal(|ui| {
                        let nav_btn_size = egui::vec2(24.0, 24.0);
                        let nav_color = Color32::from_rgb(255, 255, 255).gamma_multiply(0.6);
                        let nav_disabled = Color32::from_rgb(255, 255, 255).gamma_multiply(0.2);

                        let can_nav = self.match_count > 0;
                        let down_color = if can_nav { nav_color } else { nav_disabled };
                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new("↓").size(14.0).color(down_color),
                                )
                                .frame(false)
                                .min_size(nav_btn_size),
                            )
                            .clicked()
                            && can_nav
                        {
                            if let Some(cb) = self.on_next {
                                cb();
                            }
                        }

                        let up_color = if can_nav { nav_color } else { nav_disabled };
                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new("↑").size(14.0).color(up_color),
                                )
                                .frame(false)
                                .min_size(nav_btn_size),
                            )
                            .clicked()
                            && can_nav
                        {
                            if let Some(cb) = self.on_previous {
                                cb();
                            }
                        }

                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new("✕").size(14.0).color(nav_color),
                                )
                                .frame(false)
                                .min_size(nav_btn_size),
                            )
                            .clicked()
                        {
                            if let Some(cb) = self.on_close {
                                cb();
                            }
                        }
                    });
                })
                .response
            })
            .response
    }
}
