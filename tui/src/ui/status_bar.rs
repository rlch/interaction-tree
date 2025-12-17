use crate::app::{App, AppStatus, TreeNode, WsState};
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

    let ws_status = match app.ws_state {
        WsState::Connected => Span::styled("Connected", Style::default().fg(t.success)),
        WsState::Connecting => Span::styled(
            "Connecting…",
            Style::default()
                .fg(t.warning)
                .add_modifier(Modifier::ITALIC),
        ),
        WsState::Disconnected => Span::styled("Disconnected", Style::default().fg(t.error)),
    };

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

    let sep = Span::styled(" │ ", Style::default().fg(t.text_dim));

    let mut spans = vec![
        Span::styled(
            " IT Monitor",
            Style::default()
                .fg(t.title)
                .add_modifier(Modifier::BOLD),
        ),
        sep.clone(),
        ws_status,
        sep.clone(),
        Span::styled(&app.server_uri, Style::default().fg(t.text_dim)),
        sep.clone(),
        Span::raw("app: "),
        app_status,
    ];

    if let Some(tree) = &app.tree {
        let count = count_nodes(&tree.nodes);
        spans.push(sep.clone());
        spans.push(Span::styled(
            format!("{} widgets", count),
            Style::default().fg(t.source_tree),
        ));
    }

    let line = Line::from(spans);

    let paragraph = Paragraph::new(line).style(Style::default().bg(t.background));
    frame.render_widget(paragraph, area);
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max - 1])
    }
}

fn count_nodes(nodes: &[TreeNode]) -> usize {
    nodes.iter().fold(0, |acc, node| {
        acc + 1 + count_nodes(&node.children)
    })
}
