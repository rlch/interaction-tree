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
    let area = centered_rect(60, 20, frame.area());
    frame.render_widget(Clear, area);

    let block = Block::default()
        .title(" Run App ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.title));

    let inner = block.inner(area);
    frame.render_widget(block, area);

    // Split inner area for prompt and input
    let chunks = Layout::vertical([
        Constraint::Length(2),
        Constraint::Length(1),
        Constraint::Length(1),
    ])
    .split(inner);

    // Prompt text
    let prompt = Paragraph::new(Line::from(vec![
        Span::styled("Device (optional): ", Style::default().fg(t.text_dim)),
        Span::styled("e.g. macOS, chrome, or device ID", Style::default().fg(t.text_dim)),
    ]));
    frame.render_widget(prompt, chunks[0]);

    // Input field
    let input = Paragraph::new(Line::from(vec![
        Span::styled("> ", Style::default().fg(t.title)),
        Span::styled(&app.input_buffer, Style::default().fg(t.text)),
        Span::styled("█", Style::default().fg(t.text)),
    ]));
    frame.render_widget(input, chunks[1]);

    // Hint
    let hint = Paragraph::new(Span::styled(
        "Press Enter to run with default device, or type device name",
        Style::default().fg(t.text_dim),
    ));
    frame.render_widget(hint, chunks[2]);
}

fn render_create_session_prompt(frame: &mut Frame, app: &App) {
    let t = theme();
    let area = centered_rect(60, 20, frame.area());
    frame.render_widget(Clear, area);

    let block = Block::default()
        .title(" Create Session ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.title));

    let inner = block.inner(area);
    frame.render_widget(block, area);

    let chunks = Layout::vertical([
        Constraint::Length(1),
        Constraint::Length(1),
    ])
    .split(inner);

    let prompt = Paragraph::new(Span::styled("Session name:", Style::default().fg(t.text_dim)));
    frame.render_widget(prompt, chunks[0]);

    let input = Paragraph::new(Line::from(vec![
        Span::styled("> ", Style::default().fg(t.title)),
        Span::styled(&app.input_buffer, Style::default().fg(t.text)),
        Span::styled("█", Style::default().fg(t.text)),
    ]));
    frame.render_widget(input, chunks[1]);
}

fn render_session_picker(frame: &mut Frame, app: &App) {
    let t = theme();

    let area = centered_rect(60, 50, frame.area());

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

            let line = Line::from(vec![
                Span::styled(prefix, Style::default().fg(t.text)),
                Span::styled(
                    &session.name,
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
