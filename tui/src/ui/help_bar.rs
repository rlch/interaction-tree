use crate::app::{App, InputPromptKind, Mode, Pane};
use crate::theme::theme;
use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();

    // Check if we're in answer mode
    let in_answer_mode = app.in_answer_mode() && matches!(app.mode, Mode::Normal | Mode::Input);

    let bindings = if in_answer_mode {
        vec![("Enter", "answer"), ("Esc", "cancel")]
    } else {
        match &app.mode {
            Mode::Normal => {
                match app.selected_pane {
                    Pane::Tree => vec![
                        ("↑↓", "navigate"),
                        ("Enter", "expand"),
                        ("Tab", "next pane"),
                        ("Esc", "back"),
                        ("q", "quit"),
                    ],
                    _ => {
                        let mut bindings = vec![("s", "sessions")];
                        
                        if app.has_session() {
                            if app.is_app_running() {
                                bindings.push(("x", "stop"));
                                bindings.push(("r", "reload"));
                                bindings.push(("R", "restart"));
                                if app.tree.is_none() {
                                    bindings.push(("t", "tree"));
                                }
                            } else {
                                bindings.push(("p", "run"));
                            }
                        }
                        
                        bindings.push(("c", "clear"));
                        bindings.push(("?", "help"));
                        bindings
                    }
                }
            }
            Mode::Filter => vec![("Enter", "apply"), ("Esc", "cancel")],
            Mode::Input => vec![("Enter", "send"), ("Esc", "cancel")],
            Mode::Help => vec![("Esc", "close"), ("q", "quit")],
            Mode::Confirm(_) => vec![("y", "confirm"), ("n/Esc", "cancel")],
            Mode::SessionPicker => vec![
                ("↑↓", "select"),
                ("Enter", "connect"),
                ("c", "create"),
                ("d", "delete"),
                ("Esc", "close"),
            ],
            Mode::InputPrompt(kind) => {
                match kind {
                    InputPromptKind::CreateSession => vec![("Enter", "create"), ("Esc", "cancel")],
                    InputPromptKind::RunApp => vec![("Enter", "run"), ("Esc", "cancel")],
                }
            }
        }
    };

    let mut spans = Vec::new();
    for (i, (key, desc)) in bindings.iter().enumerate() {
        if i > 0 {
            spans.push(Span::styled(" ", Style::default()));
        }
        spans.push(Span::styled(
            *key,
            Style::default()
                .fg(t.text_highlight)
                .add_modifier(Modifier::BOLD),
        ));
        spans.push(Span::styled(
            format!(":{}", desc),
            Style::default().fg(t.text_dim),
        ));
    }

    let line = Line::from(spans);
    let paragraph = Paragraph::new(line);
    frame.render_widget(paragraph, area);
}
