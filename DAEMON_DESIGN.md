# Fleeter Daemon Architecture

## Problem Statement

The current architecture spawns a separate MCP server process per LLM client (each Amp thread gets its own `interaction-tree-server` process). This means:

- **Sessions are isolated** - Each Amp instance has its own in-memory SessionManager
- **TUI sees only one client's sessions** - The WebSocket side-channel connects to whichever MCP server started first on port 9877
- **No session sharing** - Two Amp threads can't collaborate on the same Flutter app
- **Resource duplication** - Each MCP server could spawn its own Flutter processes

```
CURRENT (Broken):

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Amp Thread 1   │     │  Amp Thread 2   │     │      TUI        │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │ stdio                 │ stdio                 │ ws://
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ MCP Server #1   │     │ MCP Server #2   │     │ ??? Which one?  │
│ SessionMgr: {A} │     │ SessionMgr: {B} │     │                 │
│ Port: 9877      │     │ Port: FAIL      │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │
         ▼                       ▼
   Flutter App A           Flutter App B
   (isolated)              (isolated)
```

---

## Proposed Architecture: Central Daemon

A single persistent daemon process that:
1. Stores all sessions (shared across clients)
2. Manages all Flutter processes
3. Hosts the AI agent
4. Exposes a WebSocket API for all clients

MCP "servers" become thin proxies that translate stdio JSON-RPC to WebSocket commands.

```
PROPOSED:

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Amp Thread 1   │     │  Amp Thread 2   │     │      TUI        │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │ stdio                 │ stdio                 │
         ▼                       ▼                       │
┌─────────────────┐     ┌─────────────────┐              │
│  MCP Proxy #1   │     │  MCP Proxy #2   │              │
│  (thin shim)    │     │  (thin shim)    │              │
└────────┬────────┘     └────────┬────────┘              │
         │ ws://                 │ ws://                 │ ws://
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │    FLEETER DAEMON      │
                    │    (single process)    │
                    │                        │
                    │  ┌──────────────────┐  │
                    │  │  SessionManager  │  │
                    │  │  Sessions: {A,B} │  │
                    │  └──────────────────┘  │
                    │                        │
                    │  ┌──────────────────┐  │
                    │  │   AI Agent       │  │
                    │  │   (Anthropic)    │  │
                    │  └──────────────────┘  │
                    │                        │
                    │  WebSocket :9877       │
                    └───────────┬────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
        Flutter App A                       Flutter App B
        (session A)                         (session B)
```

---

## Design Decisions

### 1. Sessions are Fully Shared

Any connected client can:
- See all sessions via `list_sessions`
- Connect to any session via `connect`
- Run commands on any session they're connected to

**Rationale**: This enables:
- Multiple Amp threads working on different parts of the same app
- TUI monitoring all active sessions
- Handoff between agents (one agent creates session, another continues)

**Future consideration**: Session locking/ownership if conflicts arise.

### 2. Daemon Auto-Start

The daemon should start automatically when needed, not require manual intervention.

**Strategy**: 
1. MCP proxy checks if daemon is running (health check on port 9877)
2. If not running, spawn it as a background process
3. Wait for daemon to be ready before proceeding

**macOS Integration** (optional, future):
```bash
# Install as launchd service
brew services start fleeter

# Or manual launchd plist at ~/Library/LaunchAgents/com.fleeter.daemon.plist
```

**Linux Integration** (optional, future):
```bash
# systemd user service at ~/.config/systemd/user/fleeter.service
systemctl --user enable fleeter
systemctl --user start fleeter
```

For now: Simple auto-spawn from MCP proxy with PID file at `~/.fleeter/daemon.pid`.

### 3. AI Agent is Per-Session

Each session has its own AI agent instance. Multiple MCP clients connected to the same session share that agent.

```
Session A
  ├─ Flutter process
  ├─ VM Service client  
  └─ Agent instance ◄─── Amp #1 and Amp #2 both talk to this agent
  
Session B
  ├─ Flutter process
  ├─ VM Service client
  └─ Agent instance ◄─── Amp #3 talks to this separate agent
```

**Rationale**:
- Agent maintains context about the Flutter app it's controlling
- Multiple Amp threads can collaborate on same session with shared agent context
- Single API key configuration in daemon
- Agent has direct access to its session's Flutter process and VM client

