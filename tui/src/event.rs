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

use crate::app::{App, ConfirmAction, ContentTab, InputPromptKind, InteractionAction, Mode, WsState};
use tui_menu::MenuEvent;
use crate::ws::protocol::Session;
use crate::commands::{parse_command, TuiCommand};
use crate::ui;
use crate::ws::client::{WsClient, WsEvent};
use crate::ws::protocol::{IncomingMessage, OutgoingMessage, SessionSummary};

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
            // Sessions are received from ServerHello, no need to request them
            Some(client)
        }
        Err(e) => {
            app.ws_state = WsState::Disconnected;
            app.push_toast(crate::app::Toast::error(format!("Connection failed: {}", e)));
            tracing::error!("Failed to connect to WebSocket: {}", e);
            None
        }
    };

    loop {
        // Expire old toasts and tick throbber
        app.expire_toasts();
        app.throbber_state.calc_next();

        // Auto-fetch tree if needed
        if app.needs_tree_fetch {
            app.needs_tree_fetch = false;
            if let Some(ref client) = ws_client {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "get_tree".to_string(),
                    key: None,
                    data: None,
                };
                let _ = client.send(msg).await;
            }
        }

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
        Mode::Filter => handle_filter_mode(app, key),
        Mode::Help => handle_help_mode(app, key),
        Mode::Confirm(action) => handle_confirm_mode(app, key, action.clone()),
        Mode::SessionPicker => handle_session_picker_mode(app, key, ws).await?,
        Mode::InputPrompt(kind) => handle_input_prompt_mode(app, key, ws, kind.clone()).await?,
        Mode::ActionMenu => handle_action_menu_mode(app, key, ws).await?,
    }

    Ok(())
}

fn handle_mouse_event(app: &mut App, mouse: MouseEvent) {
    match mouse.kind {
        MouseEventKind::ScrollUp => {
            if app.content_tab == ContentTab::Tree {
                app.tree_up();
            } else {
                app.scroll_up();
            }
        }
        MouseEventKind::ScrollDown => {
            if app.content_tab == ContentTab::Tree {
                app.tree_down();
            } else {
                app.scroll_down();
            }
        }
        MouseEventKind::Down(MouseButton::Left) => {
            // Future: could detect click position to switch tabs
        }
        _ => {}
    }
}

