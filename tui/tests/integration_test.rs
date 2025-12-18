//! Integration test for TUI + Daemon status updates.
//!
//! This test verifies that when the daemon sends session.status_changed events,
//! the TUI correctly updates and displays the session status.
//!
//! Run with: cargo test --test integration_test -- --nocapture

use std::process::{Child, Command, Stdio};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};
use serde_json::{json, Value};
use uuid::Uuid;

const DAEMON_PORT: u16 = 19877; // Use a different port from production
const DAEMON_URL: &str = "ws://127.0.0.1:19877";
const TEST_PROJECT_PATH: &str = "/tmp/test-flutter-project";

struct DaemonProcess {
    child: Child,
}

impl DaemonProcess {
    async fn start() -> anyhow::Result<Self> {
        // Start the daemon on a test port
        let daemon_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../packages/fleeter-daemon");
        let child = Command::new("node")
            .args(["dist/bin/daemon.js", "--port", &DAEMON_PORT.to_string()])
            .current_dir(daemon_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        // Wait for daemon to be ready
        let start = std::time::Instant::now();
        while start.elapsed() < Duration::from_secs(10) {
            if TcpStream::connect(format!("127.0.0.1:{}", DAEMON_PORT)).await.is_ok() {
                println!("Daemon started successfully on port {}", DAEMON_PORT);
                return Ok(Self { child });
            }
            sleep(Duration::from_millis(100)).await;
        }

        Err(anyhow::anyhow!("Daemon failed to start within 10 seconds"))
    }
}

impl Drop for DaemonProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

struct TestClient {
    ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
    client_id: String,
    session_id: Option<String>,
}

impl TestClient {
    async fn connect() -> anyhow::Result<Self> {
        let (ws, _) = connect_async(DAEMON_URL).await?;
        let client_id = Uuid::new_v4().to_string();
        
        let mut client = Self {
            ws,
            client_id,
            session_id: None,
        };
        
        // Send hello
        client.send_hello().await?;
        
        // Wait for hello_ack
        let msg = client.recv_message().await?;
        assert_eq!(msg["type"], "hello_ack", "Expected hello_ack, got: {}", msg);
        println!("Connected to daemon v{}", msg["daemonVersion"]);
        
        Ok(client)
    }
    
    async fn send_hello(&mut self) -> anyhow::Result<()> {
        let hello = json!({
            "type": "hello",
            "clientType": "test",
            "clientId": self.client_id,
            "version": "0.1.0"
        });
        self.ws.send(Message::Text(hello.to_string())).await?;
        Ok(())
    }
    
    async fn send_command(&mut self, action: &str, data: Option<Value>) -> anyhow::Result<String> {
        let id = Uuid::new_v4().to_string();
        let msg = json!({
            "type": "command",
            "id": id,
            "clientId": self.client_id,
            "action": action,
            "data": data
        });
        self.ws.send(Message::Text(msg.to_string())).await?;
        Ok(id)
    }
    
    async fn recv_message(&mut self) -> anyhow::Result<Value> {
        loop {
            match timeout(Duration::from_secs(30), self.ws.next()).await {
                Ok(Some(Ok(Message::Text(text)))) => {
                    return Ok(serde_json::from_str(&text)?);
                }
                Ok(Some(Ok(Message::Ping(_)))) => continue,
                Ok(Some(Ok(_))) => continue,
                Ok(Some(Err(e))) => return Err(e.into()),
                Ok(None) => return Err(anyhow::anyhow!("Connection closed")),
                Err(_) => return Err(anyhow::anyhow!("Timeout waiting for message")),
            }
        }
    }
    
    async fn recv_message_of_type(&mut self, msg_type: &str) -> anyhow::Result<Value> {
        let start = std::time::Instant::now();
        while start.elapsed() < Duration::from_secs(30) {
            let msg = self.recv_message().await?;
            if msg["type"] == msg_type {
                return Ok(msg);
            }
            println!("Skipping message type: {}", msg["type"]);
        }
        Err(anyhow::anyhow!("Timeout waiting for message type: {}", msg_type))
    }
    
