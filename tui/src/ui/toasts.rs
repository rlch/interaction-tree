use crate::app::{App, ToastLevel};
use crate::theme::theme;
use ratatui::{
    layout::Rect,
    style::Style,
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
    Frame,
};

const MAX_TOAST_WIDTH: u16 = 45;
const TOAST_PADDING: u16 = 2;

pub fn render(frame: &mut Frame, app: &App) {
    if app.toasts.is_empty() {
        return;
    }

    let t = theme();
    let area = frame.area();

    // Guard against tiny terminal
    if area.width < 20 || area.height < 5 {
        return;
    }

    // Stack toasts from top-right, going down
    let mut y_offset = 1u16; // Start below status bar

    // Limit toast width to available space
    let toast_width = MAX_TOAST_WIDTH.min(area.width.saturating_sub(TOAST_PADDING + 2));
    if toast_width < 10 {
        return; // Not enough room for readable toasts
    }

    for toast in app.toasts.iter().rev().take(3) {
        let (icon, border_color) = match toast.level {
            ToastLevel::Error => ("✗", t.error),
            ToastLevel::Warning => ("⚠", t.warning),
            ToastLevel::Success => ("✓", t.success),
            ToastLevel::Info => ("•", t.info),
        };

        // Calculate toast dimensions with wrapping
        let inner_width = toast_width.saturating_sub(4) as usize; // borders + padding
        if inner_width == 0 {
            continue;
        }
        let wrapped_lines = wrap_text(&toast.message, inner_width);
        let content_height = wrapped_lines.len().max(1) as u16;
        let toast_height = content_height + 2; // borders

        // Position in top-right
        let toast_x = area.width.saturating_sub(toast_width + TOAST_PADDING);

        if y_offset + toast_height > area.height.saturating_sub(4) {
            break; // No more room
        }

        let toast_area = Rect::new(toast_x, y_offset, toast_width, toast_height);

        // Clear background
        frame.render_widget(Clear, toast_area);

        // Build toast content with icon on first line
        let mut lines: Vec<Line> = Vec::new();
        for (i, line_text) in wrapped_lines.iter().enumerate() {
            if i == 0 {
                lines.push(Line::from(vec![
                    Span::styled(format!("{} ", icon), Style::default().fg(border_color)),
                    Span::styled(line_text.clone(), Style::default().fg(t.text)),
                ]));
            } else {
                lines.push(Line::from(vec![
                    Span::raw("  "), // indent to align with first line
                    Span::styled(line_text.clone(), Style::default().fg(t.text)),
                ]));
            }
        }

        let block = Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(border_color));

        let paragraph = Paragraph::new(lines).block(block).wrap(Wrap { trim: false });
        frame.render_widget(paragraph, toast_area);

        y_offset += toast_height + 1;
    }
}

fn wrap_text(text: &str, max_width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current_line = String::new();

    for word in text.split_whitespace() {
        if current_line.is_empty() {
            if word.len() > max_width {
                // Word is too long, split it
                let mut remaining = word;
                while remaining.len() > max_width {
                    lines.push(remaining[..max_width].to_string());
                    remaining = &remaining[max_width..];
                }
                current_line = remaining.to_string();
            } else {
                current_line = word.to_string();
            }
        } else if current_line.len() + 1 + word.len() <= max_width {
            current_line.push(' ');
            current_line.push_str(word);
        } else {
            lines.push(current_line);
            current_line = word.to_string();
        }
    }

    if !current_line.is_empty() {
        lines.push(current_line);
    }

    if lines.is_empty() {
        lines.push(String::new());
    }

    lines
}