**Flow**:
```
Amp → MCP Proxy → Daemon → Session's Agent → Tool Execution → Response
        stdio      ws        (per-session)      vm service
```

---

## Component Details

### Fleeter Daemon

**Location**: `packages/fleeter-daemon/` (new package)

**Responsibilities**:
- WebSocket server on port 9877 (configurable via `FLEETER_PORT`)
- Session management (create, destroy, list, connect)
- Flutter process management (run, stop, hot reload)
- VM Service connections (interaction tree queries)
- AI agent (intent interpretation, tool execution)
- Event broadcasting (logs, tool calls, tree snapshots)

**State**:
```typescript
interface DaemonState {
  sessions: Map<string, Session>;
  clients: Map<string, ConnectedClient>;
}

interface Session {
  id: string;
  name: string;
  projectPath: string;
  flutterProcess: ChildProcess | null;
  vmClient: VMServiceClient | null;
  agent: AgentExecutor;  // Each session has its own agent
  connectedClients: Set<string>;  // Which clients are connected to this session
}

interface ConnectedClient {
  id: string;
  type: 'mcp' | 'tui';
  ws: WebSocket;
  connectedSessionId: string | null;  // Which session this client is "focused" on
}
```

**Startup**:
```bash
# Direct
fleeter daemon

# With options
fleeter daemon --port 9877 --log-level debug

# Background (how proxy starts it)
fleeter daemon --detach --pid-file ~/.fleeter/daemon.pid
```

### MCP Proxy

**Location**: `packages/fleeter-mcp-proxy/` (new package, or rename existing)

**Responsibilities**:
- Speak MCP protocol via stdio with LLM client
- Connect to daemon via WebSocket
- Forward tool calls to daemon
- Return responses to LLM

**Complexity**: Minimal - just protocol translation.

```typescript
// Pseudocode
const ws = await connectToDaemon();  // Auto-starts if needed
const mcpServer = new Server({ name: 'fleeter', version: '0.1.0' });

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  // Could fetch from daemon, or return static list
  return { tools: TOOL_DEFINITIONS };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const response = await ws.sendAndWait({
    type: 'tool_call',
    clientId: CLIENT_ID,
    tool: request.params.name,
    args: request.params.arguments,
  });
  
  return {
    content: [{ type: 'text', text: JSON.stringify(response.result) }],
  };
});
```

### TUI (Fleeter)

**Location**: `tui/` (existing)

**Changes**:
- Already connects via WebSocket - no major changes needed
- Add client type identification on connect
- Potentially add multi-session view (see all sessions, not just active)

---

## WebSocket Protocol

### Client → Daemon Messages

```typescript
// Base message structure
interface ClientMessage {
  id: string;           // For request/response correlation
  clientId: string;     // Identifies the connected client
  type: string;
}

// Tool call from MCP proxy (agent mode)
interface AgentToolCall extends ClientMessage {
  type: 'agent_tool_call';
  intent: string;                    // Natural language intent
  context?: string[];                // Additional context
  conversationId?: string;           // For multi-turn conversations
}

// Direct command (raw mode or TUI)
interface DirectCommand extends ClientMessage {
  type: 'command';
  action: CommandAction;
  data?: Record<string, unknown>;
}

type CommandAction = 
  // Session management
  | 'create_session'      // { name, projectPath }
  | 'destroy_session'     // { sessionId }
  | 'list_sessions'       // {}
  | 'connect_session'     // { sessionId }
  
  // App lifecycle
  | 'run_app'             // { device?, flavor?, target? }
  | 'stop_app'            // {}
  | 'hot_reload'          // {}
  | 'hot_restart'         // {}
  | 'rebuild_app'         // { clean? }
  
  // Interaction tree
  | 'get_tree'            // { summaryOnly? }
  | 'execute_interaction' // { nodeId, interaction, args? }
  | 'find_nodes'          // { query }
  
  // Flutter process
  | 'flutter_key'         // { key: 'r' | 'R' | 'q' | ... }
  | 'get_logs'            // { maxLines? }
  
  // Status
  | 'get_status'          // {}
  | 'health_check';       // {}
```

### Daemon → Client Messages

