/// Appearance settings section state.
///
/// Mirrors the React `AppearanceSection` component and its `AppearanceSettings` shape.
#[derive(Debug, Clone)]
pub struct AppearanceSettings {
    pub cursor_type: CursorType,
    pub cursor_blinking: bool,
    pub show_tab_indicators: bool,
    pub show_tab_bar: ShowTabBarMode,
    pub tab_close_position: TabClosePosition,
    pub preserve_tab_color: bool,
    pub vertical_tabs: bool,
    pub latest_prompt_tab_names: bool,
    pub sync_with_os: bool,
    pub custom_window_size: bool,
    pub use_alt_screen_padding: bool,
    pub custom_icon_style: IconStyle,
    pub window_opacity: u8,
    pub window_blur_radius: u8,
    pub zoom_level: u8,
    pub consistent_tools_panel: bool,
    pub input_type: InputType,
    pub input_position: InputPosition,
    pub dim_inactive_panes: bool,
    pub focus_follows_mouse: bool,
    pub compact_mode: bool,
    pub show_jump_to_bottom: bool,
    pub show_block_dividers: bool,
    pub terminal_font: String,
    pub font_weight: FontWeight,
    pub font_size: u8,
    pub line_height: f32,
    pub view_system_fonts: bool,
    pub agent_font: String,
    pub match_terminal_font: bool,
    pub alt_screen_padding: u8,
    pub toolbar_left_items: Vec<String>,
    pub toolbar_right_items: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CursorType {
    Bar,
    Block,
    Underline,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShowTabBarMode {
    Always,
    Windowed,
    Never,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TabClosePosition {
    Left,
    Right,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IconStyle {
    Mono,
    Color,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InputType {
    Warp,
    Shell,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InputPosition {
    Bottom,
    Top,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FontWeight {
    Normal,
    Medium,
    Bold,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            cursor_type: CursorType::Block,
            cursor_blinking: true,
            show_tab_indicators: true,
            show_tab_bar: ShowTabBarMode::Windowed,
            tab_close_position: TabClosePosition::Right,
            preserve_tab_color: false,
            vertical_tabs: false,
            latest_prompt_tab_names: false,
            sync_with_os: false,
            custom_window_size: false,
            use_alt_screen_padding: true,
            custom_icon_style: IconStyle::Mono,
            window_opacity: 100,
            window_blur_radius: 1,
            zoom_level: 100,
            consistent_tools_panel: true,
            input_type: InputType::Warp,
            input_position: InputPosition::Bottom,
            dim_inactive_panes: false,
            focus_follows_mouse: false,
            compact_mode: false,
            show_jump_to_bottom: true,
            show_block_dividers: true,
            terminal_font: "Hack".to_string(),
            font_weight: FontWeight::Normal,
            font_size: 13,
            line_height: 1.2,
            view_system_fonts: false,
            agent_font: "Hack".to_string(),
            match_terminal_font: false,
            alt_screen_padding: 0,
            toolbar_left_items: vec![
                "Tools Panel".to_string(),
                "Agent Management".to_string(),
            ],
            toolbar_right_items: vec![
                "Code Review".to_string(),
                "Notifications".to_string(),
            ],
        }
    }
}

impl AppearanceSettings {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn font_family(&self) -> String {
        font_family_for(&self.terminal_font)
    }

    pub fn agent_font_family(&self) -> String {
        if self.match_terminal_font {
            self.font_family()
        } else {
            font_family_for(&self.agent_font)
        }
    }
}

fn font_family_for(font: &str) -> String {
    match font {
        "JetBrains" => "\"JetBrains Mono\", \"SF Mono\", monospace".to_string(),
        "Monaspace" => "\"Monaspace\", \"SF Mono\", monospace".to_string(),
        "Menlo" => "Menlo, \"SF Mono\", monospace".to_string(),
        "Monaco" => "Monaco, \"SF Mono\", monospace".to_string(),
        "SF Mono" => "\"SF Mono\", monospace".to_string(),
        _ => "\"SF Mono\", \"Hack\", \"JetBrains Mono\", monospace".to_string(),
    }
}
