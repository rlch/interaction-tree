use crate::app::App;
use crate::theme::theme;
use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, ListState},
    Frame,
};

pub fn render(frame: &mut Frame, app: &mut App) {
    let area = frame.area();

    // Guard against small terminals
    if area.width < 20 || area.height < 10 {
        return;
    }

    let t = theme();

    // Build menu items from action_menu state
    let items: Vec<ListItem> = app
        .action_menu_items
        .iter()
        .map(|(label, _)| ListItem::new(Line::from(vec![Span::raw(label.clone())])))
        .collect();

    if items.is_empty() {
        return;
    }

    // Calculate width based on longest item + padding
    let max_label_len = app
        .action_menu_items
        .iter()
        .map(|(label, _)| label.len())
        .max()
        .unwrap_or(10);
    let menu_width = (max_label_len as u16 + 4).min(area.width.saturating_sub(4));
    let menu_height = (items.len() as u16 + 2).min(area.height.saturating_sub(4));

    let popup_area = centered_rect(menu_width, menu_height, area);

    // Clear the background
    frame.render_widget(Clear, popup_area);

    // Draw menu with border
    let block = Block::default()
        .title(" Actions ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.border))
        .style(Style::default().bg(Color::Black));

    let list = List::new(items)
        .block(block)
        .highlight_style(
            Style::default()
                .bg(t.info)
                .fg(Color::Black)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("▸ ");

    let mut state = ListState::default();
    state.select(Some(app.action_menu_index));

    frame.render_stateful_widget(list, popup_area, &mut state);
}

fn centered_rect(width: u16, height: u16, area: Rect) -> Rect {
    let vertical = Layout::vertical([
        Constraint::Length((area.height.saturating_sub(height)) / 2),
        Constraint::Length(height),
        Constraint::Min(0),
    ])
    .split(area);

    let horizontal = Layout::horizontal([
        Constraint::Length((area.width.saturating_sub(width)) / 2),
        Constraint::Length(width),
        Constraint::Min(0),
    ])
    .split(vertical[1]);

    horizontal[1]
}
