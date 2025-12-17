use crate::app::App;
use crate::theme::theme;
use crate::ws::protocol::MonitoringEvent;
use ratatui::{
    layout::Rect,
    style::Style,
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();
    let interactions: Vec<&MonitoringEvent> = app.filtered_interactions().collect();
    let interaction_count = interactions.len();

    let inner_height = area.height.saturating_sub(2) as usize;
    let visible_start = app.scroll_offset;
    let visible_end = (visible_start + inner_height).min(interaction_count);

    let lines: Vec<Line> = interactions
        .iter()
        .skip(visible_start)
        .take(inner_height)
        .map(|e| format_interaction(e))
        .collect();

    let title = if let Some(ref filter) = app.filter {
        format!(
            " Interactions [{}/{}] filter: {} ",
            visible_end, interaction_count, filter
        )
    } else {
        format!(" Interactions [{}] ", interaction_count)
    };

    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.border));

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, area);
}

fn format_interaction(event: &MonitoringEvent) -> Line<'static> {
    let t = theme();

    let (icon, icon_color) = match event.event_type.to_lowercase().as_str() {
        t_str if t_str.contains("tap") => ("👆", t.info),
        t_str if t_str.contains("scroll") => ("↕", t.info),
        t_str if t_str.contains("tree") => ("🌲", t.source_tree),
        t_str if t_str.contains("update") => ("↻", t.text),
        t_str if t_str.contains("error") => ("✗", t.error),
        _ => ("•", t.text),
    };

    let ts = format_timestamp(&event.ts);
    let payload_summary = summarize_payload(&event.payload);

    Line::from(vec![
        Span::styled(format!("{} ", ts), Style::default().fg(t.text_dim)),
        Span::styled(format!("{} ", icon), Style::default().fg(icon_color)),
        Span::styled(
            format!("{:8} ", truncate(&event.source, 8)),
            Style::default().fg(t.source_tree),
        ),
        Span::styled(
            format!("{:16} ", truncate(&event.event_type, 16)),
            Style::default().fg(t.text),
        ),
        Span::styled(payload_summary, Style::default().fg(t.text_dim)),
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

fn summarize_payload(payload: &serde_json::Value) -> String {
    match payload {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(s) => truncate(s, 50),
        serde_json::Value::Object(map) => {
            if let Some(widget_id) = map.get("widgetId").and_then(|v| v.as_str()) {
                return format!("widget: {}", truncate(widget_id, 40));
            }
            if let Some(key) = map.get("key").and_then(|v| v.as_str()) {
                return format!("key: {}", truncate(key, 40));
            }
            let keys: Vec<&str> = map.keys().map(|k| k.as_str()).take(3).collect();
            if keys.is_empty() {
                "{}".to_string()
            } else {
                format!("{{{}}}", keys.join(", "))
            }
        }
        serde_json::Value::Array(arr) => format!("[{} items]", arr.len()),
        other => truncate(&other.to_string(), 50),
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s.chars().take(max - 1).collect::<String>())
    }
}
