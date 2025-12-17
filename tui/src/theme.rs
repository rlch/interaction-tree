use ratatui::style::Color;
use terminal_colorsaurus::{color_palette, QueryOptions};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemeMode {
    Dark,
    Light,
}

/// Terminal color palette with actual RGB values from the terminal
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct TerminalColors {
    pub foreground: Color,
    pub background: Color,
}

impl Default for TerminalColors {
    fn default() -> Self {
        Self {
            foreground: Color::Reset,
            background: Color::Reset,
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Theme {
    pub mode: ThemeMode,
    pub terminal: TerminalColors,

    // UI chrome - use semantic colors that respect terminal palette
    pub border: Color,
    pub border_focused: Color,
    pub title: Color,

    // Text - derived from terminal's actual fg/bg
    pub text: Color,
    pub text_dim: Color,
    pub text_highlight: Color,

    // Status - semantic ANSI colors
    pub success: Color,
    pub warning: Color,
    pub error: Color,
    pub info: Color,

    // Sources (for events) - semantic ANSI colors
    pub source_flutter: Color,
    pub source_agent: Color,
    pub source_vm: Color,
    pub source_mcp: Color,
    pub source_tree: Color,
}

impl Theme {
    /// Create theme from detected terminal colors
    pub fn from_terminal(mode: ThemeMode, terminal: TerminalColors) -> Self {
        // Use semantic ANSI colors - these automatically use the terminal's
        // configured palette (e.g., Solarized, Dracula, etc.)
        //
        // For dark themes: bright variants for better visibility
        // For light themes: normal variants for better contrast

        let (text, text_dim, text_highlight) = match mode {
            ThemeMode::Dark => (
                terminal.foreground,
                Color::DarkGray,
                Color::Yellow,
            ),
            ThemeMode::Light => (
                terminal.foreground,
                Color::Gray,
                Color::LightYellow,
            ),
        };

        let (border, border_focused, title) = match mode {
            ThemeMode::Dark => (Color::DarkGray, Color::Cyan, Color::Cyan),
            ThemeMode::Light => (Color::Gray, Color::DarkGray, Color::Blue),
        };

        Self {
            mode,
            terminal,

            border,
            border_focused,
            title,

            text,
            text_dim,
            text_highlight,

            // Status colors - use ANSI semantic colors
            success: Color::Green,
            warning: Color::Yellow,
            error: Color::Red,
            info: Color::Blue,

            // Source colors - use ANSI semantic colors
            source_flutter: Color::Green,
            source_agent: Color::Blue,
            source_vm: Color::Yellow,
            source_mcp: Color::Cyan,
            source_tree: Color::Magenta,
        }
    }

    pub fn dark() -> Self {
        Self::from_terminal(ThemeMode::Dark, TerminalColors::default())
    }

    #[allow(dead_code)]
    pub fn light() -> Self {
        Self::from_terminal(ThemeMode::Light, TerminalColors::default())
    }
}

impl Default for Theme {
    fn default() -> Self {
        Self::dark()
    }
}

/// Detect terminal colors and theme mode
fn detect_terminal() -> (ThemeMode, TerminalColors) {
    let options = QueryOptions::default();

    match color_palette(options) {
        Ok(palette) => {
            // Convert 16-bit RGB to 8-bit for ratatui
            let fg = palette.foreground.scale_to_8bit();
            let bg = palette.background.scale_to_8bit();

            let terminal = TerminalColors {
                foreground: Color::Rgb(fg.0, fg.1, fg.2),
                background: Color::Rgb(bg.0, bg.1, bg.2),
            };

            // Determine light/dark based on background luminance
            // Using perceived luminance formula: 0.299*R + 0.587*G + 0.114*B
            let luminance =
                0.299 * (bg.0 as f32) + 0.587 * (bg.1 as f32) + 0.114 * (bg.2 as f32);
            let mode = if luminance > 128.0 {
                ThemeMode::Light
            } else {
                ThemeMode::Dark
            };

            (mode, terminal)
        }
        Err(_) => {
            // Fallback: check COLORFGBG env var
            let mode = detect_mode_from_env().unwrap_or(ThemeMode::Dark);
            (mode, TerminalColors::default())
        }
    }
}

fn detect_mode_from_env() -> Option<ThemeMode> {
    // COLORFGBG format: "fg;bg" where values are ANSI color indices
    // Common: "15;0" = white on black (dark), "0;15" = black on white (light)
    let colorfgbg = std::env::var("COLORFGBG").ok()?;
    let bg = colorfgbg.split(';').last()?.parse::<u8>().ok()?;

    // ANSI color indices: 0-6, 8 are typically dark; 7, 9-15 are typically light
    Some(if bg == 7 || (9..=15).contains(&bg) {
        ThemeMode::Light
    } else {
        ThemeMode::Dark
    })
}

static THEME: std::sync::OnceLock<Theme> = std::sync::OnceLock::new();

/// Initialize theme with optional forced mode. Call before theme().
pub fn init_theme(forced_mode: Option<ThemeMode>) {
    let _ = THEME.set(match forced_mode {
        Some(mode) => {
            // Even with forced mode, still try to get terminal colors
            let (_, terminal) = detect_terminal();
            Theme::from_terminal(mode, terminal)
        }
        None => {
            let (mode, terminal) = detect_terminal();
            Theme::from_terminal(mode, terminal)
        }
    });
}

pub fn theme() -> &'static Theme {
    THEME.get_or_init(|| {
        let (mode, terminal) = detect_terminal();
        Theme::from_terminal(mode, terminal)
    })
}