async fn handle_normal_mode(app: &mut App, key: KeyEvent, ws: &Option<WsClient>) -> Result<()> {
    // Tree tab has special navigation (tree_up/down instead of scroll)
    let on_tree_tab = app.content_tab == ContentTab::Tree;
    let on_flutter_tab = app.content_tab == ContentTab::Flutter;

    match key.code {
        KeyCode::Char('q') => {
            app.mode = Mode::Confirm(ConfirmAction::Quit);
        }
        KeyCode::Char('Q') => {
            app.should_quit = true;
        }
        // Flutter-tab specific: hot reload
        KeyCode::Char('r') if on_flutter_tab => {
            if app.is_app_running() {
                if let Some(client) = ws {
                    let msg = OutgoingMessage::Command {
                        id: Uuid::new_v4().to_string(),
                        client_id: client.client_id().to_string(),
                        action: "hot_reload".to_string(),
                        key: None,
                        data: None,
                    };
                    let _ = client.send(msg).await;
                    app.push_toast(crate::app::Toast::info("Hot reload triggered"));
                }
            }
        }
        // Flutter-tab specific: hot restart
        KeyCode::Char('R') if on_flutter_tab => {
            if app.is_app_running() {
                if let Some(client) = ws {
                    let msg = OutgoingMessage::Command {
                        id: Uuid::new_v4().to_string(),
                        client_id: client.client_id().to_string(),
                        action: "hot_restart".to_string(),
                        key: None,
                        data: None,
                    };
                    let _ = client.send(msg).await;
                    app.push_toast(crate::app::Toast::info("Hot restart triggered"));
                }
            }
        }
        // Flutter-tab specific: run app
        KeyCode::Char('p') if on_flutter_tab => {
            if !app.is_app_running() && app.has_session() {
                app.mode = Mode::InputPrompt(InputPromptKind::RunApp);
                app.input_buffer.clear();
            }
        }
        // Flutter-tab specific: stop app
        KeyCode::Char('x') if on_flutter_tab => {
            if app.is_app_running() {
                if let Some(client) = ws {
                    let msg = OutgoingMessage::Command {
                        id: Uuid::new_v4().to_string(),
                        client_id: client.client_id().to_string(),
                        action: "stop_app".to_string(),
                        key: None,
                        data: None,
                    };
                    let _ = client.send(msg).await;
                }
            }
        }
        // Tree-tab specific: tap interaction
        KeyCode::Char('t') if on_tree_tab => {
            if app.selected_node_capabilities().contains(&"tap".to_string()) {
                if let Some(node_id) = app.selected_node_id() {
                    execute_interaction(app, ws, &node_id, "tap", None).await?;
                }
            }
        }
        // Tree-tab specific: longPress interaction (using 'L' to not conflict with tab nav)
        KeyCode::Char('L') if on_tree_tab => {
            if app.selected_node_capabilities().contains(&"longPress".to_string()) {
                if let Some(node_id) = app.selected_node_id() {
                    execute_interaction(app, ws, &node_id, "longPress", None).await?;
                }
            }
        }
        // Tree-tab specific: actions menu
        KeyCode::Char('a') if on_tree_tab => {
            app.show_action_menu();
        }
        // Filter mode (not on tree tab where it would conflict)
        KeyCode::Char('/') if !on_tree_tab => {
            app.mode = Mode::Filter;
            app.input_buffer.clear();
        }
        KeyCode::Char('?') => {
            app.mode = Mode::Help;
        }
        KeyCode::Char('j') | KeyCode::Down => {
            if on_tree_tab {
                app.tree_down();
            } else {
                app.scroll_down();
            }
        }
        KeyCode::Char('k') | KeyCode::Up => {
            if on_tree_tab {
                app.tree_up();
            } else {
                app.scroll_up();
            }
        }
        KeyCode::Char('g') if !on_tree_tab => {
            app.scroll_offset = 0;
        }
        KeyCode::Char('G') if !on_tree_tab => {
            let count = current_event_count(app);
            if count > 0 {
                app.scroll_offset = count - 1;
            }
        }
        // Clear events (not on tree tab)
        KeyCode::Char('c') if !on_tree_tab => {
            app.clear_events();
        }
        KeyCode::Char('f') if !on_tree_tab => {
            app.filter = None;
        }
        // Tab navigation: h/l always switch tabs (except on tree tab where l is used for longPress)
        KeyCode::Char('l') if !on_tree_tab => {
            app.next_tab();
            maybe_fetch_tree(app, ws).await;
        }
        KeyCode::Char('h') => {
            app.prev_tab();
            maybe_fetch_tree(app, ws).await;
        }
        KeyCode::Right => {
            if on_tree_tab {
                app.tree_right(); // Expand node
            } else {
                app.next_tab();
                maybe_fetch_tree(app, ws).await;
            }
        }
        KeyCode::Left => {
            if on_tree_tab {
                app.tree_left(); // Collapse node
            } else {
                app.prev_tab();
                maybe_fetch_tree(app, ws).await;
            }
        }
        KeyCode::Tab => {
            app.next_tab();
            maybe_fetch_tree(app, ws).await;
        }
        KeyCode::BackTab => {
            app.prev_tab();
            maybe_fetch_tree(app, ws).await;
        }
        KeyCode::Enter | KeyCode::Char(' ') if on_tree_tab => {
            app.tree_toggle();
        }
        KeyCode::Char('s') => {
            app.mode = Mode::SessionPicker;
        }
        KeyCode::Esc => {
            app.filter = None;
        }
        _ => {}
    }
    Ok(())
}

