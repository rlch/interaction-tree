mod agent_pane;
mod completion_popup;
mod flutter_pane;
mod help_bar;
mod help_overlay;
mod session_logs_pane;
mod session_picker;
mod status_bar;
mod toasts;
mod tree_pane;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::Tabs;
use ratatui::Frame;

use crate::app::{App, ContentTab, Mode};
use crate::theme::theme;

pub fn render(frame: &mut Frame, app: &mut App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // status bar
            Constraint::Min(3),    // main content area
            Constraint::Length(1), // help bar
        ])
        .split(frame.area());

    status_bar::render(frame, app, chunks[0]);

    // Main content: split or single
    if app.tree.is_some() {
        // Split view: content tabs | tree
        let main_chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(60), // content
                Constraint::Percentage(40), // tree
            ])
            .split(chunks[1]);

        render_content_with_tabs(frame, app, main_chunks[0]);
        tree_pane::render(frame, app, main_chunks[1]);
    } else {
        // Single pane: content tabs only
        render_content_with_tabs(frame, app, chunks[1]);
    }

    help_bar::render(frame, app, chunks[2]);

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

fn render_content_with_tabs(frame: &mut Frame, app: &App, area: Rect) {
    let t = theme();

    // Split area for tab bar and content
    let content_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // tab bar
            Constraint::Min(1),    // content pane
        ])
        .split(area);

    // Render tab bar
    let tab_titles: Vec<Line> = [ContentTab::Session, ContentTab::Flutter, ContentTab::Agent]
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
        ContentTab::Session => 0,
        ContentTab::Flutter => 1,
        ContentTab::Agent => 2,
    };

    let tabs = Tabs::new(tab_titles)
        .select(selected_index)
        .style(Style::default().fg(t.text_dim))
        .highlight_style(Style::default().fg(t.title).add_modifier(Modifier::BOLD))
        .divider(Span::styled(" │ ", Style::default().fg(t.text_dim)));

    frame.render_widget(tabs, content_chunks[0]);

    // Render active pane
    match app.content_tab {
        ContentTab::Session => session_logs_pane::render(frame, app, content_chunks[1]),
        ContentTab::Flutter => flutter_pane::render(frame, app, content_chunks[1]),
        ContentTab::Agent => agent_pane::render(frame, app, content_chunks[1]),
    }
}
