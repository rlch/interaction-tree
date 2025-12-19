use crate::app::{App, WsState};
use crate::theme::theme;
use ratatui::{
    style::{Modifier, Style},
    text::Span,
};
use throbber_widgets_tui::ThrobberState;

/// Build status spans to be shown on the right side of the tab bar.
/// Returns (spans, total_width)
pub fn build_status_spans(app: &App) -> (Vec<Span<'static>>, usize) {
    let t = theme();
    let sep = Span::styled(" │ ", Style::default().fg(t.text_dim));
    let mut spans: Vec<Span<'static>> = vec![];

    // If disconnected from daemon, just show "Disconnected"
    if app.ws_state == WsState::Disconnected {
        spans.push(Span::styled(
            "Disconnected",
            Style::default().fg(t.error),
        ));
        spans.push(Span::raw(" "));
        let width = spans.iter().map(|s| s.content.len()).sum();
        return (spans, width);
    }

    // Throbber when pending response or connecting
    if app.session.pending_response || app.ws_state == WsState::Connecting {
        let throbber_spans = render_throbber(&app.throbber_state);
        spans.extend(throbber_spans);
        spans.push(Span::raw(" "));
    }

    // Show "Connecting" status
    if app.ws_state == WsState::Connecting {
        spans.push(Span::styled(
            "Connecting",
            Style::default()
                .fg(t.warning)
                .add_modifier(Modifier::ITALIC),
        ));
        spans.push(Span::raw(" "));
        let width = spans.iter().map(|s| s.content.len()).sum();
        return (spans, width);
    }

    // Connected: show project | session | app status
    spans.push(Span::styled(
        app.project.name.clone(),
        Style::default().fg(t.info),
    ));

    // Selected session and app status from Session struct
    if let Some(session) = app.current_session() {
        spans.push(sep.clone());
        spans.push(Span::styled(
            format!("@{}", truncate(&session.name, 12)),
            Style::default().fg(t.source_tree),
        ));

        // App status from session
        match session.app_status.as_str() {
            "running" => {
                if let Some(pid) = session.pid {
                    spans.push(sep.clone());
                    spans.push(Span::styled(
                        format!("pid {}", pid),
                        Style::default().fg(t.success),
                    ));
                }
                // Show if VM is disconnected (no vmServiceUri)
                if session.vm_service_uri.as_ref().is_none_or(|u| u.is_empty()) {
                    spans.push(sep.clone());
                    spans.push(Span::styled(
                        "vm disconnected",
                        Style::default().fg(t.warning).add_modifier(Modifier::ITALIC),
                    ));
                }
            }
            "starting" => {
                spans.push(sep.clone());
                spans.push(Span::styled(
                    "starting…",
                    Style::default()
                        .fg(t.warning)
                        .add_modifier(Modifier::ITALIC),
                ));
            }
            "stopped" => {
                spans.push(sep.clone());
                spans.push(Span::styled("stopped", Style::default().fg(t.error)));
            }
            "error" => {
                spans.push(sep);
                spans.push(Span::styled("error", Style::default().fg(t.error)));
            }
            _ => {} // not_running, unknown
        }
    }

    spans.push(Span::raw(" "));
    let width = spans.iter().map(|s| s.content.len()).sum();
    (spans, width)
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