async fn execute_interaction(
    app: &mut App,
    ws: &Option<WsClient>,
    node_id: &str,
    interaction: &str,
    args: Option<serde_json::Value>,
) -> Result<()> {
    if let Some(client) = ws {
        let mut data = serde_json::json!({
            "nodeId": node_id,
            "interaction": interaction,
        });
        if let Some(args) = args {
            data["args"] = args;
        }
        let msg = OutgoingMessage::Command {
            id: Uuid::new_v4().to_string(),
            client_id: client.client_id().to_string(),
            action: "execute_interaction".to_string(),
            key: None,
            data: Some(data),
        };
        let _ = client.send(msg).await;
        app.push_toast(crate::app::Toast::info(format!("{} on {}", interaction, node_id)));
    }
    Ok(())
}

async fn maybe_fetch_tree(app: &mut App, ws: &Option<WsClient>) {
    if app.content_tab == ContentTab::Tree && app.session.tree.is_none() && app.is_app_running() {
        if let Some(client) = ws {
            let msg = OutgoingMessage::Command {
                id: Uuid::new_v4().to_string(),
                client_id: client.client_id().to_string(),
                action: "get_tree".to_string(),
                key: None,
                data: None,
            };
            let _ = client.send(msg).await;
        }
    }
}

async fn handle_action_menu_mode(
    app: &mut App,
    key: KeyEvent,
    ws: &Option<WsClient>,
) -> Result<()> {
    match key.code {
        KeyCode::Esc | KeyCode::Char('q') => {
            app.action_menu.reset();
            app.action_menu_node_id = None;
            app.mode = Mode::Normal;
        }
        KeyCode::Char('j') | KeyCode::Down => {
            app.action_menu.down();
        }
        KeyCode::Char('k') | KeyCode::Up => {
            app.action_menu.up();
        }
        KeyCode::Char('h') | KeyCode::Left => {
            app.action_menu.left();
        }
        KeyCode::Char('l') | KeyCode::Right => {
            app.action_menu.right();
        }
        KeyCode::Enter => {
            app.action_menu.select();
        }
        _ => {}
    }

    // Process menu events
    for event in app.action_menu.drain_events() {
        match event {
            MenuEvent::Selected(action) => {
                if let Some(node_id) = app.action_menu_node_id.clone() {
                    match action {
                        InteractionAction::Tap => {
                            execute_interaction(app, ws, &node_id, "tap", None).await?;
                        }
                        InteractionAction::LongPress => {
                            execute_interaction(app, ws, &node_id, "longPress", None).await?;
                        }
                        InteractionAction::DoubleTap => {
                            execute_interaction(app, ws, &node_id, "doubleTap", None).await?;
                        }
                        InteractionAction::Scroll { dx, dy } => {
                            execute_interaction(
                                app,
                                ws,
                                &node_id,
                                "scroll",
                                Some(serde_json::json!({ "dx": dx, "dy": dy })),
                            )
                            .await?;
                        }
                        InteractionAction::EnterText(_) => {
                            // TODO: Show text input prompt
                            app.push_toast(crate::app::Toast::info("Enter text not implemented yet"));
                        }
                        InteractionAction::Custom(action_name) => {
                            execute_interaction(
                                app,
                                ws,
                                &node_id,
                                &action_name,
                                None,
                            )
                            .await?;
                        }
                    }
                }
                app.action_menu.reset();
                app.action_menu_node_id = None;
                app.mode = Mode::Normal;
            }
        }
    }

    Ok(())
}

