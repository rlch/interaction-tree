use std::io;
use std::time::Duration;

use anyhow::Result;
use crossterm::event::{
    self, Event as CrosstermEvent, KeyCode, KeyEvent, KeyModifiers, MouseButton, MouseEvent,
    MouseEventKind,
};
use crossterm::terminal::{EnterAlternateScreen, LeaveAlternateScreen};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::app::{App, ConfirmAction, Mode, Pane, WsState};
use crate::commands::{parse_command, TuiCommand};
use crate::ui;
use crate::ws::client::{WsClient, WsEvent};
use crate::ws::protocol::{IncomingMessage, OutgoingMessage};

pub async fn run(app: &mut App) -> Result<()> {
    crossterm::terminal::enable_raw_mode()?;
    let mut stdout = io::stdout();
    crossterm::execute!(stdout, EnterAlternateScreen, crossterm::event::EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let result = run_event_loop(&mut terminal, app).await;

    crossterm::terminal::disable_raw_mode()?;
    crossterm::execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        crossterm::event::DisableMouseCapture
    )?;

    result
}

async fn run_event_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    app: &mut App,
) -> Result<()> {
    let (ws_tx, mut ws_rx) = mpsc::channel::<WsEvent>(100);

    app.ws_state = WsState::Connecting;
    let ws_client = match WsClient::connect(&app.server_uri, ws_tx).await {
        Ok(client) => {
            app.ws_state = WsState::Connected;
            Some(client)
        }
        Err(e) => {
            app.ws_state = WsState::Disconnected;
            tracing::error!("Failed to connect to WebSocket: {}", e);
            None
        }
    };

    loop {
        terminal.draw(|f| ui::render(f, app))?;

        if app.should_quit {
            break;
        }

        // Use tokio::select! to handle both terminal and WebSocket events
        // Poll terminal with short timeout for responsive typing
        tokio::select! {
            biased;  // Prefer terminal events for responsiveness

            // Check for terminal events (non-blocking with short poll)
            result = tokio::task::spawn_blocking(|| {
                if event::poll(Duration::from_millis(10)).unwrap_or(false) {
                    Some(event::read())
                } else {
                    None
                }
            }) => {
                if let Ok(Some(Ok(evt))) = result {
                    match evt {
                        CrosstermEvent::Key(key) => {
                            handle_key_event(app, key, &ws_client).await?;
                        }
                        CrosstermEvent::Mouse(mouse) => {
                            handle_mouse_event(app, mouse);
                        }
                        _ => {}
                    }
                }
            }

            // Check for WebSocket events
            Some(ws_event) = ws_rx.recv() => {
                handle_ws_event(app, ws_event);
            }
        }
    }

    Ok(())
}

async fn handle_key_event(
    app: &mut App,
    key: KeyEvent,
    ws: &Option<WsClient>,
) -> Result<()> {
    if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
        app.should_quit = true;
        return Ok(());
    }

    match &app.mode {
        Mode::Normal => handle_normal_mode(app, key, ws).await?,
        Mode::Command => handle_command_mode(app, key, ws).await?,
        Mode::Filter => handle_filter_mode(app, key),
        Mode::Input => handle_input_mode(app, key, ws).await?,
        Mode::Help => handle_help_mode(app, key),
        Mode::Confirm(action) => handle_confirm_mode(app, key, action.clone()),
    }

    Ok(())
}

fn handle_mouse_event(app: &mut App, mouse: MouseEvent) {
    match mouse.kind {
        MouseEventKind::ScrollUp => match app.selected_pane {
            Pane::Events => app.scroll_up(),
            Pane::Tree => app.tree_scroll_up(),
            _ => {}
        },
        MouseEventKind::ScrollDown => match app.selected_pane {
            Pane::Events => app.scroll_down(),
            Pane::Tree => app.tree_scroll_down(),
            _ => {}
        },
        MouseEventKind::Down(MouseButton::Left) => {
            // Future: implement pane focus detection based on coordinates
        }
        _ => {}
    }
}

