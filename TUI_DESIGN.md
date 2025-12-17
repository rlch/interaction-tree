# Interaction Tree TUI - Design Document

## Overview

A Rust-based terminal UI for monitoring and controlling Flutter apps via interaction-tree-server. Designed to run in Zellij panes alongside the agent/editor.

---

## Goals

1. **Real-time visibility** - See Flutter logs, agent actions, and errors as they happen
2. **Direct control** - Send Flutter CLI commands (r/R/q/p/o) without switching contexts
3. **Agent interaction** - Send intents to the agent and see responses
4. **Minimal footprint** - Fast startup, low memory, single binary

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          it-tui                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Event     │───▶│    App      │───▶│    UI Renderer      │  │
│  │   Loop      │    │   State     │    │    (Ratatui)        │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│         ▲                  │                                     │
│         │                  ▼                                     │
│  ┌─────────────┐    ┌─────────────┐                             │
│  │  Terminal   │    │  WebSocket  │                             │
│  │  Input      │    │  Client     │                             │
│  └─────────────┘    └─────────────┘                             │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             ▼
                   interaction-tree-server
                        (ws://localhost:9000)
```

---

## UI Layout

### Default View (Single Pane)

```
┌─────────────────────────────────────────────────────────────────┐
│ IT Monitor │ Connected │ ws://127.0.0.1:9000 │ app: running     │
├─────────────────────────────────────────────────────────────────┤
│ 12:34:56.789 • [flutter] flutter.log: Starting app...           │
│ 12:34:57.123 • [mcp] mcp.request: run                           │
│ 12:34:58.456 ✓ [mcp] mcp.response: run (1.2s)                   │
│ 12:35:01.789 • [vm] vm.connected: ws://127.0.0.1:12345          │
│ 12:35:02.012 • [flutter] flutter.lifecycle: running             │
│ 12:35:05.345 • [agent] agent.tool_call: get_tree                │
│ 12:35:05.567 ✓ [agent] agent.tool_result: get_tree (222ms)      │
│                                                                  │
│                                                                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ > _                                                              │
├─────────────────────────────────────────────────────────────────┤
│ r:reload R:restart q:quit /:filter ?:help Tab:focus             │
└─────────────────────────────────────────────────────────────────┘
```

### Split View (with Tree)

```
┌─────────────────────────────────────────────────────────────────┐
│ IT Monitor │ Connected │ app: running │ 12 widgets              │
├────────────────────────────────────┬────────────────────────────┤
│ Events                             │ Interaction Tree           │
├────────────────────────────────────┼────────────────────────────┤
│ 12:35:05 • [agent] get_tree        │ ▼ scaffold                 │
│ 12:35:05 ✓ [agent] result (222ms)  │   ▼ app_bar                │
│ 12:35:10 • [mcp] tap               │     title_text             │
│ 12:35:10 ✓ [mcp] tap (45ms)        │   ▼ body                   │
│                                    │     ▼ list_view            │
│                                    │       item_0               │
│                                    │       item_1               │
│                                    │       item_2               │
│                                    │   ▼ fab                    │
│                                    │     add_button             │
├────────────────────────────────────┴────────────────────────────┤
│ > :ask tap on the add button                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## State Management

```rust
struct App {
    // Connection
    ws_state: WsState,
    server_uri: String,
    instance_id: Option<String>,
    
    // Flutter app state
    app_status: AppStatus,
    
    // Event log
    events: VecDeque<MonitoringEvent>,
    max_events: usize,
    
    // Interaction tree (cached)
    tree: Option<InteractionTree>,
    tree_expanded: HashSet<String>,
    
    // UI state
    mode: Mode,
    input_buffer: String,
    filter: Option<String>,
    selected_pane: Pane,
    scroll_offset: usize,
    
    // Agent conversation
    conversation_id: Option<String>,
    pending_response: bool,
}

enum WsState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting { attempt: u32 },
}

enum AppStatus {
    Unknown,
    Starting,
    Running { pid: u32, uri: String },
    Stopped,
    Error(String),
}

enum Mode {
    Normal,
    Command,      // After pressing ':'
    Filter,       // After pressing '/'
    Help,         // After pressing '?'
    Confirm(ConfirmAction),
}

enum Pane {
    Events,
    Tree,
    Input,
}
```

---

## Event Handling

### Terminal Events

| Key | Mode | Action |
|-----|------|--------|
| `r` | Normal | Send hot_reload command |
| `R` | Normal | Send hot_restart command |
| `q` | Normal | Enter confirm quit mode |
| `Q` | Normal | Quit immediately |
| `p` | Normal | Send 'p' to Flutter (perf overlay) |
| `o` | Normal | Send 'o' to Flutter (debug paint) |
| `w` | Normal | Send 'w' to Flutter (wireframe) |
| `:` | Normal | Enter command mode |
| `/` | Normal | Enter filter mode |
| `?` | Normal | Show help overlay |
| `Tab` | Normal | Cycle pane focus |
| `j`/`↓` | Normal | Scroll down |
| `k`/`↑` | Normal | Scroll up |
| `g` | Normal | Scroll to top |
| `G` | Normal | Scroll to bottom |
| `Enter` | Command | Execute command |
| `Esc` | Any | Return to normal mode |
| `Ctrl+C` | Any | Quit |

### Input Modes

**Normal mode** - Direct key bindings active (r/R/q/etc)

**Agent mode** - Type bare text, press Enter to send intent to agent
```
tap on the login button<Enter>
```

**Command mode** - Start with `:` for TUI/Flutter commands
```
:reload, :r          Hot reload
:restart, :R         Hot restart
:stop                Stop Flutter app
:tree                Fetch/refresh interaction tree
:filter <pattern>    Set event filter (or use /)
:clear               Clear event log
:connect <uri>       Connect to different server
:quit, :q            Quit TUI
```

**Filter mode** - Start with `/` to filter events
```
/flutter             Show only flutter events
/agent.tool          Show only agent tool events
```

---

## WebSocket Protocol

### Outgoing (TUI → Server)

```json
// Command
{"type": "command", "id": "uuid", "action": "hot_reload"}
{"type": "command", "id": "uuid", "action": "flutter_key", "key": "p"}
{"type": "command", "id": "uuid", "action": "get_tree"}

// Agent message
{"type": "agent_message", "id": "uuid", "intent": "tap on login button"}
{"type": "agent_message", "id": "uuid", "intent": "answer", "answer": "yes", "conversationId": "..."}
```

### Incoming (Server → TUI)

```json
// Monitoring events (existing)
{"ts": "...", "source": "flutter", "type": "flutter.log", "payload": {...}}

// Command response
{"type": "command_response", "id": "uuid", "success": true, "data": {...}}

// Agent response  
{"type": "agent_response", "id": "uuid", "status": "success", "summary": "Tapped login button"}
{"type": "agent_response", "id": "uuid", "status": "needs_context", "question": "Which button?"}
```

---

## File Structure

```
tui/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point, arg parsing
│   ├── app.rs               # App struct and update logic
│   ├── event.rs             # Event loop (terminal + ws)
│   ├── ui/
│   │   ├── mod.rs           # UI rendering entry
│   │   ├── layout.rs        # Layout calculations
│   │   ├── events_pane.rs   # Event log widget
│   │   ├── tree_pane.rs     # Interaction tree widget
│   │   ├── input_bar.rs     # Command input widget
│   │   ├── status_bar.rs    # Top status bar
│   │   ├── help_bar.rs      # Bottom help bar
│   │   └── help_overlay.rs  # Help popup
│   ├── ws/
│   │   ├── mod.rs
│   │   ├── client.rs        # WebSocket connection management
│   │   └── protocol.rs      # Message types (serde)
│   └── commands.rs          # Command parsing and execution
├── tests/
│   └── integration.rs       # Integration tests with example app
```

Unit tests are inline (`#[cfg(test)]` modules) in each source file.

---

## Implementation Phases

### Phase 1: Core TUI (MVP)
- [ ] Basic Ratatui setup with event loop
- [ ] WebSocket connection with auto-reconnect
- [ ] Event log display with scrolling
- [ ] Status bar showing connection state
- [ ] Hot reload/restart key bindings

### Phase 2: Commands & Filtering
- [ ] Command mode (`:`)
- [ ] Filter mode (`/`)
- [ ] Event filtering by source/type
- [ ] Help overlay

### Phase 3: Interaction Tree
- [ ] Tree pane with collapsible nodes
- [ ] Split view layout
- [ ] Tree refresh on demand

### Phase 4: Agent Integration
- [ ] `:ask` command for sending intents
- [ ] Agent response display
- [ ] Conversation continuation (needs_context)

### Phase 5: Polish
- [ ] Color themes
- [ ] Configuration file
- [ ] Mouse support (optional)
- [ ] Zellij layout file

---

## Dependencies

```toml
[dependencies]
ratatui = "0.29"           # TUI framework
crossterm = "0.28"         # Terminal backend
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.24" # WebSocket client
futures-util = "0.3"       # Stream utilities
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"               # Error handling
chrono = "0.4"             # Timestamp formatting
clap = { version = "4", features = ["derive"] }  # CLI args
uuid = { version = "1", features = ["v4"] }      # Request IDs
```

---

## Decisions

- **Location**: `tui/` at repo root (first Rust crate in repo)
- **Reconnect**: Manual only for now (no auto-reconnect)
- **Event buffer**: 1000 events default (TODO: explore configurable)
- **Config**: CLI args only, no config file
- **Input modes**: Bare text = agent intent, `:cmd` = command, `/pattern` = filter
- **Testing**: Unit tests with mocks, integration test with `example/` app

---

## TODOs (Future)

- [ ] Auto-reconnect with backoff
- [ ] Configurable event buffer size
- [ ] Config file support (`~/.config/it-tui/config.toml`)
- [ ] Multi-instance monitoring
- [ ] Log export to file
- [ ] Color themes

---

## References

- [Ratatui docs](https://ratatui.rs/)
- [Ratatui examples](https://github.com/ratatui/ratatui/tree/main/examples)
- [tokio-tungstenite](https://docs.rs/tokio-tungstenite)
