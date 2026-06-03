use egui::{Frame, Margin, Response, Ui};

pub struct PanelProps {
    pub title: String,
    pub collapsible: bool,
    pub collapsed: bool,
}

impl Default for PanelProps {
    fn default() -> Self {
        Self {
            title: String::new(),
            collapsible: false,
            collapsed: false,
        }
    }
}

pub fn render_panel<R>(ui: &mut Ui, props: &mut PanelProps, content: impl FnOnce(&mut Ui) -> R) -> Response {
    let frame = Frame::group(ui.style()).inner_margin(Margin::same(8));
    frame.show(ui, |ui| {
        ui.horizontal(|ui| {
            if props.collapsible && ui.small_button(if props.collapsed { "▶" } else { "▼" }).clicked() {
                props.collapsed = !props.collapsed;
            }
            ui.heading(&props.title);
        });
        if !props.collapsed {
            content(ui);
        }
    }).response
}
