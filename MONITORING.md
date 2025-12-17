# Interaction Tree - Monitoring & Observability Plan

## Vision

Enable developers to observe multiple running MCP agents interacting with Flutter apps—seeing Flutter logs, agent communication, interaction tree state changes, and runtime errors—all while maintaining idiomatic Flutter development workflows.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ZELLIJ WORKSPACE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────────────────────────────┐   │
│  │   Claude/MCP        │  │          MONITORING DASHBOARD               │   │
│  │   Client            │  │  ┌───────────────┬────────────────────┐     │   │
│  │                     │  │  │ Flutter Logs  │ Agent Tool Calls   │     │   │
│  │   (agent actions)   │  │  │               │                    │     │   │
│  │                     │  │  │ [flutter.log] │ [agent.tool_call]  │     │   │
│  └─────────────────────┘  │  │ [flutter.log] │ [agent.tool_result]│     │   │
│                           │  ├───────────────┼────────────────────┤     │   │
│  ┌─────────────────────┐  │  │ Tree State    │ Runtime Errors     │     │   │
│  │   Code Editor       │  │  │               │                    │     │   │
│  │   (VSCode/Zed)      │  │  │ [tree.snap]   │ [flutter.error]    │     │   │
│  │                     │  │  │ [tree.diff]   │ [vm.error]         │     │   │
│  └─────────────────────┘  │  └───────────────┴────────────────────┘     │   │
│                           └─────────────────────────────────────────────┘   │
│                                        ▲                                     │
└────────────────────────────────────────┼─────────────────────────────────────┘
                                         │
                              WebSocket / Named Pipe
                                         │
