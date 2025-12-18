use crate::app::{App, ContentTab, InputPromptKind, Mode};
use crate::theme::theme;
use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    // Guard against zero-width areas
    if area.width == 0 || area.height == 0 {
        return;
    }

    let t = theme();

    // Show input line for filter mode
    if matches!(app.mode, Mode::Filter) {
        let spans = vec![
            Span::styled("/", Style::default().fg(t.text_highlight).add_modifier(Modifier::BOLD)),
            Span::styled(&app.input_buffer, Style::default().fg(t.text)),
            Span::styled("█", Style::default().fg(t.text_highlight)),
            Span::styled("  (Enter to keep, Esc to clear)", Style::default().fg(t.text_dim)),
        ];
        let line = Line::from(spans);
        frame.render_widget(Paragraph::new(line), area);
        return;
    }

    let bindings = match &app.mode {
        Mode::Normal => {
            let mut bindings: Vec<(&str, &str)> = vec![];

            // Tab-specific bindings
            match app.content_tab {
                ContentTab::Tree => {
                    bindings.push(("Tab", "tabs"));
                }
                _ => {
                    bindings.push(("hl", "tabs"));
                }
            }
            bindings.push(("↑↓/jk", "scroll"));

            match app.content_tab {
                ContentTab::Flutter => {
                    bindings.push(("/", "filter"));
                    if app.has_session() {
                        if app.is_app_running() {
                            bindings.push(("r", "reload"));
                            bindings.push(("R", "restart"));
                            bindings.push(("x", "stop"));
                        } else {
                            bindings.push(("p", "run"));
                        }
                    }
                    bindings.push(("c", "clear"));
                }
                ContentTab::Tree => {
                    bindings[1] = ("↑↓/jk", "navigate");
                    bindings.push(("←→", "expand"));
                    bindings.push(("Enter", "toggle"));
                    // Dynamic capability-based hotkeys
                    let caps = app.selected_node_capabilities();
                    let actions = app.selected_node_actions();
                    if caps.iter().any(|c| c == "tap") {
                        bindings.push(("t", "tap"));
                    }
                    if caps.iter().any(|c| c == "longPress") {
                        bindings.push(("L", "longPress"));
                    }
                    // Actions menu (if any capabilities or custom actions)
                    if !caps.is_empty() || !actions.is_empty() {
                        bindings.push(("a", "actions"));
                    }
                }
                ContentTab::Agent | ContentTab::Interactions => {
                    bindings.push(("/", "filter"));
                    bindings.push(("c", "clear"));
                }
            }

            bindings.push(("s", "sessions"));
            bindings.push(("?", "help"));
            bindings
        }
        Mode::Filter => vec![("Enter", "apply"), ("Esc", "cancel")],
        Mode::Help => vec![("Esc", "close"), ("q", "quit")],
        Mode::Confirm(_) => vec![("y", "confirm"), ("n/Esc", "cancel")],
        Mode::SessionPicker => vec![
            ("↑↓/jk", "select"),
            ("Enter", "connect"),
            ("c", "create"),
            ("d", "delete"),
            ("Esc", "close"),
        ],
        Mode::InputPrompt(kind) => match kind {
            InputPromptKind::CreateSession => vec![("Enter", "create"), ("Esc", "cancel")],
            InputPromptKind::RunApp => vec![("Enter", "run (empty=default)"), ("Esc", "cancel")],
        },
        Mode::ActionMenu => vec![
            ("↑↓/jk", "navigate"),
            ("←→/hl", "submenu"),
            ("Enter", "select"),
            ("Esc", "cancel"),
        ],
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
