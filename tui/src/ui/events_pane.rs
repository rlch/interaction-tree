use crate::app::App;
use crate::ws::protocol::MonitoringEvent;
use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let events: Vec<&MonitoringEvent> = app.filtered_events().collect();
    let event_count = events.len();

    let inner_height = area.height.saturating_sub(2) as usize; // account for borders
    let visible_start = app.scroll_offset;
    let visible_end = (visible_start + inner_height).min(event_count);

    let lines: Vec<Line> = events
        .iter()
        .skip(visible_start)
        .take(inner_height)
        .map(|e| format_event(e))
        .collect();

    let title = if let Some(ref filter) = app.filter {
        format!(" Events [{}/{}] filter: {} ", visible_end, event_count, filter)
    } else {
        format!(" Events [{}/{}] ", visible_end, event_count)
    };

    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray));

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, area);
}

fn format_event(event: &MonitoringEvent) -> Line<'static> {
    let source_color = match event.source.to_lowercase().as_str() {
        s if s.contains("flutter") => Color::Green,
        s if s.contains("agent") => Color::Blue,
        s if s.contains("vm") => Color::Yellow,
        s if s.contains("mcp") => Color::Cyan,
        _ => Color::White,
    };

    let (icon, icon_color) = match event.event_type.to_lowercase().as_str() {
        "agent_success" => ("✓", Color::Green),
        "agent_needs_context" => ("?", Color::Yellow),
        "agent_error" => ("✗", Color::Red),
        t if t.contains("error") => ("✗", Color::Red),
        t if t.contains("warn") => ("⚠", Color::Yellow),
        t if t.contains("debug") => ("○", Color::DarkGray),
        _ => ("•", Color::White),
    };

    let ts = format_timestamp(&event.ts);
    let payload_summary = format_agent_payload(event).unwrap_or_else(|| summarize_payload(&event.payload));

    Line::from(vec![
        Span::styled(format!("{} ", ts), Style::default().fg(Color::DarkGray)),
        Span::styled(format!("{} ", icon), Style::default().fg(icon_color)),
        Span::styled(
            format!("{:8} ", truncate(&event.source, 8)),
            Style::default().fg(source_color),
        ),
        Span::styled(
            format!("{:12} ", truncate(&event.event_type, 12)),
            Style::default().fg(Color::White),
        ),
        Span::styled(payload_summary, Style::default().fg(Color::DarkGray)),
    ])
}

fn format_agent_payload(event: &MonitoringEvent) -> Option<String> {
    match event.event_type.as_str() {
        "agent_success" => {
            let summary = event.payload.get("summary")?.as_str()?;
            Some(truncate(summary, 60))
        }
        "agent_needs_context" => {
            let question = event.payload.get("question")?.as_str()?;
            Some(format!("Q: {}", truncate(question, 55)))
        }
        "agent_error" => {
            let error = event.payload.get("error")?.as_str()?;
            Some(truncate(error, 60))
        }
        _ => None,
    }
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
