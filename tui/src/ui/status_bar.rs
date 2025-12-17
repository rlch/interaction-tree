use crate::app::{App, AppStatus, TreeNode, WsState};
use crate::theme::theme;
use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};
use throbber_widgets_tui::ThrobberState;

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();

    let mut spans = vec![Span::styled(
        " Fleeter",
        Style::default().fg(t.title).add_modifier(Modifier::BOLD),
    )];

    let sep = Span::styled(" │ ", Style::default().fg(t.text_dim));

    // Project name
    spans.push(sep.clone());
    spans.push(Span::styled(
        &app.project.name,
        Style::default().fg(t.info),
    ));

    // Selected session
    if let Some(ref session_id) = app.selected_session {
        let session_name = app
            .sessions
            .iter()
            .find(|s| s.id == *session_id)
            .map(|s| s.name.as_str())
            .unwrap_or(session_id.as_str());
        spans.push(sep.clone());
        spans.push(Span::styled(
            format!("@{}", truncate(session_name, 12)),
            Style::default().fg(t.source_tree),
        ));
    }

    spans.push(sep.clone());

    // Connection status with throbber when connecting
    match app.ws_state {
        WsState::Connected => {
            spans.push(Span::styled("Connected", Style::default().fg(t.success)));
        }
        WsState::Connecting => {
            spans.push(Span::styled(
                "Connecting",
                Style::default()
                    .fg(t.warning)
                    .add_modifier(Modifier::ITALIC),
            ));
        }
        WsState::Disconnected => {
            spans.push(Span::styled("Disconnected", Style::default().fg(t.error)));
        }
    };

    spans.push(sep.clone());
    spans.push(Span::styled(&app.server_uri, Style::default().fg(t.text_dim)));

    // App status
    let app_status = match &app.app_status {
        AppStatus::Unknown => Span::styled("unknown", Style::default().fg(t.text_dim)),
        AppStatus::Starting => Span::styled(
            "starting…",
            Style::default()
                .fg(t.warning)
                .add_modifier(Modifier::ITALIC),
        ),
        AppStatus::Running { pid, .. } => Span::styled(
            format!("running (pid {})", pid),
            Style::default().fg(t.success),
        ),
        AppStatus::Stopped => Span::styled("stopped", Style::default().fg(t.error)),
        AppStatus::Error(e) => Span::styled(
            format!("error: {}", truncate(e, 30)),
            Style::default().fg(t.error),
        ),
    };

    spans.push(sep.clone());
    spans.push(Span::raw("app: "));
    spans.push(app_status);

    // Widget count if tree exists
    if let Some(tree) = &app.tree {
        let count = count_nodes(&tree.nodes);
        spans.push(sep.clone());
        spans.push(Span::styled(
            format!("{} widgets", count),
            Style::default().fg(t.source_tree),
        ));
    }

    // Throbber when pending response or connecting
    if app.pending_response || app.ws_state == WsState::Connecting {
        spans.push(Span::raw(" "));
        let throbber_spans = render_throbber(&app.throbber_state);
        spans.extend(throbber_spans);
    }

    let line = Line::from(spans);
    let paragraph = Paragraph::new(line);
    frame.render_widget(paragraph, area);
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

fn count_nodes(nodes: &[TreeNode]) -> usize {
    nodes
        .iter()
        .fold(0, |acc, node| acc + 1 + count_nodes(&node.children))
}
