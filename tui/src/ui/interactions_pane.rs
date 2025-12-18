use ansi_to_tui::IntoText;

use crate::app::{App, LogEntry, LogLevel};
use crate::theme::theme;
use ratatui::{
    layout::Rect,
    style::Style,
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    // Guard against zero-size areas
    if area.width < 3 || area.height < 3 {
        return;
    }

    let t = theme();
    let logs: Vec<&LogEntry> = app.filtered_interaction_logs().collect();
    let log_count = logs.len();

    let inner_height = area.height.saturating_sub(2) as usize;
    let visible_start = app.scroll_offset;
    let visible_end = (visible_start + inner_height).min(log_count);

    let lines: Vec<Line> = logs
        .iter()
        .skip(visible_start)
        .take(inner_height)
        .map(|e| format_log_entry(e))
        .collect();

    let title = if let Some(ref filter) = app.filter {
        format!(" Interactions [{}/{}] filter: {} ", visible_end, log_count, filter)
    } else if log_count == 0 {
        " Interactions (none yet) ".to_string()
    } else {
        format!(" Interactions [{}] ", log_count)
    };

    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.border));

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, area);
}

fn format_log_entry(entry: &LogEntry) -> Line<'static> {
    let t = theme();

    let (level_icon, level_color) = match entry.level {
        LogLevel::Debug => ("○", t.text_dim),
        LogLevel::Info => ("▶", t.success),
        LogLevel::Warning => ("⚠", t.warning),
        LogLevel::Error => ("✗", t.error),
    };

    let ts = format_timestamp(&entry.ts);

    let prefix_spans = vec![
        Span::styled(format!("{} ", ts), Style::default().fg(t.text_dim)),
        Span::styled(format!("{} ", level_icon), Style::default().fg(level_color)),
    ];

    let message_text: Text<'static> = entry
        .message
        .as_bytes()
        .into_text()
        .unwrap_or_else(|_| Text::raw(entry.message.clone()));

    let mut all_spans = prefix_spans;
    for line in message_text.lines {
        all_spans.extend(line.spans.into_iter().map(|s| s.into()));
    }

    Line::from(all_spans)
}

fn format_timestamp(ts: &str) -> String {
    if let Some(time_part) = ts.split('T').nth(1) {
        let time = time_part.trim_end_matches('Z');
        if time.len() >= 8 {
            return time[..8].to_string();
        }
    }
    ts.chars().take(8).collect()
}
