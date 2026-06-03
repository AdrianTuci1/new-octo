use std::fmt;

use super::ansi::{CellStyle, StyledCell};
use super::output::{OutputBlock, OutputBlockStatus};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminalCell {
    Empty,
    Filled(StyledCell),
}

impl Default for TerminalCell {
    fn default() -> Self {
        TerminalCell::Empty
    }
}

#[derive(Debug, Clone)]
pub struct TerminalRow {
    pub cells: Vec<TerminalCell>,
}

impl TerminalRow {
    pub fn new(width: usize) -> Self {
        Self {
            cells: vec![TerminalCell::Empty; width],
        }
    }

    pub fn from_cells(cells: Vec<TerminalCell>) -> Self {
        Self { cells }
    }

    pub fn width(&self) -> usize {
        self.cells.len()
    }

    pub fn resize(&mut self, new_width: usize) {
        if new_width > self.cells.len() {
            self.cells.resize(new_width, TerminalCell::Empty);
        } else {
            self.cells.truncate(new_width);
        }
    }

    pub fn render_plain(&self) -> String {
        self.cells
            .iter()
            .map(|cell| match cell {
                TerminalCell::Empty => ' ',
                TerminalCell::Filled(styled) => styled.ch,
            })
            .collect()
    }
}

#[derive(Debug, Clone)]
pub struct TerminalGrid {
    rows: Vec<TerminalRow>,
    width: usize,
    height: usize,
    scroll_offset: usize,
}

impl TerminalGrid {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            rows: vec![TerminalRow::new(width); height],
            width,
            height,
            scroll_offset: 0,
        }
    }

    pub fn resize(&mut self, width: usize, height: usize) {
        self.width = width;
        self.height = height;
        self.rows.resize_with(height, || TerminalRow::new(width));
        for row in &mut self.rows {
            row.resize(width);
        }
    }

    pub fn clear(&mut self) {
        self.rows = vec![TerminalRow::new(self.width); self.height];
        self.scroll_offset = 0;
    }

    pub fn scroll_up(&mut self, lines: usize) {
        self.scroll_offset = self.scroll_offset.saturating_sub(lines);
    }

    pub fn scroll_down(&mut self, lines: usize) {
        let max_offset = self.rows.len().saturating_sub(self.height);
        self.scroll_offset = (self.scroll_offset + lines).min(max_offset);
    }

    pub fn set_scroll_offset(&mut self, offset: usize) {
        let max_offset = self.rows.len().saturating_sub(self.height);
        self.scroll_offset = offset.min(max_offset);
    }

    pub fn visible_rows(&self) -> &[TerminalRow] {
        let start = self.scroll_offset.min(self.rows.len());
        let end = (start + self.height).min(self.rows.len());
        &self.rows[start..end]
    }

    pub fn all_rows(&self) -> &[TerminalRow] {
        &self.rows
    }

    pub fn append_line(&mut self, cells: Vec<TerminalCell>) {
        self.rows.push(TerminalRow::from_cells(cells));
    }

    pub fn append_plain_line(&mut self, text: &str) {
        let cells: Vec<TerminalCell> = text
            .chars()
            .map(|ch| {
                TerminalCell::Filled(StyledCell {
                    ch,
                    style: CellStyle::default(),
                })
            })
            .collect();
        self.append_line(cells);
    }

    pub fn append_styled_line(&mut self, styled_cells: Vec<StyledCell>) {
        let cells: Vec<TerminalCell> = styled_cells
            .into_iter()
            .map(TerminalCell::Filled)
            .collect();
        self.append_line(cells);
    }

    pub fn row_count(&self) -> usize {
        self.rows.len()
    }

    pub fn scroll_offset(&self) -> usize {
        self.scroll_offset
    }

    pub fn dimensions(&self) -> (usize, usize) {
        (self.width, self.height)
    }
}

#[derive(Debug, Clone)]
pub struct TerminalRenderer {
    grid: TerminalGrid,
    max_lines: usize,
}

impl TerminalRenderer {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            grid: TerminalGrid::new(width, height),
            max_lines: 10_000,
        }
    }

    pub fn with_max_lines(width: usize, height: usize, max_lines: usize) -> Self {
        Self {
            grid: TerminalGrid::new(width, height),
            max_lines,
        }
    }

    pub fn render_block(&mut self, block: &OutputBlock) {
        self.grid.clear();

        let header = format!("$ {}", block.command);
        self.grid.append_plain_line(&header);

        let status_line = match block.status {
            OutputBlockStatus::Running => "[running]".to_string(),
            OutputBlockStatus::Finished { exit_code: Some(0) } => {
                let dur = block
                    .duration_ms
                    .map(|ms| format!("{:.2}s", ms as f64 / 1000.0))
                    .unwrap_or_else(|| "done".to_string());
                format!("[ok — {}]", dur)
            }
            OutputBlockStatus::Finished { exit_code: Some(code) } => {
                format!("[exit {}]", code)
            }
            OutputBlockStatus::Finished { exit_code: None } => {
                "[finished]".to_string()
            }
        };
        self.grid.append_plain_line(&status_line);
        self.grid.append_plain_line("");

        for line in block.styled_cells() {
            let cells: Vec<TerminalCell> = line
                .into_iter()
                .map(TerminalCell::Filled)
                .collect();
            self.grid.append_line(cells);
        }

        self.trim_lines();
        self.grid.set_scroll_offset(self.grid.row_count().saturating_sub(self.grid.dimensions().1));
    }

    pub fn render_plain_text(&mut self, text: &str) {
        self.grid.clear();
        for line in text.lines() {
            self.grid.append_plain_line(line);
        }
        self.trim_lines();
    }

    pub fn render_styled_lines(&mut self, lines: Vec<Vec<StyledCell>>) {
        self.grid.clear();
        for line in lines {
            self.grid.append_styled_line(line);
        }
        self.trim_lines();
    }

    pub fn grid(&self) -> &TerminalGrid {
        &self.grid
    }

    pub fn grid_mut(&mut self) -> &mut TerminalGrid {
        &mut self.grid
    }

    pub fn resize(&mut self, width: usize, height: usize) {
        self.grid.resize(width, height);
    }

    fn trim_lines(&mut self) {
        if self.grid.row_count() > self.max_lines {
            let overflow = self.grid.row_count() - self.max_lines;
            self.grid.rows.drain(0..overflow);
        }
    }
}

impl fmt::Display for TerminalRenderer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for row in self.grid.visible_rows() {
            writeln!(f, "{}", row.render_plain())?;
        }
        Ok(())
    }
}