// Command mode - currently unused, hotkey-driven UI instead
/*
async fn handle_command_mode(app: &mut App, key: KeyEvent, ws: &Option<WsClient>) -> Result<()> {
    match key.code {
        KeyCode::Esc => {
            app.mode = Mode::Normal;
            app.input_buffer.clear();
            app.completions.clear();
            app.completion_index = 0;
        }
        KeyCode::Tab => {
            if app.completions.is_empty() {
                app.update_completions();
            } else {
                app.cycle_completion_next();
            }
        }
        KeyCode::Char('n') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            if !app.completions.is_empty() {
                app.cycle_completion_next();
            }
        }
        KeyCode::Char('p') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            if !app.completions.is_empty() {
                app.cycle_completion_prev();
            }
        }
        KeyCode::Enter => {
            if !app.completions.is_empty() {
                app.accept_completion();
            } else {
                let input = app.input_buffer.clone();
                app.input_buffer.clear();
                app.completions.clear();
                app.completion_index = 0;
                app.mode = Mode::Normal;

                if !input.is_empty() {
                    execute_command(app, &input, ws).await?;
                }
            }
        }
        KeyCode::Backspace => {
            app.input_buffer.pop();
            app.update_completions();
        }
        KeyCode::Char(c) => {
            app.input_buffer.push(c);
            app.update_completions();
        }
        _ => {}
    }
    Ok(())
}
*/

