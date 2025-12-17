use crate::app::{App, ConfirmAction, InputPromptKind, Mode};
use crate::theme::theme;
use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};
use throbber_widgets_tui::ThrobberState;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    // Handle confirm mode specially
    if let Mode::Confirm(action) = &app.mode {
        let prompt = match action {
            ConfirmAction::Quit => "Quit? (y/n)",
        };
        return render_confirm(frame, area, prompt);
    }

    // Handle input prompt mode
    if let Mode::InputPrompt(kind) = &app.mode {
        return render_input_prompt(frame, app, area, kind);
    }

    // Show waiting indicator when pending response
    if app.pending_response {
        return render_waiting(frame, app, area);
    }

    // Check if we're in answer mode (needs_context flow)
    let in_answer_mode =
        app.in_answer_mode() && matches!(app.mode, Mode::Normal | Mode::Input);

    // For Input mode, use textarea; for others, use simple input_buffer
    if matches!(app.mode, Mode::Input) && !in_answer_mode {
        render_textarea(frame, app, area);
    } else {
        render_simple_input(frame, app, area, in_answer_mode);
    }
}

fn render_textarea(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();

    let block = Block::default()
        .title(" Agent ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.info));

    // Clone textarea for rendering
    let mut textarea = app.textarea.clone();
    textarea.set_block(block);
    textarea.set_cursor_style(
        Style::default()
            .fg(t.text)
            .add_modifier(Modifier::RAPID_BLINK),
    );
    textarea.set_style(Style::default().fg(t.text));

    frame.render_widget(&textarea, area);
}

fn render_simple_input(frame: &mut Frame, app: &App, area: Rect, in_answer_mode: bool) {
    let t = theme();

    let (prefix, prefix_color, title) = if in_answer_mode {
        ("A>", t.source_tree, "Answer")
    } else {
        match &app.mode {
            Mode::Normal => (">", t.success, "Input"),
            Mode::Filter => ("/", t.info, "Filter"),
            Mode::Input => (">", t.info, "Agent"),
            Mode::Help => (">", t.text_dim, "Help"),
            Mode::SessionPicker => (">", t.text_dim, "Session"),
            Mode::Confirm(_) | Mode::InputPrompt(_) => unreachable!(),
        }
    };



    // Build lines: question (if any) + input
    let mut lines = Vec::new();

    if let Some(ref question) = app.agent_question {
        if in_answer_mode {
            lines.push(Line::from(vec![Span::styled(
                question.clone(),
                Style::default()
                    .fg(t.text_dim)
                    .add_modifier(Modifier::ITALIC),
            )]));
        }
    }

    let input_spans = vec![
        Span::styled(format!("{} ", prefix), Style::default().fg(prefix_color)),
        Span::styled(app.input_buffer.clone(), Style::default().fg(t.text)),
    ];


    lines.push(Line::from(input_spans));

    let border_color = if in_answer_mode { t.source_tree } else { t.border };

    let block = Block::default()
        .title(format!(" {} ", title))
        .borders(Borders::ALL)
        .border_style(Style::default().fg(border_color));

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, area);

    if matches!(app.mode, Mode::Filter | Mode::Input) || in_answer_mode {
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
    let t = theme();

    let line = Line::from(vec![
        Span::styled(
            prompt,
            Style::default()
                .fg(t.warning)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(" ", Style::default()),
    ]);

    let block = Block::default()
        .title(" Confirm ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.warning));

    let paragraph = Paragraph::new(line).block(block);
    frame.render_widget(paragraph, area);
}

fn render_input_prompt(frame: &mut Frame, app: &App, area: Rect, kind: &InputPromptKind) {
    let t = theme();

    let (prompt, title) = match kind {
        InputPromptKind::CreateSession => ("Session name: ", "Create Session"),
        InputPromptKind::RunApp => ("Device (optional): ", "Run App"),
    };

    let line = Line::from(vec![
        Span::styled(prompt, Style::default().fg(t.text_dim)),
        Span::styled(&app.input_buffer, Style::default().fg(t.text)),
    ]);

    let block = Block::default()
        .title(format!(" {} ", title))
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.info));

    let paragraph = Paragraph::new(line).block(block);
    frame.render_widget(paragraph, area);

    // Show cursor
    let cursor_x = area.x + 1 + prompt.len() as u16 + app.input_buffer.len() as u16;
    let cursor_y = area.y + 1;
    frame.set_cursor_position((cursor_x, cursor_y));
}

fn render_waiting(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();

    let throbber_symbol = render_throbber(&app.throbber_state);

    let text = if let Some(ref intent) = app.pending_intent {
        format!(
            "{} Waiting for agent... ({})",
            throbber_symbol,
            truncate(intent, 40)
        )
    } else {
        format!("{} Waiting for agent response...", throbber_symbol)
    };

    let line = Line::from(vec![Span::styled(
        text,
        Style::default()
            .fg(t.warning)
            .add_modifier(Modifier::ITALIC),
    )]);

    let block = Block::default()
        .title(" Agent ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.warning));

    let paragraph = Paragraph::new(line).block(block);
    frame.render_widget(paragraph, area);
}

fn render_throbber(state: &ThrobberState) -> String {
    let symbols = throbber_widgets_tui::BRAILLE_SIX.symbols;
    let idx = state.index() as usize % symbols.len();
    symbols[idx].to_string()
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s.chars().take(max - 1).collect::<String>())
    }
}