async fn handle_normal_mode(app: &mut App, key: KeyEvent, ws: &Option<WsClient>) -> Result<()> {
    match app.selected_pane {
        Pane::Tree => {
            match key.code {
                KeyCode::Char('j') | KeyCode::Down => {
                    app.tree_scroll_down();
                    app.tree_select_at_offset();
                }
                KeyCode::Char('k') | KeyCode::Up => {
                    app.tree_scroll_up();
                    app.tree_select_at_offset();
                }
                KeyCode::Enter | KeyCode::Char(' ') => {
                    app.tree_toggle_selected();
                }
                KeyCode::Tab => {
                    app.selected_pane = Pane::Input;
                }
                KeyCode::Esc => {
                    app.selected_pane = Pane::Events;
                }
                _ => handle_global_keys(app, key, ws).await?,
            }
        }
        Pane::Input => {
            match key.code {
                KeyCode::Char(':') => {
                    app.mode = Mode::Command;
                    app.input_buffer.clear();
                }
                KeyCode::Char('/') => {
                    app.mode = Mode::Filter;
                    app.input_buffer.clear();
                }
                KeyCode::Char('?') => {
                    app.mode = Mode::Help;
                }
                KeyCode::Tab => {
                    app.selected_pane = Pane::Events;
                }
                KeyCode::Esc => {
                    app.selected_pane = Pane::Events;
                }
                KeyCode::Char(c) => {
                    app.mode = Mode::Input;
                    app.input_buffer.clear();
                    app.input_buffer.push(c);
                }
                _ => {}
            }
        }
        Pane::Events => {
            match key.code {
                KeyCode::Char('q') => {
                    app.mode = Mode::Confirm(ConfirmAction::Quit);
                }
                KeyCode::Char('Q') => {
                    app.should_quit = true;
                }
                KeyCode::Char('r') => {
                    if let Some(client) = ws {
                        let msg = OutgoingMessage::Command {
                            id: Uuid::new_v4().to_string(),
                            action: "hot_reload".to_string(),
                            key: None,
                        };
                        let _ = client.send(msg).await;
                    }
                }
                KeyCode::Char('R') => {
                    if let Some(client) = ws {
                        let msg = OutgoingMessage::Command {
                            id: Uuid::new_v4().to_string(),
                            action: "hot_restart".to_string(),
                            key: None,
                        };
                        let _ = client.send(msg).await;
                    }
                }
                KeyCode::Char('t') => {
                    if let Some(client) = ws {
                        let msg = OutgoingMessage::Command {
                            id: Uuid::new_v4().to_string(),
                            action: "get_tree".to_string(),
                            key: None,
                        };
                        let _ = client.send(msg).await;
                    }
                }
                KeyCode::Char(':') => {
                    app.mode = Mode::Command;
                    app.input_buffer.clear();
                }
                KeyCode::Char('/') => {
                    app.mode = Mode::Filter;
                    app.input_buffer.clear();
                }
                KeyCode::Char('?') => {
                    app.mode = Mode::Help;
                }
                KeyCode::Char('j') | KeyCode::Down => {
                    app.scroll_down();
                }
                KeyCode::Char('k') | KeyCode::Up => {
                    app.scroll_up();
                }
                KeyCode::Char('g') => {
                    app.scroll_offset = 0;
                }
                KeyCode::Char('G') => {
                    let count = app.filtered_events().count();
                    if count > 0 {
                        app.scroll_offset = count - 1;
                    }
                }
                KeyCode::Char('c') => {
                    app.clear_events();
                }
                KeyCode::Char('f') => {
                    app.filter = None;
                }
                KeyCode::Tab => {
                    app.selected_pane = if app.tree.is_some() {
                        Pane::Tree
                    } else {
                        Pane::Input
                    };
                }
                KeyCode::Esc => {
                    app.filter = None;
                }
                _ => {}
            }
        }
    }
    Ok(())
}

async fn handle_global_keys(app: &mut App, key: KeyEvent, _ws: &Option<WsClient>) -> Result<()> {
    match key.code {
        KeyCode::Char('q') => {
            app.mode = Mode::Confirm(ConfirmAction::Quit);
        }
        KeyCode::Char('Q') => {
            app.should_quit = true;
        }
        KeyCode::Char(':') => {
            app.mode = Mode::Command;
            app.input_buffer.clear();
        }
        KeyCode::Char('?') => {
            app.mode = Mode::Help;
        }
        _ => {}
    }
    Ok(())
}

