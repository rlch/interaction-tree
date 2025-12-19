//! Agent TUI - Terminal interface for Claude agent interaction.

use std::io;
use std::time::Duration;

use agent_backend::{Backend, DaemonBackend};
use anyhow::Result;
use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen};
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Terminal;

mod app;
mod chat;
mod composer;
mod markdown;

use app::App;
use chat::ChatWidget;
use composer::ComposerWidget;

#[tokio::main]
async fn main() -> Result<()> {
    // Parse args
    let args: Vec<String> = std::env::args().collect();
    let daemon_url = args.get(1).map(|s| s.as_str()).unwrap_or("ws://127.0.0.1:9877");
    let session_id = args.get(2).map(|s| s.as_str()).unwrap_or("default");
    
    // Initialize backend
    let mut backend = DaemonBackend::new(daemon_url, session_id);
    
    // Set up terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let terminal_backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(terminal_backend)?;
    
    // Try to connect
    let connected = backend.connect().await.is_ok();
    
    // Create app
    let mut app = App::new(backend);
    
    // Main loop
    let result = run_app(&mut terminal, &mut app, connected).await;
    
    // Restore terminal
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    
    result
}

async fn run_app<B: Backend>(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    app: &mut App<B>,
    connected: bool,
) -> Result<()> {
    use futures_util::StreamExt;
    use crossterm::event::EventStream;
    
    let mut event_stream = EventStream::new();
    
    loop {
        // Draw
        terminal.draw(|frame| {
            let area = frame.area();
            
            // Layout: header, chat, composer
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(1),  // Header
                    Constraint::Min(1),     // Chat
                    Constraint::Length(3),  // Composer
                ])
                .split(area);
            
            // Header
            render_header(frame, chunks[0], connected, app.is_streaming());
            
            // Chat area
            let chat = ChatWidget::new(&app.messages)
                .streaming(app.streaming_text())
                .scroll(app.scroll);
            frame.render_widget(chat, chunks[1]);
            
            // Composer
            let composer_widget = ComposerWidget::new(&app.composer)
                .focused(!app.is_streaming());
            frame.render_widget(composer_widget, chunks[2]);
            
            // Show cursor in composer
            if !app.is_streaming() {
                let (cx, cy) = app.composer.cursor_position(chunks[2]);
                frame.set_cursor_position((cx, cy + 1)); // +1 for border
            }
            
            // Show needs_context prompt if active
            if let Some(context) = &app.needs_context {
                render_context_prompt(frame, area, context);
            }
        })?;
        
        // Use tokio::select! for concurrent event handling
        let tick = tokio::time::sleep(Duration::from_millis(50));
        
        tokio::select! {
            // Agent events from backend
            event = app.backend.next_event() => {
                if let Ok(Some(agent_event)) = event {
                    app.handle_agent_event(agent_event);
                }
            }
            
            // Terminal events
            Some(Ok(term_event)) = event_stream.next() => {
                if let Event::Key(key) = term_event {
                    if handle_key(app, key).await? {
                        break;
                    }
                }
            }
            
            // Tick for UI refresh
            _ = tick => {}
        }
        
        if app.should_quit {
            break;
        }
    }
    
    Ok(())
}

fn render_header(
    frame: &mut ratatui::Frame,
    area: Rect,
    connected: bool,
    streaming: bool,
) {
    let status = if streaming {
        Span::styled("● streaming", Style::default().fg(Color::Yellow))
    } else if connected {
        Span::styled("● connected", Style::default().fg(Color::Green))
    } else {
        Span::styled("● disconnected", Style::default().fg(Color::Red))
    };
    
    let line = Line::from(vec![
        Span::styled("Agent TUI", Style::default().fg(Color::Cyan)),
        Span::raw(" │ "),
        status,
    ]);
    
    frame.render_widget(Paragraph::new(line), area);
}

fn render_context_prompt(
    frame: &mut ratatui::Frame,
    area: Rect,
    context: &app::NeedsContextState,
) {
    // Center popup
    let popup_width = area.width.saturating_sub(10).min(60);
    let popup_height = 5;
    let x = (area.width - popup_width) / 2;
    let y = (area.height - popup_height) / 2;
    let popup_area = Rect::new(x, y, popup_width, popup_height);
    
    let block = Block::default()
        .title("Agent needs more context")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Yellow));
    
    let text = Paragraph::new(context.question.as_str())
        .block(block)
        .style(Style::default().fg(Color::White));
    
    frame.render_widget(text, popup_area);
}

async fn handle_key<B: Backend>(app: &mut App<B>, key: KeyEvent) -> Result<bool> {
    match (key.code, key.modifiers) {
        // Quit
        (KeyCode::Char('c'), KeyModifiers::CONTROL) => {
            return Ok(true);
        }
        (KeyCode::Esc, _) => {
            if app.needs_context.is_some() {
                app.needs_context = None;
            } else if app.is_streaming() {
                // Could cancel streaming here
            } else {
                return Ok(true);
            }
        }
        // Scroll
        (KeyCode::PageUp, _) | (KeyCode::Char('b'), KeyModifiers::CONTROL) => {
            app.scroll_up();
        }
        (KeyCode::PageDown, _) | (KeyCode::Char('f'), KeyModifiers::CONTROL) => {
            app.scroll_down();
        }
        // Submit
        (KeyCode::Enter, KeyModifiers::NONE) if !app.is_streaming() => {
            if !app.composer.is_empty() {
                app.submit().await?;
            }
        }
        // Input
        _ if !app.is_streaming() => {
            app.composer.handle_key(key);
        }
        _ => {}
    }
    Ok(false)
}