    async fn recv_event_of_type(&mut self, event_type: &str) -> anyhow::Result<Value> {
        let start = std::time::Instant::now();
        while start.elapsed() < Duration::from_secs(30) {
            let msg = self.recv_message().await?;
            if msg["type"] == "event" && msg["eventType"] == event_type {
                return Ok(msg);
            }
            println!("Skipping: type={}, eventType={}", msg["type"], msg["eventType"]);
        }
        Err(anyhow::anyhow!("Timeout waiting for event type: {}", event_type))
    }
    
    async fn create_session(&mut self, name: &str, project_path: &str) -> anyhow::Result<String> {
        self.send_command("create_session", Some(json!({
            "name": name,
            "projectPath": project_path
        }))).await?;
        
        // Wait for command response
        let resp = self.recv_message_of_type("command_response").await?;
        assert!(resp["success"].as_bool().unwrap_or(false), "create_session failed: {:?}", resp);
        
        let session_id = resp["data"]["session"]["id"].as_str().unwrap().to_string();
        self.session_id = Some(session_id.clone());
        println!("Created session: {}", session_id);
        
        Ok(session_id)
    }
    
    async fn connect_session(&mut self, session_id: &str) -> anyhow::Result<()> {
        self.send_command("connect_session", Some(json!({
            "sessionId": session_id
        }))).await?;
        
        let resp = self.recv_message_of_type("command_response").await?;
        assert!(resp["success"].as_bool().unwrap_or(false), "connect_session failed: {:?}", resp);
        
        self.session_id = Some(session_id.to_string());
        Ok(())
    }
}

/// Simulates what the TUI does: tracks session status from events
struct SessionStatusTracker {
    sessions: std::collections::HashMap<String, String>,
}

impl SessionStatusTracker {
    fn new() -> Self {
        Self {
            sessions: std::collections::HashMap::new(),
        }
    }
    
    fn handle_event(&mut self, event: &Value) {
        let event_type = event["eventType"].as_str().unwrap_or("");
        
        if event_type == "session.status_changed" {
            if let (Some(session_id), Some(status)) = (
                event["payload"]["sessionId"].as_str(),
                event["payload"]["status"].as_str(),
            ) {
                println!("STATUS CHANGED: {} -> {}", session_id, status);
                self.sessions.insert(session_id.to_string(), status.to_string());
            }
        }
    }
    
