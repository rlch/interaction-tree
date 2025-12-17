# interaction_tree

A Flutter package for annotating widgets with interaction metadata for automated testing and AI-driven interactions.

## Features

- **InteractionKey**: A custom key for marking widgets as interactive
- **InteractableMixin**: Define custom actions on stateful widgets
- **InteractionContext**: Add contextual descriptions to widget subtrees
- **TreeDiff**: Detect changes between tree states
- **DiagnosticCollector**: Capture logs, errors, and warnings during interactions
- **Finder Helper**: `interaction('id')` finder for use with `flutter_test`

## Installation

```yaml
dependencies:
  interaction_tree:
    git:
      url: https://github.com/rlch/interaction-tree
      path: .
```

## Usage

### Annotating Widgets

```dart
import 'package:interaction_tree/interaction_tree.dart';

class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton(
          key: const InteractionKey(
            'login_button',
            description: 'Submits the login form',
          ),
          onPressed: () => _login(),
          child: const Text('Login'),
        ),
        TextField(
          key: const InteractionKey('email_field'),
        ),
      ],
    );
  }
}
```

### Custom Actions with InteractableMixin

```dart
class CounterWidget extends StatefulWidget {
  const CounterWidget({super.key});

  @override
  State<CounterWidget> createState() => _CounterWidgetState();
}

class _CounterWidgetState extends State<CounterWidget> with InteractableMixin {
  int _counter = 0;

  @override
  String get interactionId => 'counter_widget';

  @override
  List<InteractionAction> get actions => [
    InteractionAction(
      name: 'increment',
      description: 'Increment the counter by 1',
      execute: (_) async {
        setState(() => _counter++);
      },
    ),
    InteractionAction(
      name: 'setCounter',
      description: 'Set the counter to a specific value',
      parameters: [
        const ActionParameter(
          name: 'value',
          type: 'int',
          description: 'The value to set',
        ),
      ],
      execute: (args) async {
        setState(() => _counter = args['value'] as int);
      },
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Text('Counter: $_counter', key: InteractionKey(interactionId));
  }
}
```

### Using in Widget Tests

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  testWidgets('can tap login button', (tester) async {
    await tester.pumpWidget(const MyApp());
    
    // Use the interaction() finder
    await tester.tap(interaction('login_button'));
    await tester.pumpAndSettle();
    
    expect(interaction('welcome_message'), findsOneWidget);
  });
}
```

### Adding Context

```dart
InteractionContext(
  description: 'User authentication form with email and password fields',
  child: Column(
    children: [
      TextField(key: const InteractionKey('email_field')),
      TextField(key: const InteractionKey('password_field')),
      ElevatedButton(key: const InteractionKey('submit_button'), ...),
    ],
  ),
)
```

## Related Packages

- [interaction_tree_driver](./packages/interaction_tree_driver) - Flutter Driver integration
- [interaction_tree_mcp](./packages/interaction_tree_mcp) - MCP server for AI interactions

## Daemon Architecture

For production use with multiple clients (Amp threads, TUI), use the central daemon architecture:

- [fleeter-daemon](./packages/fleeter-daemon) - Central daemon for session management
- [fleeter-mcp-proxy](./packages/fleeter-mcp-proxy) - MCP proxy for LLM clients

See [DAEMON_DESIGN.md](./DAEMON_DESIGN.md) for full architecture documentation.

## License

MIT License - see [LICENSE](LICENSE) for details.
