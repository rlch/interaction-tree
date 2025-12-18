use crate::theme::theme;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame) {
    let t = theme();
    let area = centered_rect(60, 70, frame.area());

    frame.render_widget(Clear, area);

    let help_sections = vec![
        ("Navigation", vec![
            ("j/k, ↑/↓", "scroll down/up"),
            ("h/l, ←/→", "prev/next tab"),
            ("g/G", "top/bottom of logs"),
            ("Tab", "switch pane (content ↔ tree)"),
        ]),
        ("Sessions", vec![
            ("s", "open session picker"),
            ("c", "create new session (in picker)"),
            ("d", "delete session (in picker)"),
        ]),
        ("App Control", vec![
            ("p", "run app (when stopped)"),
            ("x", "stop app (when running)"),
            ("r", "hot reload (when running)"),
            ("R", "hot restart (when running)"),
            ("t", "fetch widget tree (when running)"),
        ]),
        ("Tree Pane", vec![
            ("j/k, ↑/↓", "navigate tree"),
            ("h/l, ←/→", "collapse/expand"),
            ("Enter, Space", "toggle node"),
        ]),
        ("Logs", vec![
            ("/", "filter logs"),
            ("f", "clear filter"),
            ("c", "clear all logs"),
        ]),
        ("General", vec![
            ("?", "toggle help"),
            ("q", "quit (with confirm)"),
            ("Q", "force quit"),
            ("Ctrl+C", "quit"),
            ("Esc", "cancel/close"),
        ]),
    ];

    let mut lines: Vec<Line> = vec![];

    for (section_name, bindings) in help_sections {
        if !lines.is_empty() {
            lines.push(Line::from(""));
        }
        lines.push(Line::from(Span::styled(
            format!("  {}", section_name),
            Style::default()
                .fg(t.title)
                .add_modifier(Modifier::BOLD),
        )));

        for (key, desc) in bindings {
            lines.push(Line::from(vec![
                Span::raw("    "),
                Span::styled(
                    format!("{:<14}", key),
                    Style::default().fg(t.text_highlight),
                ),
                Span::styled(desc, Style::default().fg(t.text)),
            ]));
        }
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "  Press Esc or ? to close",
        Style::default().fg(t.text_dim),
    )));

    let block = Block::default()
        .title(" Help ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.title));

    let paragraph = Paragraph::new(lines).block(block);

    frame.render_widget(paragraph, area);
}

fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}
