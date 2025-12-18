use crate::app::App;
use crate::theme::theme;
use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Color, Style},
    widgets::{Block, Borders, Clear},
    Frame,
};
use tui_menu::Menu;

pub fn render(frame: &mut Frame, app: &mut App) {
    let area = frame.area();

    // Guard against small terminals
    if area.width < 20 || area.height < 10 {
        return;
    }

    let t = theme();

    // Center the menu
    let menu_width = 30.min(area.width.saturating_sub(4));
    let menu_height = 12.min(area.height.saturating_sub(4));

    let popup_area = centered_rect(menu_width, menu_height, area);

    // Clear the background
    frame.render_widget(Clear, popup_area);

    // Draw menu background (use Reset to let terminal's background show through)
    let block = Block::default()
        .title(" Actions ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.border))
        .style(Style::default().bg(Color::Reset));

    let inner = block.inner(popup_area);
    frame.render_widget(block, popup_area);

    // Render the menu
    frame.render_stateful_widget(Menu::new(), inner, &mut app.action_menu);
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
