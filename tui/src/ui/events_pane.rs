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
        .border_style(Style::default().fg(t.border));

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, area);
}

fn format_event(event: &MonitoringEvent) -> Line<'static> {
    let t = theme();

    let source_color = match event.source.to_lowercase().as_str() {
        s if s.contains("flutter") => t.source_flutter,
        s if s.contains("agent") => t.source_agent,
        s if s.contains("vm") => t.source_vm,
        s if s.contains("mcp") => t.source_mcp,
        _ => t.text,
    };

    let (icon, icon_color) = match event.event_type.to_lowercase().as_str() {
        "agent_success" => ("✓", t.success),
        "agent_needs_context" => ("?", t.warning),
        "agent_error" => ("✗", t.error),
        t_str if t_str.contains("error") => ("✗", t.error),
        t_str if t_str.contains("warn") => ("⚠", t.warning),
        t_str if t_str.contains("debug") => ("○", t.text_dim),
        _ => ("•", t.text),
    };

    let ts = format_timestamp(&event.ts);
    let payload_summary = format_agent_payload(event).unwrap_or_else(|| summarize_payload(&event.payload));

    Line::from(vec![
        Span::styled(format!("{} ", ts), Style::default().fg(t.text_dim)),
        Span::styled(format!("{} ", icon), Style::default().fg(icon_color)),
        Span::styled(
            format!("{:8} ", truncate(&event.source, 8)),
            Style::default().fg(source_color),
        ),
        Span::styled(
            format!("{:12} ", truncate(&event.event_type, 12)),
            Style::default().fg(t.text),
        ),
        Span::styled(payload_summary, Style::default().fg(t.text_dim)),
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
