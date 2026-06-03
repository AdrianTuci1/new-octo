/// ComposerState — 1:1 port of React `useComposerBar.ts` state management.
pub struct ComposerState {
    pub query: String,
    pub auto_focus: bool,
    pub auto_resize: bool,
    pub height: f32,
    pub min_height: f32,
    pub max_height: f32,
    pub is_focused: bool,
    pub is_expanded: bool,
    pub show_context_menu: bool,
    pub show_slash_menu: bool,
    pub show_mention_menu: bool,
    pub cursor_position: usize,
}

impl ComposerState {
    pub fn new() -> Self {
        Self {
            query: String::new(),
            auto_focus: true,
            auto_resize: true,
            height: 90.0,
            min_height: 90.0,
            max_height: 300.0,
            is_focused: false,
            is_expanded: false,
            show_context_menu: false,
            show_slash_menu: false,
            show_mention_menu: false,
            cursor_position: 0,
        }
    }

    pub fn set_query(&mut self, value: String) {
        self.query = value;
    }

    pub fn set_cursor_position(&mut self, pos: usize) {
        self.cursor_position = pos;
    }

    pub fn set_focused(&mut self, focused: bool) {
        self.is_focused = focused;
    }

    pub fn set_expanded(&mut self, expanded: bool) {
        self.is_expanded = expanded;
    }
}
