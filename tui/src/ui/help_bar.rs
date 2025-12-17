use crate::app::{App, Mode, Pane};
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
    let in_answer_mode = app.in_answer_mode() && matches!(app.mode, Mode::Normal | Mode::Command | Mode::Input);

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
                        let mut bindings = vec![
                            ("r", "reload"),
                            ("R", "restart"),
                            ("c", "clear"),
                            ("q", "quit"),
                            ("/", "filter"),
                            (":", "command"),
                            ("?", "help"),
                            ("↑↓", "scroll"),
                        ];
                        if app.tree.is_none() {
                            bindings.insert(0, ("t", "tree"));
                        }
                        bindings
                    }
                }
            }
            Mode::Command | Mode::Filter => vec![("Enter", "submit"), ("Esc", "cancel")],
            Mode::Input => vec![("Enter", "send"), ("Esc", "cancel")],
            Mode::Help => vec![("Esc", "close"), ("q", "quit")],
            Mode::Confirm(_) => vec![("y", "confirm"), ("n/Esc", "cancel")],
            Mode::InstancePicker => vec![("↑↓", "select"), ("Enter", "confirm"), ("Esc", "cancel")],
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
