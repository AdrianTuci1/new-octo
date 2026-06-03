use egui::{Response, Ui};

pub struct TabItem {
    pub id: String,
    pub label: String,
    pub closable: bool,
}

pub struct TabsProps {
    pub active_tab_id: String,
    pub tabs: Vec<TabItem>,
}

pub fn render_tabs(ui: &mut Ui, props: &mut TabsProps) -> (Response, Option<String>, Option<String>) {
    let mut clicked_tab: Option<String> = None;
    let mut closed_tab: Option<String> = None;

    ui.horizontal(|ui| {
        for tab in &props.tabs {
            let is_active = tab.id == props.active_tab_id;
            let label = if is_active {
                format!("> {}", tab.label)
            } else {
                tab.label.clone()
            };
            let response = ui.selectable_label(is_active, label);
            if response.clicked() {
                clicked_tab = Some(tab.id.clone());
            }
            if tab.closable && ui.small_button("x").clicked() {
                closed_tab = Some(tab.id.clone());
            }
        }
    });

    (ui.response(), clicked_tab, closed_tab)
}
