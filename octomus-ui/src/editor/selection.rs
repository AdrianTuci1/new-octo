/// Selection state for the editor widget.
///
/// Mirrors the React `selection` editor sub-component.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Selection {
    pub anchor: Cursor,
    pub head: Cursor,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cursor {
    pub line: usize,
    pub column: usize,
}

impl Default for Selection {
    fn default() -> Self {
        Self {
            anchor: Cursor { line: 0, column: 0 },
            head: Cursor { line: 0, column: 0 },
        }
    }
}

impl Selection {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_empty(&self) -> bool {
        self.anchor == self.head
    }

    pub fn start(&self) -> &Cursor {
        if self.anchor.line < self.head.line
            || (self.anchor.line == self.head.line && self.anchor.column <= self.head.column)
        {
            &self.anchor
        } else {
            &self.head
        }
    }

    pub fn end(&self) -> &Cursor {
        if self.anchor.line < self.head.line
            || (self.anchor.line == self.head.line && self.anchor.column <= self.head.column)
        {
            &self.head
        } else {
            &self.anchor
        }
    }

    pub fn set_head(&mut self, line: usize, column: usize) {
        self.head = Cursor { line, column };
    }

    pub fn set_anchor(&mut self, line: usize, column: usize) {
        self.anchor = Cursor { line, column };
    }

    pub fn collapse_to_head(&mut self) {
        self.anchor = self.head.clone();
    }

    pub fn collapse_to(line: usize, column: usize) -> Self {
        let cursor = Cursor { line, column };
        Self {
            anchor: cursor.clone(),
            head: cursor,
        }
    }
}
