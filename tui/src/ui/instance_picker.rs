use crate::app::App;
use crate::theme::theme;
use ratatui::{
    layout::{Constraint, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App) {
    let t = theme();

    let area = centered_rect(60, 50, frame.area());

    frame.render_widget(Clear, area);

    let block = Block::default()
        .title(" Select Instance ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.title));

    if app.instances.is_empty() {
        let msg = Paragraph::new("No instances available")
            .style(Style::default().fg(t.text_dim))
            .block(block);
        frame.render_widget(msg, area);
        return;
    }

    let items: Vec<ListItem> = app
        .instances
        .iter()
        .enumerate()
        .map(|(i, instance)| {
            let is_selected = i == app.instance_picker_index;
            let prefix = if is_selected { "▸ " } else { "  " };

            let status_color = match instance.status.as_str() {
                "running" => t.success,
                "stopped" => t.error,
                _ => t.warning,
            };

            let line = Line::from(vec![
                Span::styled(
                    prefix,
                    Style::default().fg(t.text),
                ),
                Span::styled(
                    &instance.name,
                    Style::default()
                        .fg(t.text)
                        .add_modifier(if is_selected {
                            Modifier::BOLD
                        } else {
                            Modifier::empty()
                        }),
                ),
                Span::styled(" (", Style::default().fg(t.text_dim)),
                Span::styled(&instance.status, Style::default().fg(status_color)),
                Span::styled(")", Style::default().fg(t.text_dim)),
            ]);

            let style = if is_selected {
                Style::default().bg(t.border)
            } else {
                Style::default()
            };

            ListItem::new(line).style(style)
        })
        .collect();

    let list = List::new(items).block(block);
    frame.render_widget(list, area);
}

fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::vertical([
        Constraint::Percentage((100 - percent_y) / 2),
        Constraint::Percentage(percent_y),
        Constraint::Percentage((100 - percent_y) / 2),
    ])
    .split(r);

    Layout::horizontal([
        Constraint::Percentage((100 - percent_x) / 2),
        Constraint::Percentage(percent_x),
        Constraint::Percentage((100 - percent_x) / 2),
    ])
    .split(popup_layout[1])[1]
}