┌────────────────────────────────────────┼─────────────────────────────────────┐
│                    INTERACTION-TREE-SERVER                                    │
├────────────────────────────────────────┴─────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         MONITORING EVENT BUS                             │ │
│  │                                                                          │ │
│  │   emit(event) ──► [subscriber1, subscriber2, ...]                        │ │
│  │                   ├── WebSocket transport (port 9000+)                   │ │
│  │                   ├── Named pipe (~/.interaction-tree/INSTANCE.pipe)     │ │
│  │                   └── console.error (human-readable)                     │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                     ▲              ▲               ▲              ▲           │
│                     │              │               │              │           │
│  ┌──────────────────┴──┐  ┌───────┴───────┐  ┌────┴─────┐  ┌─────┴────────┐ │
│  │ FlutterProcess      │  │ AgentExecutor │  │ VMClient │  │ MCP Handlers │ │
│  │ Manager             │  │               │  │          │  │              │ │
│  │                     │  │ tool_call     │  │ tree     │  │ request      │ │
│  │ logs, lifecycle     │  │ tool_result   │  │ snapshot │  │ response     │ │
│  │ errors              │  │ session       │  │ diff     │  │              │ │
│  └─────────────────────┘  └───────────────┘  └──────────┘  └──────────────┘ │
│              │                                     │                          │
└──────────────┼─────────────────────────────────────┼──────────────────────────┘
               │                                     │
               ▼                                     ▼
        ┌──────────────┐                    ┌────────────────┐
        │ Flutter App  │                    │ VM Service     │
        │ (flutter run)│◄───────────────────│ (ws://...)     │
        └──────────────┘                    └────────────────┘
```

---

## Recommended Approach: Native Streaming + Zellij Layouts

### Why This Approach?

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Zellij Plugin (WASM)** | Best UX, integrated TUI | Significant Rust work; needs data source | Optional enhancement |
| **Zellij Layout + CLI** | Low effort, immediate value | Limited visualization | **Default dev setup** |
| **Docker Compose** | Good for CI/demo | Hurts Flutter dev workflow | CI/demo only |
| **Native Streaming** | Foundation for all UIs | Requires server changes | **Core architecture** |

**Recommendation**: Build **Native Streaming** as the foundation, use **Zellij Layouts** for immediate dev visibility, and treat **Zellij Plugin** as a future enhancement.

---

## Phase 1: Monitoring Event System

### Event Schema

```typescript
// packages/interaction-tree-server/src/monitoring/types.ts

export type EventSource = 'flutter' | 'vm' | 'agent' | 'mcp' | 'interaction_tree';
export type EventLevel = 'debug' | 'info' | 'warn' | 'error';

export interface MonitoringEvent {
  ts: string;              // ISO timestamp
  source: EventSource;     // Which subsystem
  instanceId: string;      // Identifies this MCP server instance
  type: string;            // e.g., 'flutter.log', 'agent.tool_call'
  level?: EventLevel;
  payload: unknown;        // Type-specific data
}

// Specific event types
export interface FlutterLogEvent extends MonitoringEvent {
  source: 'flutter';
  type: 'flutter.log';
  payload: {
    line: string;
    stderr: boolean;
  };
}

export interface FlutterLifecycleEvent extends MonitoringEvent {
  source: 'flutter';
  type: 'flutter.lifecycle';
  payload: {
    status: 'starting' | 'running' | 'stopped' | 'error';
    projectPath?: string;
    device?: string;
    vmServiceUri?: string;
    pid?: number;
    error?: string;
  };
}

export interface AgentToolCallEvent extends MonitoringEvent {
  source: 'agent';
  type: 'agent.tool_call';
  payload: {
    toolName: string;
    args: Record<string, unknown>;
    conversationId?: string;
  };
}

export interface AgentToolResultEvent extends MonitoringEvent {
  source: 'agent';
  type: 'agent.tool_result';
  payload: {
    toolName: string;
    durationMs: number;
    status: 'success' | 'error';
    error?: string;
    summary?: string;
  };
}

export interface InteractionTreeSnapshotEvent extends MonitoringEvent {
  source: 'interaction_tree';
  type: 'interaction_tree.snapshot';
  payload: {
    nodeCount: number;
    rootIds: string[];
    tree: unknown; // Pruned tree structure
  };
}

export interface VMConnectionEvent extends MonitoringEvent {
  source: 'vm';
  type: 'vm.connected' | 'vm.disconnected';
  payload: {
    uri?: string;
  };
}
```

### Monitor Module

```typescript
// packages/interaction-tree-server/src/monitoring/monitor.ts

import { EventEmitter } from 'events';
import type { MonitoringEvent } from './types.js';

class Monitor extends EventEmitter {
  private instanceId: string;
  
  constructor() {
    super();
    this.instanceId = process.env.INTERACTION_TREE_INSTANCE_ID ?? 
                      `it-${Date.now().toString(36)}`;
  }
  
  emit(event: Omit<MonitoringEvent, 'ts' | 'instanceId'>): boolean {
    const fullEvent: MonitoringEvent = {
      ...event,
      ts: new Date().toISOString(),
      instanceId: this.instanceId,
    };
    
    // Always log to stderr for debugging
    console.error(`[${fullEvent.source}] ${fullEvent.type}: ${JSON.stringify(fullEvent.payload)}`);
    
    // Emit for subscribers (WebSocket, pipe, etc.)
    return super.emit('event', fullEvent);
  }
  
  subscribe(listener: (event: MonitoringEvent) => void): () => void {
    this.on('event', listener);
    return () => this.off('event', listener);
  }
  
  getInstanceId(): string {
    return this.instanceId;
  }
}

// Singleton
let monitor: Monitor | null = null;

export function getMonitor(): Monitor {
  if (!monitor) {
    monitor = new Monitor();
  }
  return monitor;
}
```

### Instrumentation Points

#### FlutterProcessManager

```typescript
// In process-manager.ts

import { getMonitor } from '../monitoring/monitor.js';

// In addLog()
private addLog(line: string, stderr = false): void {
  this.logBuffer.push(line);
  // ... existing logic ...
  
  getMonitor().emit({
    source: 'flutter',
    type: 'flutter.log',
    level: stderr ? 'warn' : 'info',
    payload: { line, stderr },
  });
}

// In run() - on status changes
getMonitor().emit({
  source: 'flutter',
  type: 'flutter.lifecycle',
  payload: { status: 'starting', projectPath, device },
});

// In connectToApp()
getMonitor().emit({
  source: 'vm',
  type: 'vm.connected',
  payload: { uri },
});
```

#### Agent Mode Tool Handlers

```typescript
// In modes/agent.ts

import { getMonitor } from '../monitoring/monitor.js';

// Wrap tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();
  
  getMonitor().emit({
    source: 'agent',
    type: 'agent.tool_call',
    payload: { toolName: name, args },
  });
  
  try {
    const result = await handleTool(name, args);
    
    getMonitor().emit({
      source: 'agent',
      type: 'agent.tool_result',
      payload: {
        toolName: name,
        durationMs: Date.now() - startTime,
        status: 'success',
      },
    });
    
    return result;
  } catch (err) {
    getMonitor().emit({
      source: 'agent',
      type: 'agent.tool_result',
      level: 'error',
      payload: {
        toolName: name,
        durationMs: Date.now() - startTime,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
});
```

---

## Phase 2: Streaming Transports

### WebSocket Server

```typescript
// packages/interaction-tree-server/src/monitoring/ws-server.ts

import { WebSocketServer, WebSocket } from 'ws';
import { getMonitor } from './monitor.js';

export function startMonitoringServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });
  
  console.error(`[monitoring] WebSocket server listening on ws://localhost:${port}`);
  
  const unsubscribe = getMonitor().subscribe((event) => {
    const json = JSON.stringify(event);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  });
  
  wss.on('close', () => {
    unsubscribe();
  });
  
  return wss;
}
```

### Named Pipe (Optional)

```typescript
// packages/interaction-tree-server/src/monitoring/pipe-server.ts

