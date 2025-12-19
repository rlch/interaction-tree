use crate::app::{App, LogViewMode};
use crate::flutter_log::FlutterLogEntry;
use crate::theme::theme;
use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::Style,
    widgets::{Block, Borders, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState, Wrap},
    Frame,
};
use unicode_width::UnicodeWidthStr;

/// Calculate how many visual lines a log entry will take when wrapped
fn wrapped_height(entry: &FlutterLogEntry, width: usize) -> usize {
    if width == 0 {
        return 1;
    }
    let text = entry.to_plain_text();
    let text_width = UnicodeWidthStr::width(text.as_str());
    ((text_width + width - 1) / width).max(1)
}

pub fn render(frame: &mut Frame, app: &mut App, area: Rect) {
    // Guard against zero-size areas
    if area.width < 3 || area.height < 3 {
        return;
    }

    let t = theme();

    // Calculate inner dimensions (excluding borders)
    let inner_height = area.height.saturating_sub(2) as usize;

    // Update app's viewport height for navigation
    app.log_viewport_height = inner_height;

    // Get log count first (need to borrow app mutably before immutably)
    let log_count = app.filtered_flutter_logs().count();

    // Clamp cursor to valid range
    app.log_view.clamp_cursor(log_count);

    let visible_start = app.log_view.scroll;
    let cursor = app.log_view.cursor;
    let mode = app.log_view.mode;
    let selection_range = app.log_view.selection_range();

    // Now collect logs for rendering
    let logs: Vec<&FlutterLogEntry> = app.filtered_flutter_logs().collect();

    // Helper to check if line is selected
    let is_selected = |idx: usize| -> bool {
        if mode != LogViewMode::Visual {
            return false;
        }
        if let Some((start, end)) = selection_range {
            idx >= start && idx <= end
        } else {
            false
        }
    };

    // Build title with mode indicator
    let mode_indicator = match mode {
        LogViewMode::Normal => "",
        LogViewMode::Visual => " VISUAL ",
    };

    let title = if let Some(ref filter) = app.filter {
        format!(
            " Flutter [{}/{}]{} filter: {} ",
            cursor + 1,
            log_count,
            mode_indicator,
            filter
        )
    } else {
        format!(" Flutter [{}/{}]{} ", cursor + 1, log_count, mode_indicator)
    };

    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.border));

    // Split area for content and scrollbar
    let chunks = Layout::horizontal([Constraint::Min(1), Constraint::Length(1)])
        .split(block.inner(area));

    frame.render_widget(block, area);

    let content_area = chunks[0];
    let content_width = content_area.width as usize;

    // Render each log entry with wrapping support
    let mut current_y = content_area.y;
    let max_y = content_area.y + content_area.height;

    for (idx, entry) in logs.iter().enumerate().skip(visible_start) {
        if current_y >= max_y {
            break;
        }

        let entry_height = wrapped_height(entry, content_width);
        let available_height = (max_y - current_y) as usize;
        let render_height = entry_height.min(available_height);

        let line_area = Rect {
            x: content_area.x,
            y: current_y,
            width: content_area.width,
            height: render_height as u16,
        };

        let is_cursor_line = idx == cursor;
        let is_selected_line = is_selected(idx);

        // Determine background color
        let bg_style = if is_cursor_line {
            if mode == LogViewMode::Visual && is_selected_line {
                Some(Style::default().bg(t.selection_bg))
            } else {
                Some(Style::default().bg(t.cursor_bg))
            }
        } else if is_selected_line {
            Some(Style::default().bg(t.selection_bg))
        } else {
            None
        };

        // Fill full area with background first if highlighted
        if let Some(style) = bg_style {
            let buf = frame.buffer_mut();
            for y in line_area.y..line_area.y + line_area.height {
                for x in line_area.x..line_area.x + line_area.width {
                    buf[(x, y)].set_style(style);
                }
            }
        }

        // Render the line content with wrapping
        let line = entry.to_line();
        let paragraph = Paragraph::new(line).wrap(Wrap { trim: false });
        frame.render_widget(paragraph, line_area);

        current_y += render_height as u16;
    }

    // Render scrollbar
    if log_count > 0 {
        let mut scrollbar_state = ScrollbarState::new(log_count).position(cursor);

        let scrollbar = Scrollbar::new(ScrollbarOrientation::VerticalRight)
            .begin_symbol(Some("▲"))
            .end_symbol(Some("▼"))
            .track_symbol(Some("│"))
            .thumb_symbol("█");

        frame.render_stateful_widget(scrollbar, chunks[1], &mut scrollbar_state);
    }
}
