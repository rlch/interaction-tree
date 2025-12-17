# interaction_tree_driver

Flutter Driver integration for interaction_tree - custom finders and commands for automated testing.

## Features

- **InteractionKeyFinder**: SerializableFinder to locate widgets by InteractionKey ID
- **Custom Commands**: GetTreeCommand, ExecuteActionCommand, BatchCommand
- **Easy Setup**: `enableInteractionTreeDriver()` wrapper for app-side configuration

## Installation

```yaml
dependencies:
  interaction_tree_driver:
    git:
      url: https://github.com/rlch/interaction-tree
      path: packages/interaction_tree_driver
```

## App Setup

In your app's main entry point (or test driver entry point):

```dart
import 'package:flutter/material.dart';
import 'package:interaction_tree_driver/interaction_tree_driver.dart';

void main() {
  // Enable interaction tree driver extensions
  enableInteractionTreeDriver();
  
  runApp(const MyApp());
}
```

## Driver Test Setup

In your driver tests:

```dart
import 'package:flutter_driver/flutter_driver.dart';
import 'package:interaction_tree_driver/interaction_tree_driver.dart';
import 'package:test/test.dart';

void main() {
  late FlutterDriver driver;

  setUpAll(() async {
    driver = await FlutterDriver.connect();
  });

  tearDownAll(() async {
    await driver.close();
  });

  test('interact with widgets', () async {
    // Use InteractionKeyFinder with standard driver commands
    await driver.tap(const InteractionKeyFinder('login_button'));
    await driver.waitFor(const InteractionKeyFinder('welcome_message'));
    
    // Enter text
    await driver.tap(const InteractionKeyFinder('email_field'));
    await driver.enterText('test@example.com');
  });

  test('get interaction tree', () async {
    final result = await driver.sendCommand(const GetTreeCommand(
      includeBounds: true,
      includeWidgetType: true,
    ));
    
    final tree = GetTreeResult.fromJson(result as Map<String, dynamic>);
    print('Found ${tree.targets.length} interactive targets');
  });

  test('execute custom action', () async {
    final result = await driver.sendCommand(ExecuteActionCommand(
      const InteractionKeyFinder('counter_widget'),
      actionName: 'setCounter',
      args: {'value': 42},
      settle: true,
    ));
    
    final actionResult = ExecuteActionResult.fromJson(result as Map<String, dynamic>);
    expect(actionResult.success, isTrue);
  });

  test('batch multiple interactions', () async {
    final result = await driver.sendCommand(BatchCommand([
      const BatchStep(action: 'tap', id: 'email_field'),
      const BatchStep(action: 'enterText', id: 'email_field', text: 'user@example.com'),
      const BatchStep(action: 'tap', id: 'password_field'),
      const BatchStep(action: 'enterText', id: 'password_field', text: 'secret123'),
      const BatchStep(action: 'tap', id: 'login_button', settle: true),
    ]));
    
    final batchResult = BatchResult.fromJson(result as Map<String, dynamic>);
    expect(batchResult.success, isTrue);
  });
}
```

## Commands

### GetTreeCommand

Retrieves the full interaction tree from the app.

```dart
const GetTreeCommand(
  includeBounds: true,     // Include x, y, width, height
  includeWidgetType: true, // Include widget runtime type
  includeState: true,      // Include current state (text, enabled, visible)
)
```

### ExecuteActionCommand

Executes a custom action defined via InteractableMixin.

```dart
ExecuteActionCommand(
  const InteractionKeyFinder('widget_id'),
  actionName: 'myAction',
  args: {'param': 'value'},
  settle: true,  // Wait for animations to complete
)
```

### BatchCommand

Executes multiple interactions in sequence.

Supported actions:
- `tap` - Tap on a widget
- `doubleTap` - Double-tap on a widget
- `longPress` - Long press on a widget
- `enterText` - Enter text into a text field
- `clearText` - Clear text from a text field
- `drag` - Drag a widget by offset
- `scroll` - Scroll by offset
- `scrollIntoView` - Scroll until widget is visible
- `waitFor` - Wait for a condition (exists, notExists, visible, notVisible)
- `executeAction` - Execute a custom action

```dart
BatchCommand([
  const BatchStep(action: 'tap', id: 'button'),
  const BatchStep(action: 'enterText', id: 'field', text: 'hello'),
  const BatchStep(action: 'waitFor', id: 'result', condition: 'visible'),
])
```

## License

MIT License - see [LICENSE](../../LICENSE) for details.
