# Migration Plan: InteractionKey API

## Vision

Unified API that provides:
- **Runtime**: Full `WidgetTester`-like interactions via VM service (for LLMs)
- **Test-time**: Works alongside `flutter_test` (users bring their own)
- **Discoverability**: `InteractionKey` marks interactable widgets - LLM only sees these

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's App                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  TextField(key: InteractionKey('email'))                    ││
│  │  ElevatedButton(key: InteractionKey('submit'))              ││
│  │  Text('Other widgets invisible to LLM')                     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   interaction_tree                               │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │InteractionKey│  │ Interactor   │  │ VM Service Extensions  │ │
│  │  (marking)   │  │ (execution)  │  │ (LLM interface)        │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
│                           │                                      │
│                    ┌──────┴──────┐                               │
│                    ▼             ▼                               │
│         ┌─────────────────┐  ┌─────────────────┐                 │
│         │InteractionFinder│  │ Pointer/Text    │                 │
│         │ (discovery)     │  │ Dispatch        │                 │
│         └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘

Tests: User brings flutter_test, can use InteractionKey with find.byKey()
```

## New API Design

### 1. InteractionKey (replaces Interactable widget)

```dart
/// Marks a widget as interactable for LLM/runtime discovery
class InteractionKey extends LocalKey {
  const InteractionKey(
    this.id, {
    this.description,
    this.semanticLabel,  // for accessibility/LLM understanding
  });

  final String id;
  final String? description;
  final String? semanticLabel;

  @override
  bool operator ==(Object other) =>
      other is InteractionKey && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

// Usage - much simpler than before!
TextField(
  key: InteractionKey('email', description: 'Email input'),
  controller: _emailController,
)
```

### 2. InteractionFinder (our own, focused on InteractionKey only)

```dart
/// Finds only InteractionKey-marked widgets - LLM's view of the app
class InteractionFinder {
  InteractionFinder._();
  
  /// Find by exact id
  InteractionTarget? byId(String id);
  
  /// Find by description pattern
  List<InteractionTarget> byDescription(Pattern pattern);
  
  /// Find all InteractionKey widgets
  List<InteractionTarget> all();
  
  /// Find by widget type (within InteractionKey-marked widgets only)
  List<InteractionTarget> byWidgetType<T extends Widget>();
}

/// Discovered widget with inferred capabilities
class InteractionTarget {
  final String id;
  final String? description;
  final Element element;
  final Set<InteractionCapability> capabilities; // inferred from widget type

  Offset get center => /* from RenderBox */;
  RenderBox get renderBox => element.renderObject as RenderBox;
}

enum InteractionCapability { tap, doubleTap, longPress, enterText, drag, scroll, toggle }
```

### 3. Interactor (runtime execution)

```dart
/// Runtime widget interaction - same mechanics as WidgetTester
class Interactor {
  Interactor._();
  static final instance = Interactor._();

  /// Finder for InteractionKey widgets only
  final InteractionFinder find = InteractionFinder._();

  /// Get tree structure for LLM context
  Map<String, Object?> getTree();

  // === Interactions (by id - simple for LLM) ===

  Future<void> tap(String id);
  Future<void> doubleTap(String id);
  Future<void> longPress(String id);
  Future<void> enterText(String id, String text);
  Future<void> drag(String id, Offset offset);
  Future<void> scroll(String id, Offset delta);

  // === Advanced (by position) ===