async fn handle_command_mode(app: &mut App, key: KeyEvent, ws: &Option<WsClient>) -> Result<()> {
    match key.code {
        KeyCode::Esc => {
            app.mode = Mode::Normal;
            app.input_buffer.clear();
        }
        KeyCode::Enter => {
            let input = app.input_buffer.clone();
            app.input_buffer.clear();
            app.mode = Mode::Normal;

            if !input.is_empty() {
                execute_command(app, &input, ws).await?;
            }
        }
        KeyCode::Backspace => {
            app.input_buffer.pop();
        }
        KeyCode::Char(c) => {
            app.input_buffer.push(c);
        }
        _ => {}
    }
    Ok(())
}

fn handle_filter_mode(app: &mut App, key: KeyEvent) {
    match key.code {
        KeyCode::Esc => {
            app.mode = Mode::Normal;
            app.input_buffer.clear();
        }
        KeyCode::Enter => {
            if app.input_buffer.is_empty() {
                app.filter = None;
            } else {
                app.filter = Some(app.input_buffer.clone());
            }
            app.input_buffer.clear();
            app.mode = Mode::Normal;
            app.scroll_offset = 0;
        }
        KeyCode::Backspace => {
            app.input_buffer.pop();
        }
        KeyCode::Char(c) => {
            app.input_buffer.push(c);
        }
        _ => {}
    }
}

async fn handle_input_mode(app: &mut App, key: KeyEvent, ws: &Option<WsClient>) -> Result<()> {
    match key.code {
        KeyCode::Esc => {
            app.mode = Mode::Normal;
            app.input_buffer.clear();
            // Also cancel answer mode if we're in it
            if app.in_answer_mode() {
                app.cancel_answer_mode();
            }
        }
        KeyCode::Enter => {
            let input = app.input_buffer.clone();
            app.input_buffer.clear();
            app.mode = Mode::Normal;

            if !input.is_empty() {
                send_agent_message(app, ws, &input).await?;
            }
        }
        KeyCode::Backspace => {
            app.input_buffer.pop();
            if app.input_buffer.is_empty() {
                app.mode = Mode::Normal;
            }
        }
        KeyCode::Char(c) => {
            app.input_buffer.push(c);
        }
        _ => {}
    }
    Ok(())
}

async fn send_agent_message(app: &mut App, ws: &Option<WsClient>, intent: &str) -> Result<()> {
    if let Some(client) = ws {
        let is_answer = app.conversation_id.is_some();
        let msg = OutgoingMessage::AgentMessage {
            id: Uuid::new_v4().to_string(),
            intent: if is_answer { String::new() } else { intent.to_string() },
            answer: if is_answer { Some(intent.to_string()) } else { None },
            conversation_id: app.conversation_id.clone(),
        };
        app.pending_intent = Some(intent.to_string());
        app.pending_response = true;
        app.last_agent_error = None;
        let _ = client.send(msg).await;
    }
    Ok(())
}

fn handle_help_mode(app: &mut App, key: KeyEvent) {
    match key.code {
        KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('?') => {
            app.mode = Mode::Normal;
        }
        _ => {}
    }
}

fn handle_confirm_mode(app: &mut App, key: KeyEvent, action: ConfirmAction) {
    match key.code {
        KeyCode::Char('y') | KeyCode::Char('Y') => match action {
            ConfirmAction::Quit => {
                app.should_quit = true;
            }
        },
        KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
            app.mode = Mode::Normal;
        }
        _ => {}
    }
}