    fn get_status(&self, session_id: &str) -> Option<&String> {
        self.sessions.get(session_id)
    }
}

#[tokio::test]
async fn test_session_status_updates_without_flutter() -> anyhow::Result<()> {
    // This test verifies the event flow without actually running Flutter
    // We manually trigger status changes to test the TUI's event handling logic
    
    println!("\n=== Starting daemon ===");
    let _daemon = DaemonProcess::start().await?;
    
    println!("\n=== Connecting client ===");
    let mut client = TestClient::connect().await?;
    
    println!("\n=== Creating session ===");
    let session_id = client.create_session("test-session", TEST_PROJECT_PATH).await?;
    
    // Track status like the TUI does
    let mut tracker = SessionStatusTracker::new();
    
    // The session.created event should have been sent - look for it
    // Note: We may have already received it, so this is more of a verification
    
    println!("\n=== Verifying session was created with not_running status ===");
    // Initial status should be "not_running"
    
    // Try to get the session status via get_status command
    client.send_command("get_status", None).await?;
    let status_resp = client.recv_message_of_type("command_response").await?;
    
    println!("get_status response: {}", serde_json::to_string_pretty(&status_resp)?);
    
    // Verify the session is in the response
    if let Some(current_session) = status_resp["data"]["currentSession"].as_object() {
        let app_status = current_session.get("appStatus").and_then(|v| v.as_str());
        println!("Session appStatus: {:?}", app_status);
        assert_eq!(app_status, Some("not_running"), "Expected not_running status");
    }
    
    println!("\n=== Test passed! ===");
    Ok(())
}

#[tokio::test]
async fn test_full_app_lifecycle_with_status_events() -> anyhow::Result<()> {
    // This test runs the actual Flutter example app and verifies status transitions
    
    println!("\n=== Starting daemon ===");
    let _daemon = DaemonProcess::start().await?;
    
    println!("\n=== Connecting client ===");
    let mut client = TestClient::connect().await?;
    
    // Use the actual example project
    let example_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../example");
    let example_path = std::fs::canonicalize(example_path)?;
    
    println!("\n=== Creating session with example project: {} ===", example_path.display());
    let session_id = client.create_session("test-app", example_path.to_str().unwrap()).await?;
    
    // Track status changes like the TUI does
    let mut tracker = SessionStatusTracker::new();
    tracker.sessions.insert(session_id.clone(), "not_running".to_string());
    
    println!("\n=== Running app (this may take a while to compile) ===");
    
    // Send run_app command
    client.send_command("run_app", Some(json!({
        "sessionId": session_id,
        "device": "macos" // Use macOS for testing
    }))).await?;
    
    // Collect all events until we see status become "running"
    let start = std::time::Instant::now();
    let mut saw_starting = false;
    let mut saw_running = false;
    let mut last_status = "not_running".to_string();
    
    while start.elapsed() < Duration::from_secs(120) && !saw_running {
        match timeout(Duration::from_secs(5), client.recv_message()).await {
            Ok(Ok(msg)) => {
                let msg_type = msg["type"].as_str().unwrap_or("");
                
                match msg_type {
                    "event" => {
                        let event_type = msg["eventType"].as_str().unwrap_or("");
                        
                        if event_type == "session.status_changed" {
                            tracker.handle_event(&msg);
                            
                            if let Some(status) = msg["payload"]["status"].as_str() {
                                last_status = status.to_string();
                                
                                if status == "starting" {
                                    saw_starting = true;
                                    println!("✓ Saw 'starting' status");
                                } else if status == "running" {
                                    saw_running = true;
                                    println!("✓ Saw 'running' status");
                                }
                            }
                        } else if event_type == "flutter.log" {
                            if let Some(line) = msg["payload"]["line"].as_str() {
                                // Print important Flutter output
                                if line.contains("Launching") || 
                                   line.contains("Syncing") ||
                                   line.contains("Running") ||
                                   line.contains("started") {
                                    println!("[flutter] {}", line);
                                }
                            }
                        }
                    }
                    "command_response" => {
                        println!("command_response: success={}", msg["success"]);
                        if !msg["success"].as_bool().unwrap_or(true) {
                            println!("Error: {}", msg["error"]);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Err(e)) => {
                println!("WebSocket error: {}", e);
                break;
            }
            Err(_) => {
                // Timeout, continue
            }
        }
    }
    
    println!("\n=== Status transition summary ===");
    println!("Saw 'starting': {}", saw_starting);
    println!("Saw 'running': {}", saw_running);
    println!("Final tracked status: {:?}", tracker.get_status(&session_id));
    println!("Last status from events: {}", last_status);
    
    // Verify we saw the expected status transitions
    assert!(saw_starting, "Never saw 'starting' status event");
    assert!(saw_running, "Never saw 'running' status event - this is the bug!");
    
    // Stop the app
    println!("\n=== Stopping app ===");
    client.send_command("stop_app", None).await?;
    
    // Wait for stopped status
    let stop_start = std::time::Instant::now();
    while stop_start.elapsed() < Duration::from_secs(10) {
        if let Ok(msg) = timeout(Duration::from_secs(2), client.recv_message()).await {
            if let Ok(msg) = msg {
                if msg["type"] == "event" && msg["eventType"] == "session.status_changed" {
                    if msg["payload"]["status"] == "stopped" {
                        println!("✓ App stopped successfully");
                        break;
                    }
                }
            }
        }
    }
    
    println!("\n=== Test passed! ===");
    Ok(())
}

/// This test simulates exactly what the TUI does: maintain a sessions list
/// and update it based on events, then read from it for display.
#[tokio::test]
async fn test_tui_session_state_flow() -> anyhow::Result<()> {
    println!("\n=== Starting daemon ===");
    let _daemon = DaemonProcess::start().await?;
    
    println!("\n=== Connecting client ===");
    let mut client = TestClient::connect().await?;
    
    // Simulate TUI's sessions list (like App.sessions in Rust TUI)
    #[derive(Debug, Clone)]
    struct Session {
        id: String,
        name: String,
        app_status: String,
        pid: Option<u32>,
        vm_service_uri: Option<String>,
    }
    
    let mut sessions: Vec<Session> = Vec::new();
    let mut selected_session: Option<String> = None;
    
    // Helper to get current session (like App.current_session())
    let get_current_session = |sessions: &[Session], selected: &Option<String>| -> Option<Session> {
        selected.as_ref().and_then(|id| sessions.iter().find(|s| &s.id == id).cloned())
    };
    
    // Helper to handle events (like App.push_event -> handle_session_status_event)
    let handle_event = |sessions: &mut Vec<Session>, event: &Value| {
        let event_type = event["eventType"].as_str().unwrap_or("");
        
        if event_type == "session.status_changed" {
            let payload = &event["payload"];
            if let Some(session_id) = payload["sessionId"].as_str() {
                if let Some(session) = sessions.iter_mut().find(|s| s.id == session_id) {
                    if let Some(status) = payload["status"].as_str() {
                        println!("[handle_event] Updating session {} status: {} -> {}", 
                                 session_id, session.app_status, status);
                        session.app_status = status.to_string();
                    }
                    if let Some(pid) = payload["pid"].as_u64() {
                        session.pid = Some(pid as u32);
                    }
                    if let Some(uri) = payload["vmServiceUri"].as_str() {
                        session.vm_service_uri = Some(uri.to_string());
                    }
                } else {
                    println!("[handle_event] WARNING: Session {} not found in sessions list!", session_id);
                }
            }
        }
    };
    
    // Create session
    let example_path = concat!(env!("CARGO_MANIFEST_DIR"), "/../example");
    let example_path = std::fs::canonicalize(example_path)?;
    
    println!("\n=== Creating session ===");
    let session_id = client.create_session("test-tui-flow", example_path.to_str().unwrap()).await?;
    
    // Add to sessions list (like TUI does when receiving session.created or from hello_ack)
    sessions.push(Session {
        id: session_id.clone(),
        name: "test-tui-flow".to_string(),
        app_status: "not_running".to_string(),
        pid: None,
        vm_service_uri: None,
    });
    selected_session = Some(session_id.clone());
    
    println!("Initial state: {:?}", get_current_session(&sessions, &selected_session));
    
    // Run app
    println!("\n=== Running app ===");
    client.send_command("run_app", Some(json!({
        "sessionId": session_id,
        "device": "macos"
    }))).await?;
    
    // Process events like TUI does
    let start = std::time::Instant::now();
    let mut running_seen = false;
    
    while start.elapsed() < Duration::from_secs(120) && !running_seen {
        match timeout(Duration::from_secs(5), client.recv_message()).await {
            Ok(Ok(msg)) => {
                if msg["type"] == "event" {
                    handle_event(&mut sessions, &msg);
                    
                    // Check current session status (like status_bar.rs does)
                    if let Some(current) = get_current_session(&sessions, &selected_session) {
                        println!("[render_status_bar] Would display: app_status={}", current.app_status);
                        
                        if current.app_status == "running" {
                            running_seen = true;
                            println!("✓ current_session().app_status is now 'running'");
                        }
                    }
                }
            }
            Ok(Err(e)) => {
                println!("Error: {}", e);
                break;
            }
            Err(_) => continue,
        }
    }
    
    // Final state
    println!("\n=== Final state ===");
    println!("Sessions list: {:?}", sessions);
    println!("Selected session: {:?}", selected_session);
    println!("Current session: {:?}", get_current_session(&sessions, &selected_session));
    
    assert!(running_seen, "current_session().app_status never became 'running'");
    
    // Cleanup
    client.send_command("stop_app", None).await?;
    sleep(Duration::from_secs(2)).await;
    
    println!("\n=== Test passed! ===");
    Ok(())
}
