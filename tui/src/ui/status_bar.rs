use crate::app::{App, WsState};
use crate::theme::theme;
use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};
use throbber_widgets_tui::ThrobberState;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();

    let sep = Span::styled(" │ ", Style::default().fg(t.text_dim));

    // === LEFT SIDE ===
    let mut left_spans = vec![
        Span::raw(" "),
        Span::styled(
            &app.project.name,
            Style::default().fg(t.info),
        ),
    ];

    // Selected session - use current_session() as single source of truth
    if let Some(session) = app.current_session() {
        left_spans.push(sep.clone());
        left_spans.push(Span::styled(
            format!("@{}", truncate(&session.name, 12)),
            Style::default().fg(t.source_tree),
        ));

        // Show app status from Session struct (single source of truth)
        match session.app_status.as_str() {
            "running" => {
                left_spans.push(sep.clone());
                if let Some(pid) = session.pid {
                    left_spans.push(Span::styled(
                        format!("pid {} ", pid),
                        Style::default().fg(t.success),
                    ));
                } else {
                    left_spans.push(Span::styled(
                        "running ",
                        Style::default().fg(t.success),
                    ));
                }
                if let Some(uri) = &session.vm_service_uri {
                    if !uri.is_empty() {
                        left_spans.push(Span::styled(uri.clone(), Style::default().fg(t.text_dim)));
                    }
                }
            }
            "starting" => {
                left_spans.push(sep.clone());
                left_spans.push(Span::styled(
                    "starting…",
                    Style::default()
                        .fg(t.warning)
                        .add_modifier(Modifier::ITALIC),
                ));
            }
            "stopped" | "not_running" => {
                left_spans.push(sep.clone());
                left_spans.push(Span::styled("stopped", Style::default().fg(t.error)));
            }
            "error" => {
                left_spans.push(sep.clone());
                left_spans.push(Span::styled("error", Style::default().fg(t.error)));
            }
            _ => {}
        }
    }


    // === RIGHT SIDE ===
    let mut right_spans: Vec<Span> = vec![];

    // Throbber when pending response or connecting
    if app.session.pending_response || app.ws_state == WsState::Connecting {
        let throbber_spans = render_throbber(&app.throbber_state);
        right_spans.extend(throbber_spans);
        right_spans.push(Span::raw(" "));
    }

    // Connection status
    match app.ws_state {
        WsState::Connected => {
            right_spans.push(Span::styled("Connected", Style::default().fg(t.success)));
        }
        WsState::Connecting => {
            right_spans.push(Span::styled(
                "Connecting",
                Style::default()
                    .fg(t.warning)
                    .add_modifier(Modifier::ITALIC),
            ));
        }
        WsState::Disconnected => {
            right_spans.push(Span::styled("Disconnected", Style::default().fg(t.error)));
        }
    };
    right_spans.push(Span::raw(" "));

    // Calculate widths
    let right_width: usize = right_spans.iter().map(|s| s.content.len()).sum();
    let layout = Layout::horizontal([
        Constraint::Min(0),
        Constraint::Length(right_width as u16),
    ])
    .split(area);

    let left_line = Line::from(left_spans);
    let right_line = Line::from(right_spans);

    frame.render_widget(Paragraph::new(left_line), layout[0]);
    frame.render_widget(Paragraph::new(right_line), layout[1]);
}

fn render_throbber(state: &ThrobberState) -> Vec<Span<'static>> {
    let t = theme();
    let symbols = throbber_widgets_tui::BRAILLE_SIX.symbols;
    let idx = state.index() as usize % symbols.len();
    let symbol = symbols[idx];
    vec![Span::styled(symbol.to_string(), Style::default().fg(t.warning))]
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max - 1])
    }
}
