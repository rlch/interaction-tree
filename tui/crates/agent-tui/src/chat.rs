//! Chat widget for displaying conversation messages.

use agent_protocol::{Message, MessageContent, Role, ToolCall, ToolStatus};
use ratatui::buffer::Buffer;
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Paragraph, Widget, Wrap};

use crate::markdown::render_markdown;

/// Renders a single message.
pub fn render_message(msg: &Message) -> Text<'static> {
    let mut lines = Vec::new();
    
    // Role header
    let (role_label, role_color) = match msg.role {
        Role::User => ("You", Color::Blue),
        Role::Assistant => ("Claude", Color::Green),
    };
    
    lines.push(Line::from(vec![
        Span::styled(
            role_label,
            Style::default().fg(role_color).add_modifier(Modifier::BOLD),
        ),
        Span::raw(" "),
        Span::styled(
            msg.timestamp.format("%H:%M:%S").to_string(),
            Style::default().fg(Color::DarkGray),
        ),
    ]));
    
    // Content
    match &msg.content {
        MessageContent::Text(text) => {
            let rendered = render_markdown(text);
            lines.extend(rendered.lines);
        }
        MessageContent::ToolUse { calls } => {
            for call in calls {
                lines.extend(render_tool_call(call).lines);
            }
        }
    }
    
    // Add blank line after message
    lines.push(Line::default());
    
    Text::from(lines)
}

/// Renders a tool call.
fn render_tool_call(call: &ToolCall) -> Text<'static> {
    let mut lines = Vec::new();
    
    // Status indicator and tool name
    let (status_icon, status_color) = match call.status {
        ToolStatus::Running => ("⟳", Color::Yellow),
        ToolStatus::Success => ("✓", Color::Green),
        ToolStatus::Failed => ("✗", Color::Red),
    };
    
    lines.push(Line::from(vec![
        Span::styled(status_icon, Style::default().fg(status_color)),
        Span::raw(" "),
        Span::styled(
            call.name.clone(),
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        ),
    ]));
    
    // Arguments (collapsed)
    let args_preview = call.args.to_string();
    let preview = if args_preview.len() > 50 {
        format!("{}...", &args_preview[..50])
    } else {
        args_preview
    };
    lines.push(Line::from(vec![
        Span::raw("  "),
        Span::styled(preview, Style::default().fg(Color::DarkGray)),
    ]));
    
    // Output if available
    if let Some(output) = &call.output {
        let output_lines: Vec<&str> = output.lines().take(3).collect();
        for line in output_lines {
            let truncated = if line.len() > 80 {
                format!("{}...", &line[..80])
            } else {
                line.to_string()
            };
            lines.push(Line::from(vec![
                Span::raw("  "),
                Span::styled(truncated, Style::default().fg(Color::Gray)),
            ]));
        }
        if output.lines().count() > 3 {
            lines.push(Line::from(vec![
                Span::raw("  "),
                Span::styled("...", Style::default().fg(Color::DarkGray)),
            ]));
        }
    }
    
    Text::from(lines)
}

/// Chat display widget showing all messages.
pub struct ChatWidget<'a> {
    messages: &'a [Message],
    streaming_text: Option<&'a str>,
    scroll: u16,
}

impl<'a> ChatWidget<'a> {
    pub fn new(messages: &'a [Message]) -> Self {
        Self {
            messages,
            streaming_text: None,
            scroll: 0,
        }
    }
    
    pub fn streaming(mut self, text: Option<&'a str>) -> Self {
        self.streaming_text = text;
        self
    }
    
    pub fn scroll(mut self, scroll: u16) -> Self {
        self.scroll = scroll;
        self
    }
}

impl<'a> Widget for ChatWidget<'a> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        // Collect all rendered text
        let mut all_lines: Vec<Line<'static>> = Vec::new();
        
        for msg in self.messages {
            all_lines.extend(render_message(msg).lines);
        }
        
        // Add streaming text if present
        if let Some(streaming) = self.streaming_text {
            all_lines.push(Line::from(vec![
                Span::styled("Claude", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw(" "),
                Span::styled("...", Style::default().fg(Color::Yellow)),
            ]));
            all_lines.extend(render_markdown(streaming).lines);
        }
        
        let text = Text::from(all_lines);
        
        Paragraph::new(text)
            .wrap(Wrap { trim: false })
            .scroll((self.scroll, 0))
            .render(area, buf);
    }
}
