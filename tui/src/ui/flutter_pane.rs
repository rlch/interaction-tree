use crate::app::{App, LogViewMode};
use crate::flutter_log::FlutterLogEntry;
use crate::theme::theme;
use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::Style,
    widgets::{Block, Borders, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState},
    Frame,
};

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

    // Render each line manually with full-width background for highlighted lines
    for (row, (idx, entry)) in logs
        .iter()
        .enumerate()
        .skip(visible_start)
        .take(inner_height)
        .enumerate()
    {
        let line_area = Rect {
            x: content_area.x,
            y: content_area.y + row as u16,
            width: content_area.width,
            height: 1,
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

        // Fill full line with background first if highlighted
        if let Some(style) = bg_style {
            let buf = frame.buffer_mut();
            for x in line_area.x..line_area.x + line_area.width {
                buf[(x, line_area.y)].set_style(style);
            }
        }

        // Render the line content on top
        let line = entry.to_line();
        frame.render_widget(Paragraph::new(line), line_area);
    }

    // Render scrollbar
    if log_count > inner_height {
        let mut scrollbar_state = ScrollbarState::new(log_count).position(cursor);

        let scrollbar = Scrollbar::new(ScrollbarOrientation::VerticalRight)
            .begin_symbol(Some("▲"))
            .end_symbol(Some("▼"))
            .track_symbol(Some("│"))
            .thumb_symbol("█");

        frame.render_stateful_widget(scrollbar, chunks[1], &mut scrollbar_state);
    }
}