```typescript
// Response to a request
interface CommandResponse {
  type: 'command_response';
  id: string;              // Correlates to request
  success: boolean;
  data?: unknown;
  error?: string;
}

// Agent response (for agent_tool_call)
interface AgentResponse {
  type: 'agent_response';
  id: string;
  status: 'success' | 'failed' | 'needs_context';
  summary?: string;
  error?: string;
  question?: string;       // If needs_context
  conversationId?: string;
}

// Broadcast events (no id, sent to all clients)
interface MonitoringEvent {
  type: 'event';
  ts: string;
  source: 'flutter' | 'vm' | 'agent' | 'daemon';
  eventType: string;       // e.g., 'flutter.log', 'agent.tool_call'
  sessionId?: string;      // Which session this relates to
  payload: unknown;
}
```

### Connection Handshake

```typescript
// Client sends on connect
interface ClientHello {
  type: 'hello';
  clientType: 'mcp' | 'tui';
  clientId: string;        // UUID, persisted by client
  version: string;         // Protocol version
}

// Daemon responds
interface ServerHello {
  type: 'hello_ack';
  daemonVersion: string;
  sessions: SessionInfo[]; // Current sessions
}
```

---

## File Structure

```
packages/
├── fleeter-daemon/                 # NEW: Central daemon
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # Entry point, CLI
│   │   ├── daemon.ts              # Main daemon class
│   │   ├── session/
│   │   │   ├── manager.ts         # SessionManager (moved from server)
│   │   │   └── types.ts
│   │   ├── flutter/
│   │   │   ├── process-manager.ts # Flutter process lifecycle
│   │   │   └── vm-client.ts       # VM Service connection
│   │   ├── agent/
│   │   │   ├── executor.ts        # AI agent (moved from server)
│   │   │   └── tools.ts           # Tool definitions
│   │   ├── ws/
│   │   │   ├── server.ts          # WebSocket server
│   │   │   ├── handlers.ts        # Command handlers
│   │   │   └── protocol.ts        # Message types
│   │   └── monitoring/
│   │       ├── monitor.ts         # Event emitter
│   │       └── types.ts
│   └── bin/
│       └── fleeter-daemon.ts      # CLI entry
│
├── fleeter-mcp-proxy/              # RENAMED: Thin MCP proxy
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # Entry point
│   │   ├── proxy.ts               # MCP server that forwards to daemon
│   │   ├── daemon-client.ts       # WebSocket client to daemon
│   │   └── auto-start.ts          # Daemon auto-start logic
│   └── bin/
│       └── fleeter-mcp.ts         # CLI entry (what Amp spawns)
│
├── interaction-tree-server/        # DEPRECATED: Will be removed
│   └── ...                         # Migrate code to above packages
│
tui/                                # EXISTING: Rust TUI
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── app.rs
│   ├── ws/
│   │   ├── client.rs              # Minor updates for new protocol
│   │   └── protocol.rs            # Update message types
│   └── ...
```

---

## Daemon Lifecycle

### Auto-Start Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MCP Proxy Startup                             │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │ Check daemon health    │
                    │ GET ws://127.0.0.1:9877│
                    └───────────┬────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
              Connected?              Connection refused?
                    │                       │
                    ▼                       ▼
            ┌──────────────┐      ┌──────────────────────┐
            │ Send hello   │      │ Check PID file       │
            │ Continue     │      │ ~/.fleeter/daemon.pid│
            └──────────────┘      └──────────┬───────────┘
                                             │
                                  ┌──────────┴──────────┐
                                  │                     │
                            PID exists &           No PID or
                            process alive?         process dead?
                                  │                     │
                                  ▼                     ▼
                          ┌──────────────┐    ┌──────────────────┐
                          │ Wait & retry │    │ Spawn daemon     │
                          │ (starting up)│    │ fleeter daemon   │
                          └──────────────┘    │ --detach         │
                                              └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │ Wait for ready   │
                                              │ (poll health)    │
                                              └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │ Connect & hello  │
                                              └──────────────────┘
