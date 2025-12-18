use crate::app::App;
use crate::flutter_log::FlutterLogEntry;
use crate::theme::theme;
use ratatui::{
    layout::Rect,
    style::Style,
    text::Line,
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();
    let logs: Vec<&FlutterLogEntry> = app.filtered_flutter_logs().collect();
    let log_count = logs.len();

    let inner_height = area.height.saturating_sub(2) as usize;
    let visible_start = app.scroll_offset;
    let visible_end = (visible_start + inner_height).min(log_count);

    let lines: Vec<Line> = logs
        .iter()
        .skip(visible_start)
        .take(inner_height)
        .map(|e| e.to_line())
        .collect();

    let title = if let Some(ref filter) = app.filter {
        format!(" Flutter [{}/{}] filter: {} ", visible_end, log_count, filter)
    } else {
        format!(" Flutter [{}] ", log_count)
    };

    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.border));

    let paragraph = Paragraph::new(lines)
        .block(block)
        .wrap(Wrap { trim: false });
    frame.render_widget(paragraph, area);
}
