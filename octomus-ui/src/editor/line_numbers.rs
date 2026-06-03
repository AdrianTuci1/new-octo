/// Line numbers gutter state.
///
/// Mirrors the React `line_numbers` editor sub-component.
#[derive(Debug, Clone)]
pub struct LineNumbers {
    pub start_line: usize,
    pub visible_lines: usize,
    pub relative: bool,
}

impl Default for LineNumbers {
    fn default() -> Self {
        Self {
            start_line: 1,
            visible_lines: 0,
            relative: false,
        }
    }
}

impl LineNumbers {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn line_number_for(&self, index: usize) -> usize {
        if self.relative {
            index.saturating_sub(self.start_line.saturating_sub(1))
        } else {
            self.start_line + index
        }
    }

    pub fn gutter_width_chars(&self) -> usize {
        let max_line = self.start_line + self.visible_lines;
        let digits = if max_line == 0 { 1 } else { (max_line as f64).log10() as usize + 1 };
        digits.max(2)
    }
}
