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
    let agent_events: Vec<&MonitoringEvent> = app.filtered_agent_events().collect();
    let event_count = agent_events.len();

    let inner_height = area.height.saturating_sub(2) as usize;
    let visible_start = app.scroll_offset;
    let visible_end = (visible_start + inner_height).min(event_count);

    let lines: Vec<Line> = agent_events
        .iter()
        .skip(visible_start)
        .take(inner_height)
        .map(|e| format_agent_event(e))
        .collect();

    let title = if let Some(ref filter) = app.filter {
        format!(" Agent [{}/{}] filter: {} ", visible_end, event_count, filter)
    } else {
        format!(" Agent [{}] ", event_count)
    };

    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.border));

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, area);
}

fn format_agent_event(event: &MonitoringEvent) -> Line<'static> {
    let t = theme();

    let (icon, icon_color, message) = match event.event_type.to_lowercase().as_str() {
        "agent_success" => {
            let summary = event
                .payload
                .get("summary")
                .and_then(|v| v.as_str())
                .map(|s| truncate(s, 60))
                .unwrap_or_default();
            ("✓", t.success, summary)
        }
        "agent_needs_context" => {
            let question = event
                .payload
                .get("question")
                .and_then(|v| v.as_str())
                .map(|s| format!("Q: {}", truncate(s, 55)))
                .unwrap_or_default();
            ("?", t.warning, question)
        }
        "agent_error" => {
            let error = event
                .payload
                .get("error")
                .and_then(|v| v.as_str())
                .map(|s| truncate(s, 60))
                .unwrap_or_default();
            ("✗", t.error, error)
        }
        t_str if t_str.contains("tool_call") => {
            let tool_name = event
                .payload
                .get("tool")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let args_preview = event
                .payload
                .get("args")
                .map(|v| summarize_value(v, 40))
                .unwrap_or_default();
            ("⚙", t.info, format!("{} {}", tool_name, args_preview))
        }
        t_str if t_str.contains("tool_result") => {
            let result_preview = summarize_value(&event.payload, 50);
            ("→", t.text_dim, result_preview)
        }
        _ => {
            let summary = summarize_payload(&event.payload);
            ("•", t.text, summary)
        }
    };

    let ts = format_timestamp(&event.ts);

    Line::from(vec![
        Span::styled(format!("{} ", ts), Style::default().fg(t.text_dim)),
        Span::styled(format!("{} ", icon), Style::default().fg(icon_color)),
        Span::styled(
            format!("{:8} ", truncate(&event.source, 8)),
            Style::default().fg(t.source_agent),
        ),
        Span::styled(
            format!("{:16} ", truncate(&event.event_type, 16)),
            Style::default().fg(t.text),
        ),
        Span::styled(message, Style::default().fg(t.text_dim)),
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

fn summarize_value(value: &serde_json::Value, max_len: usize) -> String {
    match value {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(s) => truncate(s, max_len),
        serde_json::Value::Object(map) => {
            let keys: Vec<&str> = map.keys().map(|k| k.as_str()).take(3).collect();
            if keys.is_empty() {
                "{}".to_string()
            } else {
                truncate(&format!("{{{}}}", keys.join(", ")), max_len)
            }
        }
        serde_json::Value::Array(arr) => format!("[{} items]", arr.len()),
        other => truncate(&other.to_string(), max_len),
    }
}

fn summarize_payload(payload: &serde_json::Value) -> String {
    summarize_value(payload, 50)
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s.chars().take(max - 1).collect::<String>())
    }
}