import { createWriteStream } from 'fs';
import { mkfifo } from 'mkfifo'; // npm package
import { getMonitor } from './monitor.js';

export async function startPipeServer(pipePath: string): Promise<void> {
  try {
    await mkfifo(pipePath, 0o666);
  } catch {
    // Pipe may already exist
  }
  
  const stream = createWriteStream(pipePath, { flags: 'a' });
  
  getMonitor().subscribe((event) => {
    stream.write(JSON.stringify(event) + '\n');
  });
  
  console.error(`[monitoring] Named pipe at ${pipePath}`);
}
```

### Server Integration

```typescript
// In server.ts

import { startMonitoringServer } from './monitoring/ws-server.js';

export async function startServer(config: ServerConfig): Promise<void> {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  
  // Start monitoring WebSocket server
  const monitorPort = parseInt(process.env.INTERACTION_TREE_MONITOR_PORT ?? '9000');
  startMonitoringServer(monitorPort);
  
  await server.connect(transport);
  console.error('[interaction-tree-server] Server started');
}
```

---

## Phase 3: Zellij Integration

### Default Layout

```kdl
// ~/.config/zellij/layouts/interaction-tree.kdl

layout {
    tab name="Agent" focus=true {
        pane size="60%" {
            // MCP client / Claude interaction
            command "amp"
        }
        pane size="40%" split_direction="vertical" {
            pane name="Flutter Logs" {
                command "websocat"
                args "-u" "ws://localhost:9000"
                // Filter: jq 'select(.type=="flutter.log") | .payload.line'
            }
            pane name="Agent Activity" {
                command "websocat"
                args "-u" "ws://localhost:9000"
                // Filter: jq 'select(.source=="agent")'
            }
        }
    }
    
    tab name="Tree" {
        pane name="Interaction Tree" {
            command "websocat"
            args "-u" "ws://localhost:9000"
            // Filter: jq 'select(.type | startswith("interaction_tree"))'
        }
    }
    
    tab name="All Events" {
        pane name="Full Event Stream" {
            command "websocat"
            args "-u" "ws://localhost:9000"
            // No filter - shows everything
        }
    }
}
```

### Monitor CLI Tool

Create a simple CLI that wraps the WebSocket connection with nice formatting:

```typescript
// packages/interaction-tree-server/bin/monitor.ts
#!/usr/bin/env node

import WebSocket from 'ws';
import chalk from 'chalk';

const port = process.argv[2] ?? '9000';
const filter = process.argv[3]; // Optional: 'flutter', 'agent', 'tree', etc.

const ws = new WebSocket(`ws://localhost:${port}`);

ws.on('message', (data) => {
  const event = JSON.parse(data.toString());
  
  if (filter && !event.type.includes(filter) && event.source !== filter) {
    return;
  }
  
  const color = {
    flutter: chalk.green,
    agent: chalk.blue,
    vm: chalk.yellow,
    mcp: chalk.cyan,
    interaction_tree: chalk.magenta,
  }[event.source] ?? chalk.white;
  
  const levelIcon = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    debug: '🔍',
  }[event.level ?? 'info'];
  
  console.log(
    chalk.dim(event.ts.split('T')[1].slice(0, 12)),
    levelIcon,
    color(`[${event.source}]`),
    chalk.bold(event.type),
    JSON.stringify(event.payload)
  );
});

ws.on('error', (err) => {
  console.error(chalk.red(`Connection error: ${err.message}`));
  process.exit(1);
});

console.log(chalk.dim(`Connecting to ws://localhost:${port}...`));
```

Usage:
```bash
# All events
it-monitor

# Flutter logs only
it-monitor 9000 flutter

# Agent activity only
it-monitor 9000 agent

# Tree changes only
it-monitor 9000 tree
```

### Multi-Instance Support

For multiple simultaneous agents/apps:

```bash
# Start first instance on port 9000
INTERACTION_TREE_MONITOR_PORT=9000 \
INTERACTION_TREE_INSTANCE_ID=app1 \
interaction-tree-server

# Start second instance on port 9001
INTERACTION_TREE_MONITOR_PORT=9001 \
INTERACTION_TREE_INSTANCE_ID=app2 \
interaction-tree-server
```

Zellij can then use tabs per instance or merge streams via:
```bash
# Monitor all instances
websocat ws://localhost:9000 &
websocat ws://localhost:9001 &
```

---

## Phase 4: Ratatui TUI Client

A Rust-based TUI that runs in Zellij panes, providing:

- **Real-time event stream** with filtering
- **Flutter CLI commands** (r=reload, R=restart, q=quit, etc.)
- **Agent messaging** - send intents directly to the agent
- **Multi-pane layout** - logs, tree, errors in split views

### Bidirectional WebSocket Protocol

```typescript
// Client → Server commands
interface Command {
  type: 'command';
  action: 'hot_reload' | 'hot_restart' | 'stop' | 'flutter_key';
  key?: string;  // For flutter_key action (r, R, q, p, etc.)
}

