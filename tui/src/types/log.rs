//! Log types for log viewing and entries

/// Log viewer mode (vim-like)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LogViewMode {
    /// Normal mode - cursor navigation, no selection
    #[default]
    Normal,
    /// Visual line mode (V) - selecting contiguous lines
    Visual,
}

/// State for vim-like log viewing with cursor and selection
#[derive(Debug, Clone, Default)]
pub struct LogViewState {
    /// Current cursor line (0-indexed)
    pub cursor: usize,
    /// Viewport offset (first visible line)
    pub scroll: usize,
    /// Visual mode anchor (line where selection started)
    pub anchor: Option<usize>,
    /// Current mode
    pub mode: LogViewMode,
}

impl LogViewState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Get the selection range (start, end) inclusive, sorted
    pub fn selection_range(&self) -> Option<(usize, usize)> {
        self.anchor.map(|anchor| {
            let start = anchor.min(self.cursor);
            let end = anchor.max(self.cursor);
            (start, end)
        })
    }

    /// Check if a line is selected
    pub fn is_selected(&self, line: usize) -> bool {
        match self.mode {
            LogViewMode::Normal => false,
            LogViewMode::Visual => {
                if let Some((start, end)) = self.selection_range() {
                    line >= start && line <= end
                } else {
                    false
                }
            }
        }
    }

    /// Move cursor up, adjusting scroll if needed
    pub fn cursor_up(&mut self, viewport_height: usize) {
        if self.cursor > 0 {
            self.cursor -= 1;
            self.ensure_cursor_visible(viewport_height);
        }
    }

    /// Move cursor down, adjusting scroll if needed
    pub fn cursor_down(&mut self, total_lines: usize, viewport_height: usize) {
        if total_lines > 0 && self.cursor < total_lines - 1 {
            self.cursor += 1;
            self.ensure_cursor_visible(viewport_height);
        }
    }

    /// Jump to first line
    pub fn cursor_top(&mut self) {
        self.cursor = 0;
        self.scroll = 0;
    }

    /// Jump to last line
    pub fn cursor_bottom(&mut self, total_lines: usize, viewport_height: usize) {
        if total_lines > 0 {
            self.cursor = total_lines - 1;
            self.ensure_cursor_visible(viewport_height);
        }
    }

    /// Enter visual mode at current cursor
    pub fn enter_visual(&mut self) {
        self.mode = LogViewMode::Visual;
        self.anchor = Some(self.cursor);
    }

    /// Exit visual mode
    pub fn exit_visual(&mut self) {
        self.mode = LogViewMode::Normal;
        self.anchor = None;
    }

    /// Toggle visual mode
    pub fn toggle_visual(&mut self) {
        match self.mode {
            LogViewMode::Normal => self.enter_visual(),
            LogViewMode::Visual => self.exit_visual(),
        }
    }

    /// Ensure cursor is visible in viewport
    pub fn ensure_cursor_visible(&mut self, viewport_height: usize) {
        if viewport_height == 0 {
            return;
        }
        // Scroll up if cursor is above viewport
        if self.cursor < self.scroll {
            self.scroll = self.cursor;
        }
        // Scroll down if cursor is below viewport
        if self.cursor >= self.scroll + viewport_height {
            self.scroll = self.cursor - viewport_height + 1;
        }
    }

    /// Clamp cursor to valid range after log count changes
    pub fn clamp_cursor(&mut self, total_lines: usize) {
        if total_lines == 0 {
            self.cursor = 0;
            self.scroll = 0;
        } else {
            if self.cursor >= total_lines {
                self.cursor = total_lines - 1;
            }
            // Ensure scroll doesn't exceed max valid position
            let max_scroll = total_lines.saturating_sub(1);
            if self.scroll > max_scroll {
                self.scroll = max_scroll;
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct LogEntry {
    pub ts: String,
    pub level: LogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}
