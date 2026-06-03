use egui::{Color32, Frame, Margin, Response, RichText, CornerRadius, Sense, Stroke, Ui, Vec2, Widget};
use super::context_menu_store::ContextMenuStore;

/// ComposerContextMenu — 1:1 port of React `ComposerContextMenu.tsx`.
pub struct ContextMenuWidget<'a> {
    pub store: &'a ContextMenuStore,
    pub items: &'a [ContextMenuItem],
    pub on_close: &'a mut dyn FnMut(),
}

pub struct ContextMenuItem {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub shortcut: Option<String>,
    pub disabled: bool,
    pub separator_before: bool,
}

impl<'a> ContextMenuWidget<'a> {
    pub fn new(store: &'a ContextMenuStore, items: &'a [ContextMenuItem], on_close: &'a mut dyn FnMut()) -> Self {
        Self { store, items, on_close }
    }
}

impl<'a> Widget for ContextMenuWidget<'a> {
    fn ui(self, ui: &mut Ui) -> Response {
        let bg = ui.visuals().widgets.inactive.bg_fill;
        let text_color = ui.visuals().text_color();
        let dim = Color32::from_rgba_premultiplied(255, 255, 255, 140);

        let response = Frame::none()
            .fill(bg)
            .stroke(Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 20)))
            .corner_radius(CornerRadius::same(10))
            .inner_margin(Margin::same(6))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    for item in self.items {
                        if item.separator_before {
                            ui.add_space(4.0);
                            ui.separator();
                            ui.add_space(4.0);
                        }

                        let label_text = format!(
                            "{} {} {}",
                            item.icon.as_deref().unwrap_or(""),
                            item.label,
                            item.shortcut.as_deref().unwrap_or("")
                        );

                        let resp = ui.add(
                            egui::Button::new(
                                RichText::new(label_text.trim())
                                    .size(12.0)
                                    .color(if item.disabled { dim } else { text_color }),
                            )
                            .sense(if item.disabled { Sense::hover() } else { Sense::click() })
                            .fill(Color32::TRANSPARENT)
                            .corner_radius(CornerRadius::same(6))
                            .min_size(Vec2::new(180.0, 28.0)),
                        );

                        if resp.clicked() && !item.disabled {
                            (self.on_close)();
                        }

                        let _ = resp;
                    }
                });
            })
            .response;

        response
    }
}
