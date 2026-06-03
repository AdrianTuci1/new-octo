use egui::{Color32, Response, RichText, CornerRadius, Sense, Ui, Vec2, Widget};

/// GitBranchPicker — 1:1 port of React `GitBranchPicker.tsx`.
pub struct GitBranchPicker<'a> {
    pub current_branch: &'a str,
    pub branches: &'a [String],
    pub menu_open: bool,
}

impl<'a> GitBranchPicker<'a> {
    pub fn new(current_branch: &'a str, branches: &'a [String]) -> Self {
        Self {
            current_branch,
            branches,
            menu_open: false,
        }
    }
}

impl<'a> Widget for GitBranchPicker<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let mut open = self.menu_open;
        let resp = ui.add(
            egui::Button::new(
                RichText::new(format!("🌿 {}", self.current_branch))
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
                resp.id.with("branch_popup"),
                &resp,
                egui::AboveOrBelow::Below,
                egui::PopupCloseBehavior::CloseOnClickOutside,
                |ui| {
                    ui.set_min_width(160.0);
                    ui.vertical(|ui| {
                        for branch in self.branches {
                            let is_current = branch == self.current_branch;
                            let label = if is_current {
                                format!("✓ {}", branch)
                            } else {
                                branch.clone()
                            };
                            let b = ui.add(
                                egui::Button::new(
                                    RichText::new(label)
                                        .size(11.0)
                                        .color(if is_current {
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
                    });
                },
            );
        }

        resp
    }
}