async fn execute_command(app: &mut App, input: &str, ws: &Option<WsClient>) -> Result<()> {
    let command = parse_command(input);

    match command {
        TuiCommand::Quit => {
            app.should_quit = true;
        }
        TuiCommand::Reload => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    action: "hot_reload".to_string(),
                    key: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Restart => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    action: "hot_restart".to_string(),
                    key: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Run { project, device } => {
            if let Some(client) = ws {
                let mut data = serde_json::json!({});
                if let Some(p) = project {
                    data["projectPath"] = p.into();
                }
                if let Some(d) = device {
                    data["device"] = d.into();
                }
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    action: "run".to_string(),
                    key: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Stop => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    action: "stop".to_string(),
                    key: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Status => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    action: "status".to_string(),
                    key: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Tree => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    action: "get_tree".to_string(),
                    key: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Filter(pattern) => {
            app.filter = pattern;
            app.scroll_offset = 0;
        }
        TuiCommand::Clear => {
            app.clear_events();
        }
        TuiCommand::Agent { intent, answer } => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::AgentMessage {
                    id: Uuid::new_v4().to_string(),
                    intent,
                    answer,
                    conversation_id: app.conversation_id.clone(),
                };
                app.pending_response = true;
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Help => {
            app.mode = Mode::Help;
        }
        TuiCommand::Unknown(cmd) => {
            tracing::warn!("Unknown command: {}", cmd);
        }
    }

    Ok(())
}

fn handle_ws_event(app: &mut App, event: WsEvent) {
    match event {
        WsEvent::Connected { instance_id } => {
            app.ws_state = WsState::Connected;
            app.instance_id = instance_id;
        }
        WsEvent::Disconnected => {
            app.ws_state = WsState::Disconnected;
            app.instance_id = None;
        }
        WsEvent::Error(e) => {
            tracing::error!("WebSocket error: {}", e);
        }
        WsEvent::Message(msg) => match msg {
            IncomingMessage::CommandResponse(resp) => {
                app.handle_command_response(resp);
            }
            IncomingMessage::AgentResponse(resp) => {
                app.handle_agent_response(resp);
            }
            IncomingMessage::Event(event) => {
                app.push_event(event);
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_filter_mode_enter_applies_filter() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100);
        app.mode = Mode::Filter;
        app.input_buffer = "flutter".to_string();

        handle_filter_mode(&mut app, KeyEvent::from(KeyCode::Enter));

        assert_eq!(app.filter, Some("flutter".to_string()));
        assert_eq!(app.mode, Mode::Normal);
        assert!(app.input_buffer.is_empty());
    }

    #[test]
    fn test_handle_filter_mode_empty_clears_filter() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100);
        app.mode = Mode::Filter;
        app.filter = Some("old".to_string());
        app.input_buffer.clear();

        handle_filter_mode(&mut app, KeyEvent::from(KeyCode::Enter));

        assert!(app.filter.is_none());
        assert_eq!(app.mode, Mode::Normal);
    }

    #[test]
    fn test_handle_confirm_mode_yes_quits() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100);
        app.mode = Mode::Confirm(ConfirmAction::Quit);

        handle_confirm_mode(&mut app, KeyEvent::from(KeyCode::Char('y')), ConfirmAction::Quit);

        assert!(app.should_quit);
    }

    #[test]
    fn test_handle_confirm_mode_no_cancels() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100);
        app.mode = Mode::Confirm(ConfirmAction::Quit);

        handle_confirm_mode(&mut app, KeyEvent::from(KeyCode::Char('n')), ConfirmAction::Quit);

        assert!(!app.should_quit);
        assert_eq!(app.mode, Mode::Normal);
    }

    #[test]
    fn test_handle_help_mode_escape_returns_to_normal() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100);
        app.mode = Mode::Help;

        handle_help_mode(&mut app, KeyEvent::from(KeyCode::Esc));

        assert_eq!(app.mode, Mode::Normal);
    }

    #[test]
    fn test_handle_ws_event_connected() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100);
        app.ws_state = WsState::Connecting;

        handle_ws_event(
            &mut app,
            WsEvent::Connected {
                instance_id: Some("test-123".to_string()),
            },
        );

        assert_eq!(app.ws_state, WsState::Connected);
        assert_eq!(app.instance_id, Some("test-123".to_string()));
    }

    #[test]
    fn test_handle_ws_event_disconnected() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100);
        app.ws_state = WsState::Connected;
        app.instance_id = Some("test-123".to_string());

        handle_ws_event(&mut app, WsEvent::Disconnected);

        assert_eq!(app.ws_state, WsState::Disconnected);
        assert!(app.instance_id.is_none());
    }
}
