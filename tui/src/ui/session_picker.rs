use crate::app::{App, InputPromptKind, Mode};
use crate::theme::theme;
use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App) {
    // Dispatch to appropriate renderer based on mode
    match &app.mode {
        Mode::InputPrompt(InputPromptKind::RunApp) => render_run_app_prompt(frame, app),
        Mode::InputPrompt(InputPromptKind::CreateSession) => render_create_session_prompt(frame, app),
        Mode::SessionPicker => render_session_picker(frame, app),
        _ => {}
    }
}

fn render_run_app_prompt(frame: &mut Frame, app: &App) {
    let t = theme();
    let frame_area = frame.area();

    // Guard against tiny terminal
    if frame_area.width < 20 || frame_area.height < 8 {
        return;
    }

    let area = centered_rect(60, 20, frame_area);
    if area.width < 10 || area.height < 6 {
        return;
    }

    frame.render_widget(Clear, area);

    let block = Block::default()
        .title(" Run App ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.title));

    let inner = block.inner(area);
    if inner.width == 0 || inner.height < 3 {
        frame.render_widget(block, area);
        return;
    }
    frame.render_widget(block, area);

    // Split inner area for prompt and input
    let chunks = Layout::vertical([
        Constraint::Length(2),
        Constraint::Length(1),
        Constraint::Length(1),
    ])
    .split(inner);

    // Prompt text - truncate to fit
    let prompt_text = truncate_str("Device (optional): e.g. macOS, chrome", inner.width as usize);
    let prompt = Paragraph::new(prompt_text).style(Style::default().fg(t.text_dim));
    frame.render_widget(prompt, chunks[0]);

    // Input field - truncate input buffer to fit
    let available_input_width = inner.width.saturating_sub(3) as usize; // "> " + cursor
    let display_input = truncate_str(&app.input_buffer, available_input_width);
    let input = Paragraph::new(Line::from(vec![
        Span::styled("> ", Style::default().fg(t.title)),
        Span::styled(display_input, Style::default().fg(t.text)),
        Span::styled("█", Style::default().fg(t.text)),
    ]));
    frame.render_widget(input, chunks[1]);

    // Hint - truncate to fit
    let hint_text = truncate_str("Enter=run, Esc=cancel", inner.width as usize);
    let hint = Paragraph::new(hint_text).style(Style::default().fg(t.text_dim));
    frame.render_widget(hint, chunks[2]);
}

fn render_create_session_prompt(frame: &mut Frame, app: &App) {
    let t = theme();
    let frame_area = frame.area();

    // Guard against tiny terminal
    if frame_area.width < 20 || frame_area.height < 6 {
        return;
    }

    let area = centered_rect(60, 20, frame_area);
    if area.width < 10 || area.height < 4 {
        return;
    }

    frame.render_widget(Clear, area);

    let block = Block::default()
        .title(" Create Session ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.title));

    let inner = block.inner(area);
    if inner.width == 0 || inner.height < 2 {
        frame.render_widget(block, area);
        return;
    }
    frame.render_widget(block, area);

    let chunks = Layout::vertical([
        Constraint::Length(1),
        Constraint::Length(1),
    ])
    .split(inner);

    let prompt = Paragraph::new(Span::styled("Session name:", Style::default().fg(t.text_dim)));
    frame.render_widget(prompt, chunks[0]);

    // Truncate input buffer to fit
    let available_input_width = inner.width.saturating_sub(3) as usize; // "> " + cursor
    let display_input = truncate_str(&app.input_buffer, available_input_width);
    let input = Paragraph::new(Line::from(vec![
        Span::styled("> ", Style::default().fg(t.title)),
        Span::styled(display_input, Style::default().fg(t.text)),
        Span::styled("█", Style::default().fg(t.text)),
    ]));
    frame.render_widget(input, chunks[1]);
}

fn render_session_picker(frame: &mut Frame, app: &App) {
    let t = theme();
    let frame_area = frame.area();

    // Guard against tiny terminal
    if frame_area.width < 20 || frame_area.height < 6 {
        return;
    }

    let area = centered_rect(60, 50, frame_area);
    if area.width < 10 || area.height < 3 {
        return;
    }

    frame.render_widget(Clear, area);

    let block = Block::default()
        .title(" Select Session ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.title));

    if app.sessions.is_empty() {
        let msg = Paragraph::new("No sessions available")
            .style(Style::default().fg(t.text_dim))
            .block(block);
        frame.render_widget(msg, area);
        return;
    }

    // Calculate available width for session names
    let inner_width = area.width.saturating_sub(2) as usize; // borders
    let max_name_width = inner_width.saturating_sub(15); // prefix + status suffix

    let items: Vec<ListItem> = app
        .sessions
        .iter()
        .enumerate()
        .map(|(i, session)| {
            let is_selected = i == app.session_picker_index;
            let prefix = if is_selected { "▸ " } else { "  " };

            let status_color = match session.app_status.as_str() {
                "running" => t.success,
                "starting" => t.warning,
                "stopped" | "not_running" => t.text_dim,
                "error" => t.error,
                _ => t.text_dim,
            };

            let display_name = truncate_str(&session.name, max_name_width);
            let line = Line::from(vec![
                Span::styled(prefix, Style::default().fg(t.text)),
                Span::styled(
                    display_name,
                    Style::default()
                        .fg(t.text)
                        .add_modifier(if is_selected {
                            Modifier::BOLD
                        } else {
                            Modifier::empty()
                        }),
                ),
                Span::styled(" (", Style::default().fg(t.text_dim)),
                Span::styled(&session.app_status, Style::default().fg(status_color)),
                Span::styled(")", Style::default().fg(t.text_dim)),
            ]);

            let style = if is_selected {
                Style::default().bg(t.border)
            } else {
                Style::default()
            };

            ListItem::new(line).style(style)
        })
        .collect();

    let list = List::new(items).block(block);
    frame.render_widget(list, area);
}

fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::vertical([
        Constraint::Percentage((100 - percent_y) / 2),
        Constraint::Percentage(percent_y),
        Constraint::Percentage((100 - percent_y) / 2),
    ])
    .split(r);

    Layout::horizontal([
        Constraint::Percentage((100 - percent_x) / 2),
        Constraint::Percentage(percent_x),
        Constraint::Percentage((100 - percent_x) / 2),
    ])
    .split(popup_layout[1])[1]
}

fn truncate_str(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else if max > 1 {
        format!("{}…", &s.chars().take(max - 1).collect::<String>())
    } else {
        String::new()
    }
}
