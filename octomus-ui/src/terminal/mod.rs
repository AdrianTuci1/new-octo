mod ansi;
mod output;
mod renderer;
mod session;

pub use ansi::{
    AnsiColor, AnsiParser, CellStyle, ShellHook, StyledCell, TerminalStreamEvent,
    clean_terminal_text,
};
pub use output::{
    OutputBlock, OutputBlockPresentation, OutputBlockSource, OutputBlockStatus,
    OutputBuffer, SharedOutputBuffer,
};
pub use renderer::{
    TerminalCell, TerminalGrid, TerminalRenderer, TerminalRow,
};
pub use session::{
    SessionKind, SessionProvider, SessionRegistry, SessionStatus, TerminalSession,
};

#[derive(Debug, Clone)]
pub struct TerminalWidget {
    pub renderer: TerminalRenderer,
    pub session_id: Option<String>,
    pub selected_block_id: Option<String>,
    pub filter_text: Option<String>,
}

impl TerminalWidget {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            renderer: TerminalRenderer::new(width, height),
            session_id: None,
            selected_block_id: None,
            filter_text: None,
        }
    }

    pub fn attach_session(&mut self, session_id: String) {
        self.session_id = Some(session_id);
    }

    pub fn detach_session(&mut self) {
        self.session_id = None;
        self.selected_block_id = None;
    }

    pub fn select_block(&mut self, block_id: Option<String>) {
        self.selected_block_id = block_id;
    }

    pub fn set_filter(&mut self, filter: Option<String>) {
        self.filter_text = filter;
    }

    pub fn resize(&mut self, width: usize, height: usize) {
        self.renderer.resize(width, height);
    }

    pub fn render_block(&mut self, block: &OutputBlock) {
        self.renderer.render_block(block);
    }

    pub fn render_plain_text(&mut self, text: &str) {
        self.renderer.render_plain_text(text);
    }

    pub fn scroll_up(&mut self, lines: usize) {
        self.renderer.grid_mut().scroll_up(lines);
    }

    pub fn scroll_down(&mut self, lines: usize) {
        self.renderer.grid_mut().scroll_down(lines);
    }

    pub fn visible_text(&self) -> String {
        self.renderer.to_string()
    }

    /// Render the terminal widget into an egui UI
    pub fn render_ui(&self,
        ui: &mut egui::Ui,
    ) {
        let available = ui.available_size_before_wrap();
        let (response, painter) = ui.allocate_painter(available, egui::Sense::click());
        let rect = response.rect;

        let char_width = 8.0;
        let line_height = 16.0;
        let cols = (rect.width() / char_width).max(1.0) as usize;
        let rows = (rect.height() / line_height).max(1.0) as usize;

        let grid = self.renderer.grid();
        let visible = grid.visible_rows();

        for (row_idx, row) in visible.iter().enumerate().take(rows) {
            let y = rect.min.y + row_idx as f32 * line_height;
            for (col_idx, cell) in row.cells.iter().enumerate().take(cols) {
                let x = rect.min.x + col_idx as f32 * char_width;
                match cell {
                    TerminalCell::Empty => {}
                    TerminalCell::Filled(styled) => {
                        let char_rect = egui::Rect::from_min_size(
                            egui::Pos2::new(x, y),
                            egui::Vec2::new(char_width, line_height),
                        );
                        painter.text(
                            char_rect.center(),
                            egui::Align2::CENTER_CENTER,
                            styled.ch.to_string(),
                            egui::FontId::monospace(12.0),
                            egui::Color32::WHITE,
                        );
                    }
                }
            }
        }
    }
}

impl Default for TerminalWidget {
    fn default() -> Self {
        Self::new(80, 24)
    }
}
