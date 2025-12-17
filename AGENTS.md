# Interaction Tree / Fleeter

A Flutter testing and AI-driven interaction system with a central daemon architecture.

## Repository Structure

```
interaction_tree/
├── lib/                          # Core Flutter package (InteractionKey, InteractableMixin)
├── packages/
│   ├── fleeter-daemon/           # Central daemon (TypeScript/Bun) - manages sessions, Flutter processes
│   ├── fleeter-mcp-proxy/        # Thin MCP proxy for LLM clients (TypeScript/Bun)
│   ├── interaction_tree_driver/  # Flutter Driver integration (Dart)
│   ├── interaction_tree_mcp/     # Legacy MCP server (Dart) - deprecated
│   └── interaction-tree-server/  # Legacy server (TypeScript) - deprecated
├── tui/                          # Rust TUI for monitoring sessions
├── example/                      # Example Flutter app with interaction annotations
└── test/                         # Dart package tests
```

## Architecture

See [DAEMON_DESIGN.md](./DAEMON_DESIGN.md) for full architecture documentation.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Amp Thread 1   │     │  Amp Thread 2   │     │      TUI        │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │ stdio                 │ stdio                 │
         ▼                       ▼                       │
┌─────────────────┐     ┌─────────────────┐              │
│  MCP Proxy #1   │     │  MCP Proxy #2   │              │
└────────┬────────┘     └────────┬────────┘              │
         │ ws://                 │ ws://                 │ ws://
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │    FLEETER DAEMON      │
                    │    (single process)    │
                    │  ┌──────────────────┐  │
                    │  │  SessionManager  │  │
                    │  │  FlutterProcess  │  │
                    │  │  AI Agent        │  │
                    │  └──────────────────┘  │
                    │  WebSocket :9877       │
                    └────────────────────────┘
```

## Commands

### Daemon Management

```bash
# Install dependencies
bun install

# Build TypeScript packages
bun run build

# Start daemon (foreground)
bun run daemon:start

# Install as launchd service (macOS)
bun run daemon:install

# Uninstall launchd service
bun run daemon:uninstall

# View daemon logs
bun run daemon:logs

# Check daemon status
bun run daemon:status
```

### Development

```bash
# Build all TypeScript packages
bun run build

# Run tests
bun run test

# Type checking
bun run typecheck

# Lint
bun run lint
```

### Flutter Package

```bash
# Run Dart tests
dart test

# Run Flutter tests
flutter test

# Analyze Dart code
dart analyze
```

### TUI (Rust)

```bash
cd tui
cargo build --release
cargo run
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/fleeter-daemon/src/daemon.ts` | Main daemon class |
| `packages/fleeter-daemon/src/flutter/process-manager.ts` | Flutter process lifecycle |
| `packages/fleeter-daemon/src/session/manager.ts` | Session management |
| `packages/fleeter-mcp-proxy/src/proxy.ts` | MCP protocol translation |
| `lib/src/interaction_key.dart` | Core InteractionKey widget |
| `lib/src/interactable_mixin.dart` | Custom action mixin |
| `tui/src/main.rs` | TUI entry point |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLEETER_PORT` | `9877` | WebSocket server port |
| `FLEETER_HOST` | `127.0.0.1` | Host to bind to |
| `ANTHROPIC_API_KEY` | (required) | API key for AI agent mode |

## MCP Configuration

Add to `~/.config/amp/settings.json`:

```json
{
  "mcpServers": {
    "fleeter": {
      "command": "bun",
      "args": ["run", "--cwd", "/path/to/interaction_tree/packages/fleeter-mcp-proxy", "start"]
    }
  }
}
```

Or after global install:

```json
{
  "mcpServers": {
    "fleeter": {
      "command": "fleeter-mcp-proxy"
    }
  }
}
```

## Testing Conventions

- **Dart tests**: Use `flutter test` or `dart test`
- **TypeScript tests**: Use `vitest` via `bun run test`
- **Rust tests**: Use `cargo test`

## Code Style

- **Dart**: Follow `flutter_lints` rules
- **TypeScript**: ESLint with TypeScript rules, no semicolons optional
- **Rust**: Standard rustfmt
