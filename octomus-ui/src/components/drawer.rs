use egui::{Response, SidePanel, Ui};

pub struct DrawerProps {
    pub id: String,
    pub is_open: bool,
    pub width: f32,
}

impl Default for DrawerProps {
    fn default() -> Self {
        Self {
            id: "drawer".to_string(),
            is_open: false,
            width: 280.0,
        }
    }
}

pub fn render_drawer<R>(ui: &mut Ui, props: &DrawerProps, content: impl FnOnce(&mut Ui) -> R) -> Response {
    if props.is_open {
        let panel = SidePanel::right("drawer_panel")
            .resizable(false)
            .exact_width(props.width);
        panel.show_inside(ui, |ui| {
            content(ui);
        });
    }
    ui.response()
}
