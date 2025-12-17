# interaction-tree-server

MCP server for Flutter interaction tree with optional AI agent mode.

## Overview

This server provides two modes for interacting with Flutter apps that use the `interaction_tree` package:

- **Agent mode** (default): Uses Claude Agent SDK with Claude Code as runtime to interpret natural language intents and execute them against a Flutter app's interaction tree
- **Raw mode**: Direct tool access without AI, for programmatic control

## Installation

```bash
npm install interaction-tree-server
```

Or run directly:

```bash
npx interaction-tree-server
```

## Usage

### Agent Mode (default)

```bash
npx interaction-tree-server
```

Exposes an `execute_intent` tool that accepts natural language intents:

```json
{
  "intent": "Tap the login button and enter credentials",
  "context": ["username: test@example.com", "password: secret123"]
}
```

The agent will:
1. Check connection status
2. Get the interaction tree
3. Execute the necessary interactions
4. Return a summary of what happened

If the agent needs more information, it will return a `needs_context` response with a question.

### Raw Mode

```bash
INTERACTION_TREE_MODE=raw npx interaction-tree-server
```

Exposes direct tool access:

- `connect` - Connect to a Flutter app via VM service WebSocket URI
- `disconnect` - Disconnect from the app
- `get_status` - Get connection status
- `get_tree` - Get the interaction tree
- `tap`, `double_tap`, `long_press` - Gesture interactions
- `enter_text`, `clear_text` - Text input
- `scroll`, `drag`, `scroll_into_view` - Scroll interactions
- `wait_for` - Wait for widget state
- `get_state` - Get widget state
- `execute_action` - Execute custom actions
- `batch` - Execute multiple interactions in sequence
- `hot_reload`, `hot_restart` - Flutter hot reload/restart
- `get_logs`, `get_errors` - Get app logs and errors

## Configuration

### Environment Variables

- `INTERACTION_TREE_MODE`: `agent` (default) or `raw`

### MCP Client Configuration

Add to your MCP client config:

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

For raw mode:

```json
{
  "mcpServers": {
    "interaction-tree": {
      "command": "npx",
      "args": ["interaction-tree-server"],
      "env": {
        "INTERACTION_TREE_MODE": "raw"
      }
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Client (Claude, etc.)                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                  interaction-tree-server                         │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐             │
│  │     Agent Mode      │    │      Raw Mode       │             │
│  │                     │    │                     │             │
│  │  execute_intent     │    │  connect, tap,      │             │
│  │  (spawns sub-agent) │    │  scroll, batch...   │             │
│  └──────────┬──────────┘    └──────────┬──────────┘             │
│             │                          │                         │
│             ▼                          │                         │
│  ┌─────────────────────┐               │                         │
│  │ Claude Agent SDK    │               │                         │
│  │ (Claude Code runtime)│              │                         │
│  └──────────┬──────────┘               │                         │
│             │                          │                         │
│             └────────────┬─────────────┘                         │
│                          ▼                                       │
│             ┌─────────────────────┐                              │
│             │   VM Service Client │                              │
│             │   (WebSocket)       │                              │
│             └──────────┬──────────┘                              │
└────────────────────────┼────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Flutter App                                  │
│                                                                  │
│  ext.interaction_tree.getTree                                   │
│  ext.interaction_tree.execute                                   │
│  ext.interaction_tree.getState                                  │
│  ext.interaction_tree.batch                                     │
│  ext.flutter.reassemble (hot reload)                            │
│  ext.flutter.hotRestart                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Multi-turn Conversations

Agent mode supports multi-turn conversations for when the agent needs more information:

1. Call `execute_intent` with an intent
2. If agent returns `status: 'needs_context'`, it includes a `question` and optional `suggestions`
3. Call `execute_intent` again with `conversationId` and `answer` to continue

```json
// First call
{
  "intent": "Select a user from the list"
}

// Response
{
  "status": "needs_context",
  "question": "Which user should I select?",
  "suggestions": ["John Doe", "Jane Smith"],
  "conversationId": "uuid-123"
}

// Continuation
{
  "conversationId": "uuid-123",
  "answer": "John Doe"
}
```

## Requirements

- Node.js >= 20.0.0
- Flutter app with `interaction_tree` package configured
- Claude Code CLI in PATH (for agent mode)

## License

MIT