  Future<void> tapAt(Offset position);
  Future<void> dispatchPointerEvent(PointerEvent event);
}
```

### 4. VM Service API (simplified)

```dart
// ext.interaction_tree.getTree -> returns discovered InteractionKeys with capabilities
// ext.interaction_tree.tap { id: "email" }
// ext.interaction_tree.enterText { id: "email", text: "test@example.com" }
// ext.interaction_tree.drag { id: "slider", dx: 100, dy: 0 }
```

## What Changes

### REMOVE (legacy code)

| File | Reason |
|------|--------|
| `core/interactable.dart` | Replaced by `InteractionKey` - no wrapper widget needed |
| `core/interaction.dart` | Interactions inferred from widget type, not declared |
| `core/interaction_parameter.dart` | Parameters are standard (text, offset) not custom |
| `core/interaction_args.dart` | Simplified to standard types |
| `interactions/gesture_interactions.dart` | Built into `Interactor` |
| `interactions/text_interactions.dart` | Built into `Interactor` |
| `widgets/interaction_scope.dart` | No InheritedWidget needed - uses global binding |

### KEEP (still useful)

| File | Changes |
|------|---------|
| `core/interaction_node.dart` | Rename to `InteractionTarget`, simplify |
| `core/interaction_result.dart` | Keep for VM service responses |
| `service/vm_service_extension.dart` | Simplify API surface |
| `recording/*` | Keep for flow recording (update to new API) |
| `codegen/*` | Update to generate standard tester calls |

### ADD (new)

| File | Purpose |
|------|---------|
| `interaction_key.dart` | The `InteractionKey` class |
| `interaction_finder.dart` | `InteractionFinder` - our focused finder for InteractionKey widgets |
| `interactor.dart` | Runtime `Interactor` with pointer/text dispatch |
| `capabilities.dart` | Widget type → interaction capability inference |

## Test Compatibility

### Writing tests (user brings flutter_test)

```dart
// User's test file - they import flutter_test themselves
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

testWidgets('login flow', (tester) async {
  await tester.pumpWidget(MyApp());

  // Option A: Use Interactor directly (same code works at runtime!)
  await Interactor.instance.tap('email');
  await Interactor.instance.enterText('email', 'test@example.com');
  await Interactor.instance.tap('submit');
  await tester.pumpAndSettle();

  // Option B: Use flutter_test with InteractionKey (standard find.byKey)
  await tester.tap(find.byKey(const InteractionKey('email')));
  await tester.enterText(find.byKey(const InteractionKey('email')), 'test@example.com');

  // Assertions use standard flutter_test
  expect(find.text('Welcome'), findsOneWidget);
});
```

### Runtime (LLM via VM service)

```json
// MCP tool calls - simple id-based API
{ "tool": "interaction_tree__tap", "arguments": { "id": "email" } }
{ "tool": "interaction_tree__enterText", "arguments": { "id": "email", "text": "test@example.com" } }
{ "tool": "interaction_tree__tap", "arguments": { "id": "submit" } }

// Discovery
{ "tool": "interaction_tree__getTree" }
// Returns only InteractionKey-marked widgets with their capabilities
```

## Capability Inference

Automatic interaction detection from widget/render types:

```dart
Set<InteractionType> inferCapabilities(Element element) {
  final widget = element.widget;
  final renderObject = element.renderObject;

  final caps = <InteractionType>{};

  // All visible widgets can be tapped
  if (renderObject is RenderBox) {
    caps.add(InteractionType.tap);
  }

  // Text input
  if (widget is EditableText || widget is TextField || widget is TextFormField) {
    caps.add(InteractionType.enterText);
  }

  // Scrollable
  if (widget is ScrollView || widget is ListView || widget is SingleChildScrollView) {
    caps.add(InteractionType.scroll);
  }

  // Draggable
  if (widget is Slider || widget is Draggable || widget is ReorderableListView) {
    caps.add(InteractionType.drag);
  }

  // Toggle
  if (widget is Checkbox || widget is Switch || widget is Radio) {
    caps.add(InteractionType.toggle);
  }

  return caps;
}
```

## Migration Steps

### Phase 1: Core API
- [ ] Implement `InteractionKey` (extends `LocalKey`)
- [ ] Implement `InteractionFinder` (walks element tree for InteractionKey widgets)
- [ ] Implement `InteractionTarget` with capability inference
- [ ] Implement `Interactor` with pointer/text dispatch

### Phase 2: VM Service
- [ ] Simplify to action-based API (`tap`, `enterText`, `drag`, etc.)
- [ ] Update MCP server to new API
- [ ] `getTree` returns only InteractionKey widgets with capabilities

### Phase 3: Cleanup
- [ ] Remove legacy: `Interactable`, `Interaction`, `InteractionParameter`, `InteractionArgs`
- [ ] Remove legacy: `GestureInteractions`, `TextInteractions` (built into Interactor)
- [ ] Remove legacy: `InteractionScope`, `InteractionOwner` (no InheritedWidget needed)
- [ ] Update example app to use `InteractionKey`
- [ ] Update recording/codegen to new API

## LLM Efficacy

The new API maintains LLM effectiveness:

1. **Focused view**: LLM only sees `InteractionKey` widgets - no noise from framework internals
2. **Simple actions**: `tap(id)`, `enterText(id, text)` - no parameter schemas needed
3. **Capability hints**: Inferred from widget type - LLM knows what's possible
4. **Arbitrary flows**: LLM can chain any sequence of actions

Example `getTree` response:
```json
{
  "targets": [
    {
      "id": "email",
      "description": "Email input",
      "capabilities": ["tap", "enterText"],
      "widgetType": "TextField",
      "bounds": { "x": 16, "y": 100, "width": 328, "height": 56 }
    },
    {
      "id": "password",
      "description": "Password input",
      "capabilities": ["tap", "enterText"],
      "widgetType": "TextField",
      "bounds": { "x": 16, "y": 172, "width": 328, "height": 56 }
    },
    {
      "id": "submit",
      "description": "Login button",
      "capabilities": ["tap"],
      "widgetType": "ElevatedButton",
      "bounds": { "x": 16, "y": 244, "width": 328, "height": 48 }
    }
  ]
}
```

## Summary: Old vs New

| Aspect | Old API | New API |
|--------|---------|---------|
| **Marking** | `Interactable(id:..., interactions:[...])` wrapper | `key: InteractionKey('id')` |
| **Interactions** | Manual declaration per widget | Auto-inferred from widget type |
| **Discovery** | Custom tree via `InteractionScope` | Walk element tree for `InteractionKey` |
| **Execution** | `controller.execute(targetId, interaction, args)` | `Interactor.tap(id)` |
| **Finder** | Custom `InteractionNode` tree | `InteractionFinder` (our own, focused) |
| **Tests** | Custom API | Use `Interactor` OR standard `find.byKey(InteractionKey(...))` |
| **Dependencies** | None | None (no flutter_test re-export) |
