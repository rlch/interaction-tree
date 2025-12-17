use ratatui::style::Color;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Theme {
    // UI chrome
    pub border: Color,
    pub border_focused: Color,
    pub title: Color,
    pub background: Color,

    // Text
    pub text: Color,
    pub text_dim: Color,
    pub text_highlight: Color,

    // Status
    pub success: Color,
    pub warning: Color,
    pub error: Color,
    pub info: Color,

    // Sources (for events)
    pub source_flutter: Color,
    pub source_agent: Color,
    pub source_vm: Color,
    pub source_mcp: Color,
    pub source_tree: Color,
}

impl Default for Theme {
    fn default() -> Self {
        Self {
            border: Color::DarkGray,
            border_focused: Color::Cyan,
            title: Color::Cyan,
            background: Color::Black,

            text: Color::White,
            text_dim: Color::DarkGray,
            text_highlight: Color::Yellow,

            success: Color::Green,
            warning: Color::Yellow,
            error: Color::Red,
            info: Color::Blue,

            source_flutter: Color::Green,
            source_agent: Color::Blue,
            source_vm: Color::Yellow,
            source_mcp: Color::Cyan,
            source_tree: Color::Magenta,
        }
    }
}

pub fn theme() -> &'static Theme {
    static THEME: std::sync::OnceLock<Theme> = std::sync::OnceLock::new();
    THEME.get_or_init(Theme::default)
}
