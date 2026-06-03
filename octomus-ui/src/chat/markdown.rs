use egui::{Response, Ui, Widget};
use egui_commonmark::{CommonMarkCache, CommonMarkViewer};

pub struct MarkdownRenderer {
    source: String,
}

impl MarkdownRenderer {
    pub fn new(source: impl Into<String>) -> Self {
        Self {
            source: source.into(),
        }
    }
}

impl Widget for MarkdownRenderer {
    fn ui(self, ui: &mut Ui) -> Response {
        let mut cache = CommonMarkCache::default();
        CommonMarkViewer::new()
            .show(ui, &mut cache, &self.source)
            .response
    }
}
