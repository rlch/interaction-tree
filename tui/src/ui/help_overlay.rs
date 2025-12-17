use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame) {
    let area = centered_rect(60, 70, frame.area());

    frame.render_widget(Clear, area);

    let help_sections = vec![
        ("Navigation", vec![
            ("j/k", "scroll down/up"),
            ("g/G", "top/bottom"),
            ("Tab", "switch pane"),
            ("PgUp/PgDn", "page up/down"),
        ]),
        ("Flutter", vec![
            ("r", "hot reload"),
            ("R", "hot restart"),
            ("p", "toggle performance overlay"),
            ("o", "toggle debug paint"),
            ("w", "toggle wireframe"),
        ]),
        ("Modes", vec![
            (":", "command mode"),
            ("/", "filter mode"),
            ("?", "help (this screen)"),
        ]),
        ("Commands", vec![
            (":reload", "hot reload"),
            (":restart", "hot restart"),
            (":stop", "stop app"),
            (":tree", "request widget tree"),
            (":filter <pat>", "filter events"),
            (":clear", "clear events"),
            (":quit", "quit application"),
        ]),
        ("General", vec![
            ("q", "quit"),
            ("Q", "force quit"),
            ("Esc", "cancel/close"),
            ("Ctrl+C", "quit"),
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
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )));

        for (key, desc) in bindings {
            lines.push(Line::from(vec![
                Span::raw("    "),
                Span::styled(
                    format!("{:<14}", key),
                    Style::default().fg(Color::Yellow),
                ),
                Span::styled(desc, Style::default().fg(Color::White)),
            ]));
        }
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "  Press Esc or ? to close",
        Style::default().fg(Color::DarkGray),
    )));

    let block = Block::default()
        .title(" Help ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan));

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
