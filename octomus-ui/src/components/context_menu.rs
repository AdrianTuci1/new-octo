use egui::Response;

pub struct ContextMenuItem {
    pub id: String,
    pub label: String,
    pub disabled: bool,
}

pub struct ContextMenuProps {
    pub items: Vec<ContextMenuItem>,
}

pub fn render_context_menu(response: &Response, props: &ContextMenuProps) -> Option<String> {
    let mut clicked: Option<String> = None;
    response.context_menu(|ui| {
        for item in &props.items {
            if ui.button(&item.label).clicked() && !item.disabled {
                clicked = Some(item.id.clone());
                ui.close_menu();
            }
        }
    });
    clicked
}
