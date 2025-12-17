# Interaction Tree TUI

A terminal-based monitoring interface for Flutter apps using the Interaction Tree package.

## Installation

```bash
cd tui
cargo build --release
cargo install --path .
```

## Usage

### Standalone

```bash
# Connect to running Flutter app
it-tui --uri ws://127.0.0.1:9000

# Watch mode - auto-reconnect
it-tui --uri ws://127.0.0.1:9000 --watch
```

### With Zellij Layouts

```bash
# Full development environment
zellij --layout tui/layouts/dev.kdl

# Monitor-only (full screen)
zellij --layout tui/layouts/monitor-only.kdl
```

## Key Bindings

| Key | Action |
|-----|--------|
| `q` / `Esc` | Quit |
| `↑` / `k` | Navigate up |
| `↓` / `j` | Navigate down |
| `Enter` / `Space` | Expand/collapse node |
| `e` | Expand all |
| `c` | Collapse all |
| `r` | Refresh tree |
| `s` | Toggle state panel |
| `f` | Filter/search |
| `/` | Quick search |
| `Tab` | Cycle focus between panels |
| `?` | Show help |

## Connection

The TUI connects to the Interaction Tree debug server running in your Flutter app.

### Flutter App Setup

1. Enable the debug server in your app:

```dart
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  // Start the debug server (dev builds only)
  InteractionTreeDebugServer.start(port: 9000);
  
  runApp(MyApp());
}
```

2. Run with the dart define:

```bash
flutter run -d macos --dart-define=INTERACTION_TREE_ENABLED=true
```

### Connection URI

Default: `ws://127.0.0.1:9000`

The server exposes a WebSocket endpoint that streams:
- Widget tree structure
- Interaction targets with keys
- State changes in real-time

## Layout Structure

The `dev.kdl` layout provides:

```
┌─────────────────────────────────────┬──────────────────────┐
│                                     │                      │
│           Code Editor               │    Flutter Run       │
│           (70% width)               │    (30% width)       │
│                                     │                      │
├─────────────────────────────────────┴──────────────────────┤
│                        IT-TUI                               │
│                     (30% height)                            │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### Connection refused
- Ensure the Flutter app is running with `INTERACTION_TREE_ENABLED=true`
- Check the port matches (default: 9000)

### No widgets showing
- Verify widgets are wrapped with `InteractionKey`
- Check the debug server is initialized before `runApp()`

### TUI not found
- Run `cargo install --path tui` from the repo root
- Ensure `~/.cargo/bin` is in your PATH
