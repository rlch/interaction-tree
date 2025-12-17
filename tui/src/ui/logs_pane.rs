use crate::app::{App, LogEntry, LogLevel};
use crate::theme::theme;
use ratatui::{
    layout::Rect,
    style::Style,
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();
    let logs: Vec<&LogEntry> = app.filtered_logs().collect();
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
        format!(" Logs [{}/{}] filter: {} ", visible_end, log_count, filter)
    } else {
        format!(" Logs [{}] ", log_count)
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

    if let Some(ref ansi_spans) = entry.ansi_spans {
        let spans: Vec<Span> = ansi_spans
            .iter()
            .map(|s| {
                let mut style = Style::default();
                if let Some(fg) = s.fg {
                    style = style.fg(fg);
                }
                if let Some(bg) = s.bg {
                    style = style.bg(bg);
                }
                if s.bold {
                    style = style.add_modifier(ratatui::style::Modifier::BOLD);
                }
                if s.italic {
                    style = style.add_modifier(ratatui::style::Modifier::ITALIC);
                }
                if s.underline {
                    style = style.add_modifier(ratatui::style::Modifier::UNDERLINED);
                }
                Span::styled(s.text.clone(), style)
            })
            .collect();
        return Line::from(spans);
    }

    let (level_icon, level_color) = match entry.level {
        LogLevel::Debug => ("○", t.text_dim),
        LogLevel::Info => ("•", t.text),
        LogLevel::Warning => ("⚠", t.warning),
        LogLevel::Error => ("✗", t.error),
    };

    let ts = format_timestamp(&entry.ts);

    Line::from(vec![
        Span::styled(format!("{} ", ts), Style::default().fg(t.text_dim)),
        Span::styled(format!("{} ", level_icon), Style::default().fg(level_color)),
        Span::styled(entry.message.clone(), Style::default().fg(t.text)),
    ])
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
