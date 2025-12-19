mod agent_pane;
mod completion_popup;
mod flutter_pane;
mod help_bar;
mod help_overlay;
mod interactions_pane;
mod session_picker;
mod status_bar;
mod toasts;
mod tree_pane;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Paragraph, Tabs};
use ratatui::Frame;

use crate::app::{App, ContentTab, Mode};
use crate::theme::theme;

pub fn render(frame: &mut Frame, app: &mut App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(3),    // main content area (includes tab bar)
            Constraint::Length(1), // help bar
        ])
        .split(frame.area());

    render_content_with_tabs(frame, app, chunks[0]);
    help_bar::render(frame, app, chunks[1]);

    // Overlays
    if matches!(app.mode, Mode::Help) {
        help_overlay::render(frame);
    }

    if matches!(app.mode, Mode::SessionPicker | Mode::InputPrompt(_)) {
        session_picker::render(frame, app);
    }

    // Toasts (always on top)
    toasts::render(frame, app);
}

fn render_content_with_tabs(frame: &mut Frame, app: &mut App, area: Rect) {
    let t = theme();

    // Split area for tab bar and content
    let content_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // tab bar + status (same line)
            Constraint::Min(1),    // content pane
        ])
        .split(area);

    // Build status spans for the right side
    let (status_spans, status_width) = status_bar::build_status_spans(app);

    // Split tab bar area: tabs on left, status on right
    let tab_bar_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Min(0),
            Constraint::Length(status_width as u16),
        ])
        .split(content_chunks[0]);

    // Render tab bar on the left
    let tab_titles: Vec<Line> = [
        ContentTab::Flutter,
        ContentTab::Agent,
        ContentTab::Interactions,
        ContentTab::Tree,
    ]
    .iter()
    .map(|tab| {
        let is_active = app.content_tab == *tab;
        let style = if is_active {
            Style::default()
                .fg(t.title)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(t.text_dim)
        };
        Line::from(Span::styled(tab.label(), style))
    })
    .collect();

    let selected_index = match app.content_tab {
        ContentTab::Flutter => 0,
        ContentTab::Agent => 1,
        ContentTab::Interactions => 2,
        ContentTab::Tree => 3,
    };

    let tabs = Tabs::new(tab_titles)
        .select(selected_index)
        .style(Style::default().fg(t.text_dim))
        .highlight_style(Style::default().fg(t.title).add_modifier(Modifier::BOLD))
        .divider(Span::styled(" │ ", Style::default().fg(t.text_dim)));

    frame.render_widget(tabs, tab_bar_chunks[0]);

    // Render status on the right
    let status_line = Line::from(status_spans);
    frame.render_widget(Paragraph::new(status_line), tab_bar_chunks[1]);

    // Render active pane
    match app.content_tab {
        ContentTab::Flutter => flutter_pane::render(frame, app, content_chunks[1]),
        ContentTab::Agent => agent_pane::render(frame, app, content_chunks[1]),
        ContentTab::Interactions => interactions_pane::render(frame, app, content_chunks[1]),
        ContentTab::Tree => tree_pane::render(frame, app, content_chunks[1]),
    }
}
