use egui::{Color32, Response, RichText, CornerRadius, Sense, Ui, Vec2, Widget};

/// WorkingDirectoryPicker — 1:1 port of React `WorkingDirectoryPicker.tsx`.
pub struct WorkingDirectoryPicker<'a> {
    pub label: &'a str,
    pub menu_open: bool,
    pub listing: Option<&'a DirectoryListing>,
    pub search: &'a str,
}

pub struct DirectoryListing {
    pub entries: Vec<DirectoryEntry>,
}

pub struct DirectoryEntry {
    pub name: String,
    pub is_directory: bool,
    pub is_selected: bool,
}

impl<'a> WorkingDirectoryPicker<'a> {
    pub fn new(label: &'a str) -> Self {
        Self {
            label,
            menu_open: false,
            listing: None,
            search: "",
        }
    }
}

impl<'a> Widget for WorkingDirectoryPicker<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let mut open = self.menu_open;
        let resp = ui.add(
            egui::Button::new(
                RichText::new(format!("📁 {}", self.label))
                    .size(10.0)
                    .color(Color32::from_rgba_premultiplied(255, 255, 255, 180)),
            )
            .sense(Sense::click())
            .fill(ui.visuals().widgets.inactive.bg_fill)
            .corner_radius(CornerRadius::same(8))
            .min_size(Vec2::new(0.0, 24.0)),
        );

        if resp.clicked() {
            open = !open;
        }

        if open {
            egui::popup_above_or_below_widget(
                ui,
                resp.id.with("dir_popup"),
                &resp,
                egui::AboveOrBelow::Below,
                egui::PopupCloseBehavior::CloseOnClickOutside,
                |ui| {
                    ui.set_min_width(200.0);
                    ui.vertical(|ui| {
                        let mut search = self.search.to_string();
                        ui.add(
                            egui::TextEdit::singleline(&mut search)
                                .hint_text("Search directories...")
                                .desired_width(180.0),
                        );

                        if let Some(listing) = self.listing {
                            for entry in &listing.entries {
                                let icon = if entry.is_directory { "📁" } else { "📄" };
                                let label = format!("{} {}", icon, entry.name);
                                let b = ui.add(
                                    egui::Button::new(
                                        RichText::new(label)
                                            .size(11.0)
                                            .color(if entry.is_selected {
                                                Color32::from_rgb(0, 163, 255)
                                            } else {
                                                ui.visuals().text_color()
                                            })
                                            .strong(),
                                    )
                                    .sense(Sense::click())
                                    .fill(Color32::TRANSPARENT)
                                    .corner_radius(CornerRadius::same(6)),
                                );
                                let _ = b;
                            }
                        }
                    });
                },
            );
        }

        resp
    }
}
