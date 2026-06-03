/// ContextMenuStore — 1:1 port of React `useComposerContextMenuStore.ts`.
#[derive(Debug, Clone, Default)]
pub struct ContextMenuStore {
    pub is_open: bool,
    pub position: Option<egui::Pos2>,
    pub selected_index: Option<usize>,
}

impl ContextMenuStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn open_at(&mut self, pos: egui::Pos2) {
        self.is_open = true;
        self.position = Some(pos);
        self.selected_index = None;
    }

    pub fn close(&mut self) {
        self.is_open = false;
        self.position = None;
        self.selected_index = None;
    }

    pub fn select_next(&mut self, count: usize) {
        self.selected_index = Some(self.selected_index.map(|i| (i + 1).min(count.saturating_sub(1))).unwrap_or(0));
    }

    pub fn select_prev(&mut self) {
        self.selected_index = self.selected_index.and_then(|i| i.checked_sub(1));
    }
}
