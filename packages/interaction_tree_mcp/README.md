# interaction_tree_mcp

MCP (Model Context Protocol) server for `interaction_tree` - enables AI assistants to interact with Flutter apps.

## Overview

This package provides an MCP server that allows AI assistants like Claude, Cursor, or other MCP-compatible tools to:

- Connect to running Flutter apps via VM service WebSocket
- Get the interaction tree of widgets marked with `InteractionKey`
- Perform gestures (tap, double tap, long press, etc.)
- Enter and clear text in text fields
- Scroll and drag widgets
- Execute custom actions defined via `InteractableMixin`
- Run batch operations and interaction flows

## Installation

Add to your `pubspec.yaml`:

```yaml
dev_dependencies:
  interaction_tree_mcp: ^0.1.0
```

## Usage

### Running the MCP Server

Run the server directly:

```bash
dart run interaction_tree_mcp
```

### Configure MCP Client

Add to your MCP client configuration (e.g., Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "interaction_tree": {
      "command": "dart",
      "args": ["run", "interaction_tree_mcp"],
      "cwd": "/path/to/your/flutter/project"
    }
  }
}
```

### Flutter App Setup

Your Flutter app must use `interaction_tree_driver` to enable the driver extensions:

```dart
import 'package:interaction_tree_driver/interaction_tree_driver.dart';

void main() {
  enableInteractionTreeDriver();
  runApp(const MyApp());
}
```

Mark widgets with `InteractionKey` to make them discoverable:

```dart
ElevatedButton(
  key: InteractionKey('login_button', description: 'Login button'),
  onPressed: () => login(),
  child: const Text('Login'),
)
```

## Available Tools

### Connection

| Tool | Description |
|------|-------------|
| `connect` | Connect to a running Flutter app via VM service WebSocket URI |
| `disconnect` | Disconnect from the currently connected Flutter app |

### Discovery

| Tool | Description |
|------|-------------|
| `get_tree` | Get all InteractionKey-marked widgets with their capabilities |
| `get_state` | Get the current state of a widget (text value, enabled, visible) |

### Gestures

| Tool | Description |
|------|-------------|
| `tap` | Tap on a widget |
| `doubleTap` | Double-tap on a widget |
| `longPress` | Long-press on a widget |

### Text Input

| Tool | Description |
|------|-------------|
| `enterText` | Enter text into a text field |
| `clearText` | Clear text from a text field |

### Scrolling

| Tool | Description |
|------|-------------|
| `scroll` | Scroll a scrollable widget by delta |
| `scrollIntoView` | Scroll until a widget is visible |
| `drag` | Drag a widget by offset |

### Waiting

| Tool | Description |
|------|-------------|
| `waitFor` | Wait for a widget to reach a state (exists, notExists, visible, notVisible) |

### Custom Actions

| Tool | Description |
|------|-------------|
| `executeAction` | Execute a custom action defined via InteractableMixin |

### Batch Operations

| Tool | Description |
|------|-------------|
| `batch` | Execute multiple interactions in sequence |
| `runFlow` | Execute a saved interaction flow |

## Example Workflow

1. Start your Flutter app with `flutter run`
2. Note the VM service WebSocket URI from the output
3. Use the `connect` tool with that URI
4. Use `get_tree` to discover available widgets
5. Interact with widgets using `tap`, `enterText`, etc.
6. Use `disconnect` when done

## License

BSD-3-Clause