interface AgentMessage {
  type: 'agent_message';
  intent: string;
  context?: string[];
  conversationId?: string;  // For continuing conversations
}

// Server → Client events (existing MonitoringEvent + new)
interface AgentResponseEvent {
  type: 'agent.response';
  payload: {
    status: 'success' | 'failed' | 'needs_context';
    summary?: string;
    error?: string;
    question?: string;
    conversationId?: string;
  };
}
```

### Rust TUI Structure

```
packages/it-tui/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── app.rs           # App state and event loop
│   ├── ui/
│   │   ├── mod.rs
│   │   ├── logs.rs      # Flutter logs pane
│   │   ├── events.rs    # MCP/agent events pane
│   │   ├── tree.rs      # Interaction tree view
│   │   ├── input.rs     # Command input bar
│   │   └── status.rs    # Status bar
│   ├── ws/
│   │   ├── mod.rs
│   │   ├── client.rs    # WebSocket client
│   │   └── protocol.rs  # Message types
│   └── commands.rs      # Command handling
```

### Key Bindings

| Key | Action |
|-----|--------|
| `r` | Hot reload |
| `R` | Hot restart |
| `q` | Quit app (with confirm) |
| `Q` | Force quit TUI |
| `p` | Toggle performance overlay |
| `o` | Toggle debug paint |
| `Tab` | Switch pane focus |
| `:` | Enter command mode |
| `/` | Filter events |
| `?` | Show help |

### Command Mode

```
:reload              # Hot reload
:restart             # Hot restart  
:stop                # Stop Flutter app
:ask <intent>        # Send intent to agent
:filter <pattern>    # Filter events
:clear               # Clear event log
```

---

## Phase 5: Future Enhancements

### Zellij Plugin (Optional)

A native Zellij WASM plugin that provides:

- **Instance List**: Shows all running interaction-tree-server instances
- **Event Timeline**: Scrollable view of recent events with filtering
- **Tree Viewer**: Collapsible visualization of the interaction tree
- **Error Panel**: Aggregated view of runtime errors

The plugin would:
1. Connect to monitoring WebSocket endpoints
2. Parse and aggregate events
3. Render using Zellij's UI components
4. Allow keyboard navigation and filtering

### Web Dashboard (Optional)

A browser-based dashboard for:
- Multi-agent visualization
- Tree diff visualization over time
- Session replay (record and playback agent sessions)
- Metrics and analytics

---

## Implementation Phases

### Phase 1: Core Event System (1-2 days)
- [ ] Create `monitoring/types.ts` with event types
- [ ] Create `monitoring/monitor.ts` singleton
- [ ] Instrument `FlutterProcessManager` with events
- [ ] Instrument MCP tool handlers with events

### Phase 2: Streaming Transport (1 day)
- [ ] Add WebSocket server to `server.ts`
- [ ] Create `bin/monitor.ts` CLI tool
- [ ] Add environment variables for configuration

### Phase 3: Zellij Integration (1 day)
- [ ] Create default Zellij layout file
- [ ] Document multi-instance workflow
- [ ] Create example scripts for common monitoring tasks

### Phase 4: Polish & Docs (1 day)
- [ ] Update README with monitoring docs
- [ ] Add `--monitor-port` CLI flag
- [ ] Consider named pipe transport for tighter Zellij integration

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INTERACTION_TREE_MONITOR_PORT` | `9000` | WebSocket server port |
| `INTERACTION_TREE_INSTANCE_ID` | Auto-generated | Unique identifier for this instance |
| `INTERACTION_TREE_MONITOR_LEVEL` | `info` | Minimum event level to emit |
| `INTERACTION_TREE_MONITOR_FILTER` | None | Comma-separated list of event types to include |

---

## Summary

This architecture provides:

1. **Real-time Flutter logs** via `flutter.log` events
2. **Agent communication visibility** via `agent.tool_call` / `agent.tool_result` events
3. **Interaction tree state tracking** via `interaction_tree.snapshot` events
4. **Idiomatic Flutter workflow** - no changes to how you run/hot-reload Flutter
5. **Multi-agent support** - each instance has unique ID and port

The approach is layered:
- **Foundation**: Native event streaming from `interaction-tree-server`
- **Day-to-day**: Zellij layouts with CLI tools (`websocat`, `it-monitor`)
- **Future**: Optional Zellij WASM plugin for richer visualization