```

### Daemon Shutdown

**Graceful**:
1. Receive SIGTERM or `shutdown` command
2. Broadcast `daemon.shutting_down` event to all clients
3. Stop all Flutter processes gracefully
4. Close all WebSocket connections
5. Remove PID file
6. Exit

**Crash Recovery**:
- Stale PID file detected → remove and start fresh
- Flutter processes orphaned → TODO: consider process groups or recording PIDs

---

## Configuration

### Daemon Config File

Location: `~/.fleeter/config.json` (or `~/.config/fleeter/config.json`)

```json
{
  "port": 9877,
  "logLevel": "info",
  "agent": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "apiKeyEnvVar": "ANTHROPIC_API_KEY"
  },
  "flutter": {
    "sdkPath": null,
    "defaultDevice": null
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLEETER_PORT` | `9877` | WebSocket server port |
| `FLEETER_LOG_LEVEL` | `info` | Logging verbosity |
| `FLEETER_CONFIG` | `~/.fleeter/config.json` | Config file path |
| `ANTHROPIC_API_KEY` | (required for agent) | API key for Claude |

### Amp MCP Config

Update `~/.config/amp/settings.json`:

```json
{
  "mcpServers": {
    "fleeter": {
      "command": "npx",
      "args": ["fleeter-mcp-proxy"],
      "env": {
        "FLEETER_PORT": "9877"
      }
    }
  }
}
```

---

## Implementation Phases

### Phase 1: Daemon Foundation ✅ COMPLETE

1. ✅ Create `packages/fleeter-daemon/` package structure
2. ✅ Move SessionManager from `interaction-tree-server`
3. ✅ Implement WebSocket server with basic protocol
4. ✅ Implement commands: `create_session`, `list_sessions`, `connect_session`, `destroy_session`
5. ✅ Add daemon CLI with `--detach` and PID file support
6. ✅ Basic health check endpoint

**Deliverable**: Daemon that can manage sessions, TUI can connect and see sessions.

### Phase 2: MCP Proxy ✅ COMPLETE

1. ✅ Create `packages/fleeter-mcp-proxy/` package
2. ✅ Implement MCP server with tool definitions
3. ✅ Implement daemon client with auto-start logic
4. ✅ Forward tool calls to daemon
5. ✅ Test with Amp

**Deliverable**: Amp can connect via MCP proxy, create sessions visible in TUI.

### Phase 3: Flutter Process Management ✅ COMPLETE

1. ✅ Move Flutter process spawning to daemon
2. ✅ Implement `run_app`, `stop_app`, `hot_reload`, `hot_restart`
3. ✅ Wire up VM Service client
4. ✅ Implement `get_tree`, `execute_interaction`
5. ✅ Event broadcasting for Flutter logs

**Deliverable**: Full Flutter app lifecycle managed by daemon.

### Phase 4: AI Agent Migration (1-2 days)

1. Move agent executor to daemon
2. Implement `agent_tool_call` handling
3. Conversation context management
4. Agent events broadcasting

**Deliverable**: Agent mode works through daemon.

### Phase 5: Polish & Cleanup (1-2 days)

1. Remove deprecated `interaction-tree-server` code
2. Update all documentation
3. Add integration tests
4. Improve error handling and recovery
5. Optional: launchd/systemd service files

**Deliverable**: Production-ready daemon architecture.

---

## Open Questions

1. **Multi-user support?** - Currently assumes single user. Should daemon support multiple users with auth?

2. **Remote daemon?** - Could daemon run on a different machine (e.g., build server)? Would need auth, TLS.

3. **Session persistence?** - Should sessions survive daemon restart? (Would need SQLite or file storage)

4. **Process groups?** - Should daemon use process groups to ensure Flutter processes die with daemon?

5. **Hot daemon upgrade?** - Can we upgrade daemon without killing Flutter processes? (Probably not worth the complexity)

---

## Appendix: Migration Guide

### For MCP Config

Before:
```json
{
  "mcpServers": {
    "interaction-tree": {
      "command": "npx",
      "args": ["interaction-tree-server"]
    }
  }
}
```

After:
```json
{
  "mcpServers": {
    "fleeter": {
      "command": "npx", 
      "args": ["fleeter-mcp-proxy"]
    }
  }
}
```

### For TUI

No changes needed - still connects to `ws://127.0.0.1:9877`. Protocol is compatible.

### For Code Using the Library

The Flutter-side `interaction_tree` package is unchanged. Only the server architecture changes.
