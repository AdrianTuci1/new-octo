use egui::{Response, ScrollArea, Ui};

pub struct ScrollAreaProps {
    pub auto_shrink: bool,
    pub max_height: Option<f32>,
}

impl Default for ScrollAreaProps {
    fn default() -> Self {
        Self {
            auto_shrink: false,
            max_height: None,
        }
    }
}

pub fn render_scroll_area<R>(ui: &mut Ui, props: &ScrollAreaProps, content: impl FnOnce(&mut Ui) -> R) -> Response {
    let mut area = ScrollArea::vertical().auto_shrink([false; 2]);
    if let Some(h) = props.max_height {
        area = area.max_height(h);
    }
    area.show(ui, |ui| {
        content(ui);
    });
    ui.response()
}
