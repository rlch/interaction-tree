use crate::app::{App, Mode};
use crate::chat::{ChatContent, ChatMessage, ChatRole, ToolStatus};
use crate::markdown::render_markdown;
use crate::theme::theme;

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    if area.width < 3 || area.height < 3 {
        return;
    }

    // Always show composer at bottom for Agent tab
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(1), Constraint::Length(3)])
        .split(area);
    let (chat_area, composer_area) = (chunks[0], chunks[1]);
    
    render_chat(frame, app, chat_area);
    render_composer(frame, app, composer_area);
}

fn render_chat(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();
    
    // Collect all lines from chat messages
    let mut all_lines: Vec<Line<'static>> = Vec::new();
    
    // Render each chat message
    for msg in &app.session.chat_messages {
        all_lines.extend(render_message(msg));
        all_lines.push(Line::default()); // blank line between messages
    }
    
    // Render streaming content if any
    if let Some(streaming) = &app.session.chat_streaming {
        // Show "Claude ..." header
        all_lines.push(Line::from(vec![
            Span::styled("Claude", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
            Span::raw(" "),
            Span::styled("...", Style::default().fg(Color::Yellow)),
        ]));
        
        // Show streaming text
        if !streaming.text_buffer.is_empty() {
            all_lines.extend(render_markdown(&streaming.text_buffer));
        }
    }
    
    // If no messages yet, show welcome
    if app.session.chat_messages.is_empty() && app.session.chat_streaming.is_none() {
        all_lines.push(Line::from(Span::styled(
            "AI Agent",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )));
        all_lines.push(Line::default());
        all_lines.push(Line::from(Span::styled(
            "Chat with Claude to interact with your Flutter app.",
            Style::default().fg(t.text_dim),
        )));
        all_lines.push(Line::default());
        all_lines.push(Line::from(Span::styled(
            "Examples:",
            Style::default().fg(t.text_dim),
        )));
        all_lines.push(Line::from(Span::styled(
            "  • \"Tap the login button\"",
            Style::default().fg(t.text_dim),
        )));
        all_lines.push(Line::from(Span::styled(
            "  • \"Enter 'test@example.com' in the email field\"",
            Style::default().fg(t.text_dim),
        )));
        all_lines.push(Line::from(Span::styled(
            "  • \"Scroll down and find the settings\"",
            Style::default().fg(t.text_dim),
        )));
        all_lines.push(Line::default());
        all_lines.push(Line::from(vec![
            Span::styled("Press ", Style::default().fg(t.text_dim)),
            Span::styled("Enter", Style::default().fg(t.text_highlight).add_modifier(Modifier::BOLD)),
            Span::styled(" to start typing", Style::default().fg(t.text_dim)),
        ]));
    }
    
    let title = format!(" Agent [{}] ", app.session.chat_messages.len());
    let block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.border));
    
    let inner = block.inner(area);
    frame.render_widget(block, area);
    
    // Calculate scroll - auto-scroll to bottom
    let content_height = all_lines.len() as u16;
    let visible_height = inner.height;
    let scroll = content_height.saturating_sub(visible_height);
    
    let paragraph = Paragraph::new(all_lines)
        .wrap(Wrap { trim: false })
        .scroll((scroll, 0));
    frame.render_widget(paragraph, inner);
}

fn render_composer(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();
    let is_active = matches!(app.mode, Mode::AgentChat);
    
    let border_color = if is_active { Color::Green } else { t.border };
    let block = Block::default()
        .borders(Borders::TOP)
        .border_style(Style::default().fg(border_color));
    
    let inner = block.inner(area);
    frame.render_widget(block, area);
    
    // Prompt and input
    let prompt_color = if is_active { Color::Green } else { t.text_dim };
    let prompt = Span::styled("> ", Style::default().fg(prompt_color).add_modifier(Modifier::BOLD));
    let input_text = if app.session.chat_input.is_empty() {
        let hint = if is_active { "Type a message..." } else { "Press Enter to chat" };
        Span::styled(hint, Style::default().fg(t.text_dim))
    } else {
        Span::styled(&app.session.chat_input, Style::default().fg(t.text))
    };
    
    let line = Line::from(vec![prompt, input_text]);
    frame.render_widget(Paragraph::new(line), inner);
    
    // Show cursor only when active
    if is_active {
        let cursor_x = inner.x + 2 + app.session.chat_cursor as u16;
        let cursor_y = inner.y;
        frame.set_cursor_position((cursor_x.min(inner.right().saturating_sub(1)), cursor_y));
    }
}

fn render_message(msg: &ChatMessage) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    let t = theme();
    
    // Role header with timestamp
    let (role_label, role_color) = match msg.role {
        ChatRole::User => ("You", Color::Blue),
        ChatRole::Assistant => ("Claude", Color::Green),
    };
    
    lines.push(Line::from(vec![
        Span::styled(role_label, Style::default().fg(role_color).add_modifier(Modifier::BOLD)),
        Span::raw(" "),
        Span::styled(
            msg.timestamp.format("%H:%M:%S").to_string(),
            Style::default().fg(t.text_dim),
        ),
    ]));
    
    // Content
    match &msg.content {
        ChatContent::Text(text) => {
            lines.extend(render_markdown(text));
        }
        ChatContent::ToolCall(call) => {
            lines.extend(render_tool_call_lines(call));
        }
    }
    
    lines
}

fn render_tool_call_lines(call: &crate::chat::ToolCall) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    let t = theme();
    
    // Status icon and tool name
    let (icon, icon_color) = match call.status {
        ToolStatus::Running => ("⟳", Color::Yellow),
        ToolStatus::Success => ("✓", Color::Green),
        ToolStatus::Failed => ("✗", Color::Red),
    };
    
    lines.push(Line::from(vec![
        Span::styled(icon, Style::default().fg(icon_color)),
        Span::raw(" "),
        Span::styled(call.name.clone(), Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
    ]));
    
    // Args preview
    let args_str = call.args.to_string();
    let preview = if args_str.len() > 60 {
        format!("{}...", &args_str[..60])
    } else {
        args_str
    };
    lines.push(Line::from(vec![
        Span::raw("  "),
        Span::styled(preview, Style::default().fg(t.text_dim)),
    ]));
    
    // Output preview
    if let Some(output) = &call.output {
        let output_lines: Vec<String> = output.lines().take(3).map(|s| s.to_string()).collect();
        for line in output_lines {
            let truncated = if line.len() > 70 {
                format!("{}...", &line[..70])
            } else {
                line
            };
            lines.push(Line::from(vec![
                Span::raw("  "),
                Span::styled(truncated, Style::default().fg(t.text_dim)),
            ]));
        }
        if output.lines().count() > 3 {
            lines.push(Line::from(vec![
                Span::raw("  "),
                Span::styled("...", Style::default().fg(t.text_dim)),
            ]));
        }
    }
    
    lines
}
