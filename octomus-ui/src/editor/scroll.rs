/// Scroll state for the editor widget.
///
/// Mirrors the React `scroll` editor sub-component.
#[derive(Debug, Clone)]
pub struct ScrollState {
    pub scroll_top: f64,
    pub scroll_left: f64,
    pub line_height: f64,
    pub viewport_height: f64,
    pub viewport_width: f64,
    pub content_height: f64,
    pub content_width: f64,
}

impl Default for ScrollState {
    fn default() -> Self {
        Self {
            scroll_top: 0.0,
            scroll_left: 0.0,
            line_height: 18.0,
            viewport_height: 0.0,
            viewport_width: 0.0,
            content_height: 0.0,
            content_width: 0.0,
        }
    }
}

impl ScrollState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn visible_line_count(&self) -> usize {
        if self.line_height <= 0.0 {
            return 0;
        }
        (self.viewport_height / self.line_height).floor() as usize
    }

    pub fn max_scroll_top(&self) -> f64 {
        (self.content_height - self.viewport_height).max(0.0)
    }

    pub fn max_scroll_left(&self) -> f64 {
        (self.content_width - self.viewport_width).max(0.0)
    }

    pub fn scroll_by(&mut self, delta_y: f64, delta_x: f64) {
        self.scroll_top = (self.scroll_top + delta_y)
            .max(0.0)
            .min(self.max_scroll_top());
        self.scroll_left = (self.scroll_left + delta_x)
            .max(0.0)
            .min(self.max_scroll_left());
    }

    pub fn scroll_to_line(&mut self, line: usize) {
        self.scroll_top = (line as f64 * self.line_height)
            .max(0.0)
            .min(self.max_scroll_top());
    }

    pub fn first_visible_line(&self) -> usize {
        if self.line_height <= 0.0 {
            return 0;
        }
        (self.scroll_top / self.line_height).floor() as usize
    }
}
