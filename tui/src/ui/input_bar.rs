use crate::app::{App, ConfirmAction, Mode};
use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    // Handle confirm mode specially
    if let Mode::Confirm(action) = &app.mode {
        let prompt = match action {
            ConfirmAction::Quit => "Quit? (y/n)",
        };
        return render_confirm(frame, area, prompt);
    }

    // Show waiting indicator when pending response
    if app.pending_response {
        return render_waiting(frame, area, app.pending_intent.as_deref());
    }

    // Check if we're in answer mode (needs_context flow)
    let in_answer_mode = app.in_answer_mode() && matches!(app.mode, Mode::Normal | Mode::Command | Mode::Input);

    let (prefix, prefix_color, title) = if in_answer_mode {
        ("A>", Color::Magenta, "Answer")
    } else {
        match &app.mode {
            Mode::Normal => (">", Color::Green, "Input"),
            Mode::Command => (":", Color::Yellow, "Command"),
            Mode::Filter => ("/", Color::Cyan, "Filter"),
            Mode::Input => (">", Color::Cyan, "Agent"),
            Mode::Help => (">", Color::DarkGray, "Help"),
            Mode::Confirm(_) => unreachable!(),
        }
    };

    let cursor_style = if matches!(app.mode, Mode::Command | Mode::Filter | Mode::Input) || in_answer_mode {
        Style::default()
            .fg(Color::White)
            .add_modifier(Modifier::RAPID_BLINK)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    // Build lines: question (if any) + input
    let mut lines = Vec::new();

    if let Some(ref question) = app.agent_question {
        if in_answer_mode {
            lines.push(Line::from(vec![Span::styled(
                question.clone(),
                Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC),
            )]));
        }
    }

    lines.push(Line::from(vec![
        Span::styled(format!("{} ", prefix), Style::default().fg(prefix_color)),
        Span::styled(app.input_buffer.clone(), Style::default().fg(Color::White)),
        Span::styled("█", cursor_style),
    ]));

    let block = Block::default()
        .title(format!(" {} ", title))
        .borders(Borders::ALL)
        .border_style(Style::default().fg(if in_answer_mode {
            Color::Magenta
        } else {
            Color::DarkGray
        }));

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, area);

    if matches!(app.mode, Mode::Command | Mode::Filter | Mode::Input) || in_answer_mode {
        let line_offset = if app.agent_question.is_some() && in_answer_mode {
            1
        } else {
            0
        };
        let cursor_x = area.x + 2 + prefix.len() as u16 + app.input_buffer.len() as u16;
        let cursor_y = area.y + 1 + line_offset as u16;
        frame.set_cursor_position((cursor_x, cursor_y));
    }
}

fn render_confirm(frame: &mut Frame, area: Rect, prompt: &str) {
    let line = Line::from(vec![
        Span::styled(
            prompt,
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(" ", Style::default()),
    ]);

    let block = Block::default()
        .title(" Confirm ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Yellow));

    let paragraph = Paragraph::new(line).block(block);
    frame.render_widget(paragraph, area);
}

fn render_waiting(frame: &mut Frame, area: Rect, intent: Option<&str>) {
    let text = if let Some(i) = intent {
        format!("⏳ Waiting for agent... ({})", truncate(i, 40))
    } else {
        "⏳ Waiting for agent response...".to_string()
    };

    let line = Line::from(vec![Span::styled(
        text,
        Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::ITALIC),
    )]);

    let block = Block::default()
        .title(" Agent ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Yellow));

    let paragraph = Paragraph::new(line).block(block);
    frame.render_widget(paragraph, area);
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s.chars().take(max - 1).collect::<String>())
    }
}