fn handle_filter_mode(app: &mut App, key: KeyEvent) {
    match key.code {
        KeyCode::Esc => {
            // Cancel: clear filter and input
            app.filter = None;
            app.input_buffer.clear();
            app.mode = Mode::Normal;
            app.scroll_offset = 0;
        }
        KeyCode::Enter => {
            // Finish: keep current filter, exit filter mode
            app.input_buffer.clear();
            app.mode = Mode::Normal;
        }
        KeyCode::Backspace => {
            app.input_buffer.pop();
            // Apply filter live
            app.filter = if app.input_buffer.is_empty() {
                None
            } else {
                Some(app.input_buffer.clone())
            };
            app.scroll_offset = 0;
        }
        KeyCode::Char(c) => {
            app.input_buffer.push(c);
            // Apply filter live
            app.filter = Some(app.input_buffer.clone());
            app.scroll_offset = 0;
        }
        _ => {}
    }
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

async fn handle_session_picker_mode(
    app: &mut App,
    key: KeyEvent,
    ws: &Option<WsClient>,
) -> Result<()> {
    match key.code {
        KeyCode::Char('j') | KeyCode::Down => {
            app.session_picker_down();
        }
        KeyCode::Char('k') | KeyCode::Up => {
            app.session_picker_up();
        }
        KeyCode::Enter => {
            // Get session ID before calling select (which will modify state)
            let session_id = app
                .sessions
                .get(app.session_picker_index)
                .map(|s| s.id.clone());

            // Only send connect command if we're actually switching sessions
            if app.session_picker_select() {
                if let (Some(session_id), Some(client)) = (session_id, ws) {
                    let msg = OutgoingMessage::Command {
                        id: Uuid::new_v4().to_string(),
                        client_id: client.client_id().to_string(),
                        action: "connect_session".to_string(),
                        key: None,
                        data: Some(serde_json::json!({ "sessionId": session_id })),
                    };
                    let _ = client.send(msg).await;
                }
            }
        }
        KeyCode::Esc | KeyCode::Char('q') => {
            app.mode = Mode::Normal;
        }
        // Create new session
        KeyCode::Char('c') => {
            app.input_buffer.clear();
            app.mode = Mode::InputPrompt(InputPromptKind::CreateSession);
        }
        // Delete selected session
        KeyCode::Char('d') | KeyCode::Char('x') => {
            if let Some(session) = app.sessions.get(app.session_picker_index) {
                if let Some(client) = ws {
                    let msg = OutgoingMessage::Command {
                        id: Uuid::new_v4().to_string(),
                        client_id: client.client_id().to_string(),
                        action: "destroy_session".to_string(),
                        key: None,
                        data: Some(serde_json::json!({ "sessionId": session.id })),
                    };
                    let _ = client.send(msg).await;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

async fn handle_input_prompt_mode(
    app: &mut App,
    key: KeyEvent,
    ws: &Option<WsClient>,
    kind: InputPromptKind,
) -> Result<()> {
    match key.code {
        KeyCode::Esc => {
            app.input_buffer.clear();
            // Return to appropriate mode
            match kind {
                InputPromptKind::CreateSession => app.mode = Mode::SessionPicker,
                InputPromptKind::RunApp => app.mode = Mode::Normal,
            }
        }
        KeyCode::Enter => {
            let input = app.input_buffer.clone();
            app.input_buffer.clear();

            match kind {
                InputPromptKind::CreateSession => {
                    if !input.is_empty() {
                        if let Some(client) = ws {
                            // Use project path from app.project
                            let project_path = app.project.path.to_string_lossy().to_string();
                            let msg = OutgoingMessage::Command {
                                id: Uuid::new_v4().to_string(),
                                client_id: client.client_id().to_string(),
                                action: "create_session".to_string(),
                                key: None,
                                data: Some(serde_json::json!({
                                    "name": input,
                                    "projectPath": project_path,
                                })),
                            };
                            let _ = client.send(msg).await;
                        }
                    }
                    app.mode = Mode::SessionPicker;
                }
                InputPromptKind::RunApp => {
                    if let Some(client) = ws {
                        if let Some(ref session_id) = app.selected_session {
                            // Device is optional - empty string means default device
                            let mut data = serde_json::json!({ "sessionId": session_id });
                            if !input.is_empty() {
                                data["device"] = serde_json::json!(input);
                            }
                            let msg = OutgoingMessage::Command {
                                id: Uuid::new_v4().to_string(),
                                client_id: client.client_id().to_string(),
                                action: "run_app".to_string(),
                                key: None,
                                data: Some(data),
                            };
                            let _ = client.send(msg).await;
                        } else {
                            app.push_toast(crate::app::Toast::error("No session selected"));
                        }
                    }
                    app.mode = Mode::Normal;
                }
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

fn current_event_count(app: &App) -> usize {
    use crate::app::ContentTab;
    match app.content_tab {
        ContentTab::Flutter => app.filtered_flutter_logs().count(),
        ContentTab::Agent => app.filtered_agent_events().count(),
        ContentTab::Interactions => app.filtered_interaction_logs().count(),
        ContentTab::Tree => 0, // Tree uses tree_state, not scroll_offset
    }
}

// Keep execute_command for potential future use, but it's not used in hotkey-driven UI
#[allow(dead_code)]
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
                    client_id: client.client_id().to_string(),
                    action: "hot_reload".to_string(),
                    key: None,
                    data: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Restart => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "hot_restart".to_string(),
                    key: None,
                    data: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Run { device } => {
            if let Some(client) = ws {
                let data = device.map(|d| serde_json::json!({ "device": d }));
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "run_app".to_string(),
                    key: None,
                    data,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Stop => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "stop_app".to_string(),
                    key: None,
                    data: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Status => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "get_status".to_string(),
                    key: None,
                    data: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Tree => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "get_tree".to_string(),
                    key: None,
                    data: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::CreateSession { name, project_path } => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "create_session".to_string(),
                    key: None,
                    data: Some(serde_json::json!({
                        "name": name,
                        "projectPath": project_path,
                    })),
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::ListSessions => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "list_sessions".to_string(),
                    key: None,
                    data: None,
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::Connect { session } => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "connect_session".to_string(),
                    key: None,
                    data: Some(serde_json::json!({ "sessionId": session })),
                };
                let _ = client.send(msg).await;
            }
        }
        TuiCommand::DestroySession { session } => {
            if let Some(client) = ws {
                let msg = OutgoingMessage::Command {
                    id: Uuid::new_v4().to_string(),
                    client_id: client.client_id().to_string(),
                    action: "destroy_session".to_string(),
                    key: None,
                    data: Some(serde_json::json!({ "sessionId": session })),
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
                    client_id: client.client_id().to_string(),
                    intent,
                    answer,
                    conversation_id: app.session.conversation_id.clone(),
                };
                app.session.pending_response = true;
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
        WsEvent::Connected {
            client_id: _,
            daemon_version,
            sessions,
        } => {
            app.ws_state = WsState::Connected;
            tracing::info!("Connected to daemon v{}", daemon_version);
            // Convert SessionSummary to Session for the app
            let sessions: Vec<Session> = sessions
                .into_iter()
                .map(|s| session_from_summary(s))
                .collect();
            app.set_sessions(sessions);
        }
        WsEvent::Disconnected => {
            app.ws_state = WsState::Disconnected;
            app.push_toast(crate::app::Toast::error("Disconnected from server"));
        }
        WsEvent::Error(e) => {
            tracing::error!("WebSocket error: {}", e);
            app.push_toast(crate::app::Toast::error(format!("WebSocket: {}", e)));
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

fn session_from_summary(s: SessionSummary) -> Session {
    Session {
        id: s.id,
        name: s.name,
        project_path: s.project_path,
        app_status: s.app_status,
        vm_service_uri: None,
        pid: None,
        connected_clients: Vec::new(),
        created_at: String::new(),
        last_active_at: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::project::ProjectInfo;

    fn test_project() -> ProjectInfo {
        ProjectInfo {
            path: PathBuf::from("/test/project"),
            name: "test_app".to_string(),
            is_flutter: true,
        }
    }

    #[test]
    fn test_handle_filter_mode_enter_applies_filter() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100, test_project());
        app.mode = Mode::Filter;
        app.input_buffer = "flutter".to_string();
        // Filter is applied live while typing, so set it to match
        app.filter = Some("flutter".to_string());

        handle_filter_mode(&mut app, KeyEvent::from(KeyCode::Enter));

        // Enter keeps the current filter (which was already applied live)
        assert_eq!(app.filter, Some("flutter".to_string()));
        assert_eq!(app.mode, Mode::Normal);
        assert!(app.input_buffer.is_empty());
    }

    #[test]
    fn test_handle_filter_mode_empty_clears_filter() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100, test_project());
        app.mode = Mode::Filter;
        // When input is empty, filter should already be None (live update)
        app.filter = None;
        app.input_buffer.clear();

        handle_filter_mode(&mut app, KeyEvent::from(KeyCode::Enter));

        // Enter just exits filter mode, keeping filter as-is (None when empty)
        assert!(app.filter.is_none());
        assert_eq!(app.mode, Mode::Normal);
    }

    #[test]
    fn test_handle_confirm_mode_yes_quits() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100, test_project());
        app.mode = Mode::Confirm(ConfirmAction::Quit);

        handle_confirm_mode(&mut app, KeyEvent::from(KeyCode::Char('y')), ConfirmAction::Quit);

        assert!(app.should_quit);
    }

    #[test]
    fn test_handle_confirm_mode_no_cancels() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100, test_project());
        app.mode = Mode::Confirm(ConfirmAction::Quit);

        handle_confirm_mode(&mut app, KeyEvent::from(KeyCode::Char('n')), ConfirmAction::Quit);

        assert!(!app.should_quit);
        assert_eq!(app.mode, Mode::Normal);
    }

    #[test]
    fn test_handle_help_mode_escape_returns_to_normal() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100, test_project());
        app.mode = Mode::Help;

        handle_help_mode(&mut app, KeyEvent::from(KeyCode::Esc));

        assert_eq!(app.mode, Mode::Normal);
    }

    #[test]
    fn test_handle_ws_event_connected() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100, test_project());
        app.ws_state = WsState::Connecting;

        handle_ws_event(
            &mut app,
            WsEvent::Connected {
                client_id: "test-client-123".to_string(),
                daemon_version: "0.1.0".to_string(),
                sessions: vec![],
            },
        );

        assert_eq!(app.ws_state, WsState::Connected);
    }

    #[test]
    fn test_handle_ws_event_disconnected() {
        let mut app = App::new("ws://localhost:9000".to_string(), 100, test_project());
        app.ws_state = WsState::Connected;

        handle_ws_event(&mut app, WsEvent::Disconnected);

        assert_eq!(app.ws_state, WsState::Disconnected);
    }
}
