mod events_pane;
mod help_bar;
mod help_overlay;
mod input_bar;
mod status_bar;
mod tree_pane;

use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::Frame;

use crate::app::{App, Mode};

pub fn render(frame: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),  // status bar
            Constraint::Min(3),     // main content area
            Constraint::Length(3),  // input bar
            Constraint::Length(1),  // help bar
        ])
        .split(frame.area());

    status_bar::render(frame, app, chunks[0]);
    
    // Main content: split or single
    if app.tree.is_some() {
        // Split view: events | tree
        let main_chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(60),  // events
                Constraint::Percentage(40),  // tree
            ])
            .split(chunks[1]);
        
        events_pane::render(frame, app, main_chunks[0]);
        tree_pane::render(frame, app, main_chunks[1]);
    } else {
        // Single pane: events only
        events_pane::render(frame, app, chunks[1]);
    }
    
    input_bar::render(frame, app, chunks[2]);
    help_bar::render(frame, app, chunks[3]);

    // Help overlay on top if in help mode
    if matches!(app.mode, Mode::Help) {
        help_overlay::render(frame);
    }
}
