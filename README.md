# Interaction Tree

A Flutter package that enables LLMs to interact with Flutter apps at runtime via VM service extensions.

## Features

- **LLM-driven interaction** - LLMs can inspect and interact with a Flutter app at runtime
- **QA automation** - Programmatic verification of app behavior without manual interaction
- **Test recording & replay** - Capture interaction flows and replay them as integration tests
- **MCP Server** - Model Context Protocol server for LLM integration

## Installation

```yaml
dependencies:
  interaction_tree: ^0.0.1
```

## Quick Start

### 1. Wrap your app with InteractionScope

```dart
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  runApp(
    MaterialApp(
      home: InteractionScope(
        child: MyHomePage(),
      ),
    ),
  );
}
```

### 2. Make widgets interactable

**Option A: Using the mixin (recommended for StatefulWidgets)**

```dart
class _MyWidgetState extends State<MyWidget> 
    with InteractableStateMixin<MyWidget> {
  
  @override
  String get interactionId => 'my-widget';
  
  @override
  String get interactionDescription => 'A widget that does something';
  
  @override
  List<Interaction> describeInteractions() => [
    Interaction.tap(
      description: 'Tap to do something',
      onTap: _doSomething,
    ),
  ];
}
```

**Option B: Using the Interactable wrapper**

```dart
Interactable(
  id: 'submit-button',
  description: 'Submit button',
  interactions: (_) => [
    GestureInteractions.tapGesture(
      description: 'Tap to submit',
      onTap: _submit,
    ),
  ],
  child: ElevatedButton(
    onPressed: _submit,
    child: Text('Submit'),
  ),
)
```

### 3. Register the VM service (for LLM access)

```dart
@override
void didChangeDependencies() {
  super.didChangeDependencies();
  final controller = InteractionScope.of(context);
  InteractionService.register(controller);
}
```

## Using with LLMs via MCP

### Start the MCP Server

```bash
dart run interaction_tree:mcp_server
```

### Configure your MCP client

Add to your MCP configuration (e.g., Claude Desktop, Amp, etc.):

```json
{
  "mcpServers": {
    "interaction_tree": {
      "command": "dart",
      "args": ["run", "interaction_tree:mcp_server"],
      "cwd": "/path/to/your/flutter/project"
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `connect` | Connect to a running Flutter app via VM service URI |
| `disconnect` | Disconnect from the app |
| `get_tree` | Get the full interaction tree |
| `get_node` | Get a specific node by ID |
| `execute` | Execute an interaction |

### Example LLM Workflow

1. **Start your Flutter app**: `flutter run`
2. **Copy the VM service URI** from the output (e.g., `ws://127.0.0.1:12345/xxx=/ws`)
3. **Connect via MCP**:
   ```
   Use connect tool with uri: ws://127.0.0.1:12345/xxx=/ws
   ```
4. **Explore the tree**:
   ```
   Use get_tree to see available interactions
   ```
5. **Execute interactions**:
   ```
   Use execute with targetId: "email-field", interaction: "enterText", arguments: {"text": "user@example.com"}
   ```

## Built-in Interactions

### Gesture Interactions

```dart
GestureInteractions.tapGesture(...)
GestureInteractions.doubleTapGesture(...)
GestureInteractions.longPressGesture(...)
GestureInteractions.dragGesture(...)
GestureInteractions.scrollGesture(...)
GestureInteractions.swipeGesture(...)
```

### Text Interactions

```dart
TextInteractions.enterText(controller: controller)
TextInteractions.clearText(controller: controller)
TextInteractions.replaceText(controller: controller)
TextInteractions.selectAllText(controller: controller)
TextInteractions.submitText(onSubmit: callback)
```

### Core Interaction Factories

```dart
Interaction.tap(description: '...', onTap: callback)
Interaction.fill(controller: textController)
Interaction.clear(controller: textController)
Interaction.select(options: [...], onSelect: callback)
Interaction.toggle(getValue: () => value, onChanged: callback)
Interaction.increment(getValue: () => value, onChanged: callback)
Interaction.decrement(getValue: () => value, onChanged: callback)
Interaction.action(name: '...', description: '...', action: callback)
```

## Recording and Code Generation

### Record interactions

```dart
final controller = InteractionScope.of(context);
final recorder = InteractionRecorder(controller);

recorder.startRecording(name: 'Login Flow');

// ... perform interactions ...

recorder.stopRecording();
final flow = recorder.getFlow();
```

### Generate integration tests

```dart
final generator = IntegrationTestGenerator();
final testCode = generator.generate(flow);
print(testCode);
```

## Architecture

```
┌─────────────┐      MCP Protocol       ┌──────────────────────┐      VM Service      ┌─────────────┐
│    LLM      │ ◄─────────────────────► │  interaction_tree    │ ◄──────────────────► │ Flutter App │
│  (Claude)   │      (stdio)            │     MCP Server       │   (WebSocket)        │             │
└─────────────┘                         └──────────────────────┘                      └─────────────┘
```

## License

BSD-3-Clause
