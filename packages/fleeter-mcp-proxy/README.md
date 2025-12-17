# Fleeter MCP Proxy

MCP proxy that connects LLM clients (like Amp) to the Fleeter daemon.

## Installation

```bash
cd packages/fleeter-mcp-proxy
npm install
npm run build
```

## Amp Configuration

Add to `~/.config/amp/settings.json`:

```json
{
  "mcpServers": {
    "fleeter": {
      "command": "npx",
      "args": ["fleeter-mcp-proxy"],
      "env": {
        "FLEETER_DAEMON_URL": "ws://127.0.0.1:9877"
      }
    }
  }
}
```

## Environment Variables

- `FLEETER_DAEMON_URL` - Daemon WebSocket URL (default: ws://127.0.0.1:9877)
- `FLEETER_CLIENT_ID` - Client ID (auto-generated if not set)

## Available Tools

- `create_session` - Create a new Flutter session
- `list_sessions` - List all sessions
- `connect_session` - Connect to a session
- `destroy_session` - Destroy a session
- `run_app` - Run Flutter app
- `stop_app` - Stop Flutter app
- `hot_reload` - Hot reload
- `hot_restart` - Hot restart
- `get_tree` - Get interaction tree
- `execute_interaction` - Execute widget interaction
- `get_status` - Get daemon status
