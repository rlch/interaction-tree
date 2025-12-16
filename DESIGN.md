# Interaction Tree - Design Plan

## Vision

An **interaction tree** is a parallel tree structure in Flutter that enables:
1. **LLM-driven interaction** - LLMs can inspect and interact with a Flutter app at runtime
2. **QA automation** - Programmatic verification of app behavior without manual interaction
3. **Test recording & replay** - Capture interaction flows and replay them as integration tests
4. **Flow composition** - Save and reuse interaction sequences as reusable flows

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FLUTTER APP                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Widget Tree ──► Element Tree ──► Render Tree                       │
│        │                                  │                          │
│        ▼                                  ▼                          │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │              INTERACTION TREE                            │       │
│   │                                                          │       │
│   │  InteractionScope (root)                                 │       │
│   │    └─► InteractionNode                                   │       │
│   │          ├─► InteractionNode                             │       │
│   │          │     └─► InteractionNode                       │       │
│   │          └─► InteractionNode                             │       │
│   │                                                          │       │
│   │  Built from widgets with `Interactable` mixin            │       │
│   └─────────────────────────────────────────────────────────┘       │
│                          │                                           │
│                          ▼                                           │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │              INTERACTION SERVICE                         │       │
│   │  - Tree serialization (for LLM consumption)              │       │
│   │  - Command execution                                     │       │
│   │  - Flow recording                                        │       │
│   │  - Flutter Driver / integration_test bridge              │       │
│   └─────────────────────────────────────────────────────────┘       │
│                          │                                           │
└──────────────────────────┼───────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │    EXTERNAL AGENTS     │
              │  - LLM (via VM Service │
              │    extension or HTTP)  │
              │  - Test harness        │
              │  - Dev tools           │
              └────────────────────────┘
```

---

## Core Components

### 1. `Interactable` Mixins

Two mixins for flexibility - one for State (primary), one for StatelessWidget or wrapping.

```dart
/// Primary: Use on State classes (has full access to controllers, methods, setState)
mixin InteractableStateMixin<T extends StatefulWidget> on State<T> {
  /// Human-readable description for LLM context
  String get interactionDescription;
  
  /// Unique identifier within the tree (required for addressing)
  String get interactionId;
  
  /// Available interactions this node supports
  List<InteractionDefinition> describeInteractions();
}

/// Secondary: Use on StatelessWidget or for simple cases
mixin InteractableWidgetMixin on Widget {
  /// Human-readable description for LLM context
  String get interactionDescription;
  
  /// Unique identifier within the tree (required for addressing)
  String get interactionId;
  
  /// Available interactions this node supports
  List<InteractionDefinition> describeInteractions();
}

/// Wrapper widget for third-party widgets or inline definitions
class Interactable extends StatefulWidget {
  const Interactable({
    required this.id,
    required this.description,
    required this.interactions,
    required this.child,
    super.key,
  });
  
  final String id;
  final String description;
  final List<InteractionDefinition> Function(BuildContext context) interactions;
  final Widget child;
}
### 2. `Interaction` Class

Describes a single interaction with factory constructors for common patterns. Inspired by Playwright's fluent API.

```dart
/// Defines an interaction available on a node
@immutable
class Interaction {
  const Interaction._({
    required this.name,
    required this.description,
    required this.execute,
    this.parameters = const [],
  });
  
  final String name;
  final String description;
  final List<InteractionParameter> parameters;
  final Future<void> Function(InteractionArgs args) execute;
  
  // ============ Factory Constructors ============
  
  /// Custom action with optional parameters
  factory Interaction.action({
    required String name,
    required String description,
    List<InteractionParameter> Function(ParameterBuilder p)? parameters,
    required FutureOr<void> Function([InteractionArgs? args]) action,
  }) {
    return Interaction._(
      name: name,
      description: description,
      parameters: parameters?.call(const ParameterBuilder()) ?? const [],
      execute: (args) async => action(args),
    );
  }
  
  /// Tap gesture - dispatches real pointer events
  factory Interaction.tap({
    String name = 'tap',
    required String description,
    required VoidCallback onTap,
  }) {
    return Interaction._(
      name: name,
      description: description,
      execute: (_) async => onTap(),
    );
  }
  
  /// Fill text field
  factory Interaction.fill({
    String name = 'fill',
    String description = 'Enter text',
    required TextEditingController controller,
  }) {
    return Interaction._(
      name: name,
      description: description,
      parameters: [
        const StringParameter(name: 'text', description: 'Text to enter'),
      ],
      execute: (args) async {
        controller.text = args.get<String>('text');
      },
    );
  }
  
  /// Clear text field
  factory Interaction.clear({
    String name = 'clear',
    String description = 'Clear text',
    required TextEditingController controller,
  }) {
    return Interaction._(
      name: name,
      description: description,
      execute: (_) async => controller.clear(),
    );
  }
  
  /// Select from enum/list options
  factory Interaction.select<T>({
    required String name,
    required String description,
    required List<T> options,
    required void Function(T value) onSelect,
    String Function(T)? labelBuilder,
  }) {
    return Interaction._(
      name: name,
      description: description,
      parameters: [
        SelectParameter<T>(
          name: 'value',
          description: 'Value to select',
          options: options,
          labelBuilder: labelBuilder ?? (v) => v.toString(),
        ),
      ],
      execute: (args) async => onSelect(args.get<T>('value')),
    );
  }
  
  /// Serialize for LLM
  InteractionJson toJson() => InteractionJson(
    name: name,
    description: description,
    parameters: parameters.map((p) => p.toJson()).toList(),
  );
}
```

### 3. `InteractionParameter` (Sealed)

Strongly-typed parameter definitions:

```dart
@immutable
sealed class InteractionParameter {
  const InteractionParameter({
    required this.name,
    required this.description,
    this.isRequired = true,
  });
  
  final String name;
  final String description;
  final bool isRequired;
  
  /// Parse and validate value from JSON
  Object? parse(Object? value);
  
  /// Serialize for LLM
  InteractionParameterJson toJson();
}

final class StringParameter extends InteractionParameter {
  const StringParameter({
    required super.name,
    required super.description,
    super.isRequired,
    this.defaultValue,
  });
  final String? defaultValue;
  
  @override
  InteractionParameterJson toJson() => InteractionParameterJson(
    name: name,
    description: description,
    type: 'string',
    isRequired: isRequired,
    defaultValue: defaultValue,
  );
}

final class IntParameter extends InteractionParameter {
  const IntParameter({
    required super.name,
    required super.description,
    super.isRequired,
    this.defaultValue,
    this.min,
    this.max,
  });
  final int? defaultValue;
  final int? min;
  final int? max;
}

final class DoubleParameter extends InteractionParameter {
  const DoubleParameter({
    required super.name,
    required super.description,
    super.isRequired,
    this.defaultValue,
    this.min,
    this.max,
  });
  final double? defaultValue;
  final double? min;
  final double? max;
}

final class BoolParameter extends InteractionParameter {
  const BoolParameter({
    required super.name,
    required super.description,
    super.isRequired,
    this.defaultValue,
  });
  final bool? defaultValue;
}

final class SelectParameter<T> extends InteractionParameter {
  const SelectParameter({
    required super.name,
    required super.description,
    required this.options,
    required this.labelBuilder,
    super.isRequired,
    this.defaultValue,
  });
  final List<T> options;
  final String Function(T) labelBuilder;
  final T? defaultValue;
}
```

### 4. `InteractionArgs` and `ParameterBuilder`

```dart
/// Type-safe argument access (passed to interaction handlers)
@immutable
class InteractionArgs {
  const InteractionArgs(this._values);
  final Map<String, Object?> _values;
  
  /// Get required value
  T get<T>(String name) {
    final value = _values[name];
    if (value == null) throw ArgumentError('Missing required argument: $name');
    return value as T;
  }
  
  /// Get optional value
  T? getOrNull<T>(String name) => _values[name] as T?;
  
  /// Check if argument exists
  bool has(String name) => _values.containsKey(name);
}

/// Fluent builder for parameters (used in Interaction.action)
class ParameterBuilder {
  const ParameterBuilder();
  
  StringParameter string(String name, String description, {
    bool required = true,
    String? defaultValue,
  }) => StringParameter(
    name: name,
    description: description,
    isRequired: required,
    defaultValue: defaultValue,
  );
  
  IntParameter int_(String name, String description, {
    bool required = true,
    int? defaultValue,
    int? min,
    int? max,
  }) => IntParameter(
    name: name,
    description: description,
    isRequired: required,
    defaultValue: defaultValue,
    min: min,
    max: max,
  );
  
  DoubleParameter double_(String name, String description, {
    bool required = true,
    double? defaultValue,
    double? min,
    double? max,
  }) => DoubleParameter(
    name: name,
    description: description,
    isRequired: required,
    defaultValue: defaultValue,
    min: min,
    max: max,
  );
  
  BoolParameter bool_(String name, String description, {
    bool required = true,
    bool? defaultValue,
  }) => BoolParameter(
    name: name,
    description: description,
    isRequired: required,
    defaultValue: defaultValue,
  );
  
  SelectParameter<T> select<T>(
    String name,
    String description,
    List<T> options, {
    bool required = true,
    T? defaultValue,
    String Function(T)? labelBuilder,
  }) => SelectParameter<T>(
    name: name,
    description: description,
    options: options,
    labelBuilder: labelBuilder ?? (v) => v.toString(),
    isRequired: required,
    defaultValue: defaultValue,
  );
}
```

### 5. `InteractionNode`

Runtime tree node holding the interaction state.

```dart
@immutable
class InteractionNode with DiagnosticableTreeMixin {
  const InteractionNode({
    required this.id,
    required this.description,
    required this.interactions,
    required this.children,
    this.parent,
    this.metadata = const InteractionMetadata(),
  });
  
  /// Unique ID for addressing
  final String id;
  
  /// Description from the Interactable
  final String description;
  
  /// Available interactions
  final List<InteractionDefinition> interactions;
  
  /// Parent node (null for root)
  final InteractionNode? parent;
  
  /// Child nodes
  final List<InteractionNode> children;
  
  /// Metadata for LLM context
  final InteractionMetadata metadata;
  
  /// Path from root (for addressing)
  String get path {
    if (parent == null) return id;
    return '${parent!.path}/$id';
  }
  
  /// Find interaction by name
  InteractionDefinition? findInteraction(String name) {
    return interactions.where((i) => i.name == name).firstOrNull;
  }
  
  /// Serialize for LLM consumption
  InteractionNodeJson toJson({bool includeChildren = true});
}

/// Strongly-typed metadata
@immutable
class InteractionMetadata {
  const InteractionMetadata({
    this.widgetType,
    this.visibleText,
    this.isEnabled = true,
    this.isVisible = true,
    this.semanticLabel,
  });
  
  final String? widgetType;
  final String? visibleText;
  final bool isEnabled;
  final bool isVisible;
  final String? semanticLabel;
  
  Map<String, Object?> toJson() => {
    if (widgetType != null) 'widgetType': widgetType,
    if (visibleText != null) 'visibleText': visibleText,
    if (semanticLabel != null) 'semanticLabel': semanticLabel,
    'isEnabled': isEnabled,
    'isVisible': isVisible,
  };
}

/// JSON representation for serialization
@immutable
class InteractionNodeJson {
  const InteractionNodeJson({
    required this.id,
    required this.description,
    required this.interactions,
    required this.metadata,
    this.children = const [],
  });
  
  final String id;
  final String description;
  final List<InteractionDefinitionJson> interactions;
  final Map<String, Object?> metadata;
  final List<InteractionNodeJson> children;
  
  Map<String, Object?> toMap() => {
    'id': id,
    'description': description,
    'interactions': interactions.map((i) => i.toMap()).toList(),
    'metadata': metadata,
    if (children.isNotEmpty) 'children': children.map((c) => c.toMap()).toList(),
  };
}

@immutable
class InteractionDefinitionJson {
  const InteractionDefinitionJson({
    required this.name,
    required this.description,
    this.parameters = const [],
  });
  
  final String name;
  final String description;
  final List<InteractionParameterJson> parameters;
  
  Map<String, Object?> toMap() => {
    'name': name,
    'description': description,
    if (parameters.isNotEmpty) 'parameters': parameters.map((p) => p.toMap()).toList(),
  };
}

@immutable
class InteractionParameterJson {
  const InteractionParameterJson({
    required this.name,
    required this.description,
    required this.type,
    required this.isRequired,
    this.defaultValue,
    this.constraints,
  });
  
  final String name;
  final String description;
  final String type; // 'string', 'int', 'double', 'bool', 'enum'
  final bool isRequired;
  final Object? defaultValue;
  final Map<String, Object?>? constraints; // min, max, pattern, values, etc.
  
  Map<String, Object?> toMap() => {
    'name': name,
    'description': description,
    'type': type,
    'required': isRequired,
    if (defaultValue != null) 'default': defaultValue,
    if (constraints != null) 'constraints': constraints,
  };
}
```

### 6. `InteractionScope` Widget

Root widget that builds and maintains the interaction tree.

```dart
class InteractionScope extends InheritedWidget {
  /// Enable/disable interaction tree building
  final bool enabled;
  
  /// Configuration for the interaction service
  final InteractionConfiguration configuration;
  
  /// Access the nearest scope
  static InteractionScope? of(BuildContext context);
  
  /// Access the interaction owner
  static InteractionOwner ownerOf(BuildContext context);
}

class InteractionOwner {
  /// Root of the interaction tree
  InteractionNode? get rootNode;
  
  /// Rebuild the interaction tree
  void rebuild();
  
  /// Find node by ID or path
  InteractionNode? findById(String id);
  InteractionNode? findByPath(String path);
  
  /// Query nodes by criteria
  List<InteractionNode> query(InteractionQuery query);
  
  /// Serialize entire tree
  Map<String, Object?> serialize();
}
```

### 7. `InteractionResult` and Commands

Strongly typed result and command types.

```dart
/// Result of executing an interaction
sealed class InteractionResult {
  const InteractionResult({required this.duration});
  final Duration duration;
}

class InteractionSuccess extends InteractionResult {
  const InteractionSuccess({
    required super.duration,
    this.value,
  });
  
  /// Optional return value from the interaction
  final Object? value;
  
  Map<String, Object?> toJson() => {
    'success': true,
    'duration_ms': duration.inMilliseconds,
    if (value != null) 'value': value,
  };
}

class InteractionFailure extends InteractionResult {
  const InteractionFailure({
    required super.duration,
    required this.error,
    this.stackTrace,
  });
  
  final String error;
  final StackTrace? stackTrace;
  
  Map<String, Object?> toJson() => {
    'success': false,
    'duration_ms': duration.inMilliseconds,
    'error': error,
  };
}

/// Command to execute an interaction (from LLM via VM service)
@immutable
class InteractionCommand {
  const InteractionCommand({
    required this.targetId,
    required this.interaction,
    this.arguments = const {},
    this.timeout,
  });
  
  /// Node ID to target
  final String targetId;
  
  /// Interaction name to execute
  final String interaction;
  
  /// Arguments for the interaction (validated against parameter schema)
  final Map<String, Object?> arguments;
  
  /// Optional timeout
  final Duration? timeout;
  
  factory InteractionCommand.fromJson(Map<String, Object?> json) {
    return InteractionCommand(
      targetId: json['targetId'] as String,
      interaction: json['interaction'] as String,
      arguments: (json['arguments'] as Map<String, Object?>?) ?? const {},
      timeout: json['timeout_ms'] != null 
          ? Duration(milliseconds: json['timeout_ms'] as int)
          : null,
    );
  }
}
```

---

## Communication Protocol: VM Service Extension

The LLM communicates with the Flutter app via Dart's VM Service protocol - a WebSocket JSON-RPC interface.

### How It Works

```
┌─────────────────┐                      ┌─────────────────────────┐
│  LLM / MCP      │   WebSocket          │  Flutter App            │
│  (e.g. Amp)     │ ◄─────────────────►  │                         │
│                 │   ws://127.0.0.1:xxx │  VM Service Extensions: │
│  1. getTree()   │                      │  - ext.interaction.get  │
│  2. execute()   │   JSON-RPC           │  - ext.interaction.exec │
│  3. record()    │                      │  - ext.interaction.rec  │
└─────────────────┘                      └─────────────────────────┘
```

**Connection Flow:**
1. Flutter app starts in debug/profile mode (VM service enabled by default)
2. App prints: `The Dart VM service is listening on ws://127.0.0.1:8181/...`
3. LLM connects via WebSocket (or uses Dart Tooling Daemon via MCP)
4. LLM calls registered extensions using JSON-RPC

### Service Extension Registration

```dart
import 'dart:developer' as developer;

class InteractionServiceExtension {
  final InteractionOwner owner;
  
  void register() {
    // Get the interaction tree (for LLM to understand what's available)
    developer.registerExtension(
      'ext.interaction_tree.getTree',
      (method, params) async {
        final tree = owner.serialize();
        return developer.ServiceExtensionResponse.result(
          jsonEncode(tree),
        );
      },
    );
    
    // Execute an interaction
    developer.registerExtension(
      'ext.interaction_tree.execute',
      (method, params) async {
        final command = InteractionCommand.fromJson(params);
        final result = await owner.execute(command);
        return developer.ServiceExtensionResponse.result(
          jsonEncode(result.toJson()),
        );
      },
    );
    
    // Start recording a flow
    developer.registerExtension(
      'ext.interaction_tree.startRecording',
      (method, params) async {
        owner.startRecording();
        return developer.ServiceExtensionResponse.result('{"started": true}');
      },
    );
    
    // Stop recording and get the flow
    developer.registerExtension(
      'ext.interaction_tree.stopRecording',
      (method, params) async {
        final flow = owner.stopRecording();
        return developer.ServiceExtensionResponse.result(
          jsonEncode(flow.toJson()),
        );
      },
    );
  }
}
```

### LLM Calling Convention (via MCP or direct WebSocket)

```json
// Request: Get tree
{
  "jsonrpc": "2.0",
  "method": "ext.interaction_tree.getTree",
  "params": {"isolateId": "isolates/123"},
  "id": "1"
}

// Response
{
  "jsonrpc": "2.0",
  "result": {
    "id": "root",
    "description": "App scaffold",
    "children": [...]
  },
  "id": "1"
}

// Request: Execute interaction
{
  "jsonrpc": "2.0", 
  "method": "ext.interaction_tree.execute",
  "params": {
    "isolateId": "isolates/123",
    "target": "login-form",
    "interaction": "fillAndSubmit",
    "arguments": {"email": "test@test.com", "password": "secret"}
  },
  "id": "2"
}
```

### Integration with Dart MCP Server

Using Amp's existing Dart MCP tools:

```
┌──────────────┐      MCP       ┌─────────────────┐      DTD/VM Service      ┌─────────────┐
│     Amp      │ ◄────────────► │  Dart MCP       │ ◄──────────────────────► │ Flutter App │
│    (LLM)     │                │  Server         │                          │             │
│              │                │                 │                          │ interaction │
│ mcp__dart__* │                │ Dart Tooling    │   ext.interaction_tree.* │ _tree pkg   │
└──────────────┘                │ Daemon bridge   │                          └─────────────┘
                                └─────────────────┘
```

**Workflow:**
1. `mcp__dart__launch_app` → Start Flutter app (returns DTD URI)
2. `mcp__dart__connect_dart_tooling_daemon` → Connect to running app
3. Dart MCP server can call VM service extensions on connected app
4. LLM calls `ext.interaction_tree.getTree` → Gets interaction tree JSON
5. LLM calls `ext.interaction_tree.execute` → Runs interactions

**Note:** The Dart MCP server already supports calling service extensions via the DTD connection. Our package just needs to register the `ext.interaction_tree.*` extensions.

---

## Flow Recording & Replay

### InteractionFlow

```dart
class InteractionFlow {
  final String id;
  final String name;
  final String? description;
  final List<InteractionStep> steps;
  final DateTime createdAt;
  final Map<String, Object?> metadata;
  
  /// Serialize to JSON (for storage/sharing)
  Map<String, Object?> toJson();
  
  /// Deserialize from JSON
  factory InteractionFlow.fromJson(Map<String, Object?> json);
  
  /// Convert to Flutter integration test code
  String toIntegrationTestCode();
  
  /// Convert to Patrol test code
  String toPatrolTestCode();
}

class InteractionStep {
  final String targetId;
  final String interaction;
  final Map<String, Object?> arguments;
  final Duration? delayBefore;
  final Duration? timeout;
  final List<Assertion>? assertions; // Post-step assertions
}

class Assertion {
  final String targetId;
  final AssertionType type;
  final Object? expectedValue;
}

enum AssertionType {
  exists,
  notExists,
  isVisible,
  isEnabled,
  hasText,
  hasValue,
  custom,
}
```

### Integration Test Code Generation

```dart
// Generated code example:
testWidgets('Login flow', (tester) async {
  await tester.pumpWidget(MyApp());
  
  // Step 1: Enter email
  await tester.enterText(
    find.byKey(Key('email-field')),
    'user@example.com',
  );
  await tester.pumpAndSettle();
  
  // Step 2: Enter password
  await tester.enterText(
    find.byKey(Key('password-field')),
    'password123',
  );
  await tester.pumpAndSettle();
  
  // Step 3: Tap submit
  await tester.tap(find.byKey(Key('submit-button')));
  await tester.pumpAndSettle();
  
  // Assertion: Home screen visible
  expect(find.byType(HomeScreen), findsOneWidget);
});
```

---

## LLM Interface

### Tree Representation for LLM

```json
{
  "tree": {
    "id": "root",
    "description": "Main application scaffold",
    "children": [
      {
        "id": "login-form",
        "description": "Login form with email and password fields",
        "interactions": [
          {
            "name": "submit",
            "description": "Submit the login form",
            "parameters": []
          }
        ],
        "children": [
          {
            "id": "email-field",
            "description": "Email input field",
            "metadata": {
              "currentValue": "",
              "hint": "Enter your email"
            },
            "interactions": [
              {
                "name": "enterText",
                "description": "Enter text into the email field",
                "parameters": [
                  {
                    "name": "text",
                    "type": "String",
                    "required": true,
                    "description": "The email address to enter"
                  }
                ]
              },
              {
                "name": "clear",
                "description": "Clear the email field"
              }
            ]
          },
          {
            "id": "password-field",
            "description": "Password input field (obscured)",
            "interactions": [...]
          },
          {
            "id": "submit-button",
            "description": "Submit button - triggers login",
            "metadata": {
              "enabled": true,
              "text": "Sign In"
            },
            "interactions": [
              {
                "name": "tap",
                "description": "Tap the submit button to attempt login"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### LLM Command Format

```json
{
  "command": "execute",
  "target": "email-field",
  "interaction": "enterText",
  "arguments": {
    "text": "user@example.com"
  }
}
```

### LLM Response Format

```json
{
  "success": true,
  "result": null,
  "duration_ms": 150,
  "tree_changed": true
}
```

---

## Implementation Phases (Simplified: LLM + Integration Test Focus)

### Phase 1: Core Infrastructure
- [ ] `Interactable` mixin
- [ ] `InteractionDefinition` and `InteractionParameter`
- [ ] `InteractionNode` tree structure
- [ ] `InteractionScope` widget
- [ ] `InteractionOwner` for tree management
- [ ] Basic tree building from widget tree

### Phase 2: Built-in Interactions
- [ ] Gesture interactions (tap, longPress, drag, scroll)
- [ ] Text input interactions (enterText, clear)
- [ ] Map to WidgetTester methods for execution

### Phase 3: VM Service Extension
- [ ] Register `ext.interaction_tree.*` extensions
- [ ] JSON serialization for LLM consumption
- [ ] Command execution from LLM requests

### Phase 4: Recording & Code Generation
- [ ] Interaction recorder
- [ ] `InteractionFlow` data structure
- [ ] Code generation for `integration_test` package
- [ ] Flow serialization to JSON (for storage/replay)

### Future Phases (Out of Scope for Now)
- MCP server for cleaner LLM integration
- Flow composition & parameterization
- DevTools extension UI
- Screenshot/visual assertions

---

## File Structure (Simplified)

```
lib/
├── interaction_tree.dart           # Main export barrel
├── src/
│   ├── core/
│   │   ├── interactable.dart       # Mixin
│   │   ├── interaction_definition.dart
│   │   ├── interaction_parameter.dart
│   │   ├── interaction_node.dart
│   │   ├── interaction_owner.dart
│   │   └── interaction_result.dart
│   ├── widgets/
│   │   └── interaction_scope.dart
│   ├── interactions/
│   │   ├── gesture_interactions.dart   # tap, longPress, drag, scroll
│   │   └── text_interactions.dart      # enterText, clear
│   ├── service/
│   │   └── vm_service_extension.dart   # ext.interaction_tree.*
│   ├── recording/
│   │   ├── interaction_recorder.dart
│   │   ├── interaction_flow.dart
│   │   └── interaction_step.dart
│   └── codegen/
│       └── integration_test_generator.dart
test/
├── core_test.dart
├── interactions_test.dart
├── recording_test.dart
└── codegen_test.dart
```

---

## Key Design Decisions

### 1. Mixins: Both State and Widget
- **`InteractableStateMixin`** (primary): For StatefulWidgets - has full access to controllers, methods, setState
- **`InteractableWidgetMixin`**: For StatelessWidgets or simple cases
- **`Interactable` widget**: Wrapper for third-party widgets
- Follows Flutter conventions (`Diagnosticable`, `TickerProvider`)

### 2. Eager Tree Building
- Tree stays in sync with widget tree at all times
- Enables real-time updates during animations/transitions
- Allows future event notifications to LLM

### 3. Real Pointer Events (not direct callbacks)
- Dispatch via `GestureBinding.instance.handlePointerEvent()`
- Tests actual gesture recognizer behavior (timeouts, slop, etc.)
- Matches real user interaction
- Works with any widget

### 4. Strongly Typed Throughout
- Sealed classes for `InteractionParameter` and `InteractionResult`
- `InteractionArguments` for type-safe argument access
- No `dynamic` except for JSON serialization boundaries
- Separate `*Json` classes for serialization

### 5. Explicit ID Addressing (for now)
- `execute(targetId: "submit-button", interaction: "tap")`
- Query selectors (`executeQuery`) deferred to later phase

### 6. VM Service Extension Only
- Uses existing Dart MCP tools
- No HTTP server or custom MCP server needed
- Package just registers `ext.interaction_tree.*` extensions

---

## DX Analysis: Learning from Playwright, Cypress, and Flutter

### What Makes Great Testing DX

| Framework | Key Strength | Pattern |
|-----------|-------------|---------|
| **Playwright** | Semantic locators, immutable composition | `page.getByRole('button', name: 'Login').click()` |
| **Cypress** | Fluent chaining, subject threading | `cy.get('form').find('input').type('hello')` |
| **Flutter** | Explicit time control, tree access | `tester.tap(find.byKey(Key('x'))); await tester.pumpAndSettle()` |

### Design Principles for Our API

1. **Declarative over imperative** - Describe what, not how
2. **Composition over configuration** - Build complex from simple
3. **Explicit IDs for LLM clarity** - No CSS selectors or predicates
4. **Actions return Futures** - Async-first for real pointer events
5. **Minimal boilerplate** - Make the common case easy

---

## Example Usage (Revised)

### 1. Defining Interactable State (Primary Pattern)

```dart
class LoginForm extends StatefulWidget {
  const LoginForm({super.key});
  
  @override
  State<LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<LoginForm> with InteractableStateMixin {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  
  @override
  String get interactionId => 'login-form';
  
  @override
  String get interactionDescription => 'Login form with email and password';
  
  @override
  List<Interaction> describeInteractions() => [
    // Simple action - no parameters
    Interaction.action(
      name: 'submit',
      description: 'Submit the form with current values',
      action: _handleSubmit,
    ),
    
    // Parameterized action - like Playwright's fill()
    Interaction.action(
      name: 'fill',
      description: 'Fill form fields',
      parameters: (p) => [
        p.string('email', 'Email address'),
        p.string('password', 'Password'),
      ],
      action: (args) async {
        _emailController.text = args.get<String>('email');
        _passwordController.text = args.get<String>('password');
      },
    ),
    
    // Compound action - fill + submit
    Interaction.action(
      name: 'login',
      description: 'Fill credentials and submit',
      parameters: (p) => [
        p.string('email', 'Email address'),
        p.string('password', 'Password'),
      ],
      action: (args) async {
        _emailController.text = args.get<String>('email');
        _passwordController.text = args.get<String>('password');
        await _handleSubmit();
      },
    ),
  ];
  
  Future<void> _handleSubmit() async {
    setState(() => _isLoading = true);
    await AuthService.login(
      _emailController.text,
      _passwordController.text,
    );
  }
  
  @override
  Widget build(BuildContext context) => // ...
}
```

### 2. Simpler Pattern for Individual Fields

```dart
class _EmailFieldState extends State<EmailField> with InteractableStateMixin {
  final _controller = TextEditingController();
  
  @override
  String get interactionId => 'email-field';
  
  @override
  String get interactionDescription => 'Email input field';
  
  @override
  List<Interaction> describeInteractions() => [
    // Built-in text field interactions
    Interaction.fill(
      controller: _controller,
      description: 'Enter email address',
    ),
    Interaction.clear(
      controller: _controller,
      description: 'Clear email field',
    ),
  ];
  
  @override
  Widget build(BuildContext context) => TextField(controller: _controller);
}
```

### 3. Wrapper for Third-Party Widgets

```dart
// Wrap widgets you don't control
Interactable(
  id: 'theme-toggle',
  description: 'Light/dark theme toggle',
  interactions: [
    Interaction.tap(
      description: 'Toggle theme',
      onTap: () => ThemeController.of(context).toggle(),
    ),
  ],
  child: const ThemeToggleButton(),
)
```

### 4. Stateless Widget Pattern

```dart
class SubmitButton extends StatelessWidget with InteractableWidgetMixin {
  const SubmitButton({required this.onPressed, super.key});
  
  final VoidCallback onPressed;
  
  @override
  String get interactionId => 'submit-button';
  
  @override  
  String get interactionDescription => 'Submit button';
  
  @override
  List<Interaction> describeInteractions() => [
    Interaction.tap(
      description: 'Tap to submit',
      onTap: onPressed,
    ),
  ];
  
  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: onPressed,
    child: const Text('Submit'),
  );
}
```

### 5. App Setup

```dart
void main() {
  runApp(
    InteractionScope(
      enabled: kDebugMode,
      child: const MyApp(),
    ),
  );
}
```

---

## Interaction Builder API

Inspired by Playwright's fluent API:

```dart
abstract class Interaction {
  // Factory constructors for common patterns
  
  /// Custom action with optional parameters
  factory Interaction.action({
    required String name,
    required String description,
    List<InteractionParameter> Function(ParameterBuilder p)? parameters,
    required FutureOr<void> Function([InteractionArgs? args]) action,
  });
  
  /// Tap gesture (uses real pointer events)
  factory Interaction.tap({
    String name = 'tap',
    required String description,
    required VoidCallback onTap,
  });
  
  /// Fill text (for TextEditingController)
  factory Interaction.fill({
    String name = 'fill',
    String description = 'Enter text',
    required TextEditingController controller,
  });
  
  /// Clear text
  factory Interaction.clear({
    String name = 'clear', 
    String description = 'Clear text',
    required TextEditingController controller,
  });
  
  /// Select from options
  factory Interaction.select<T>({
    required String name,
    required String description,
    required List<T> options,
    required void Function(T value) onSelect,
  });
}

/// Fluent parameter builder
class ParameterBuilder {
  StringParameter string(String name, String description, {bool required = true});
  IntParameter int_(String name, String description, {int? min, int? max});
  DoubleParameter double_(String name, String description, {double? min, double? max});
  BoolParameter bool_(String name, String description, {bool defaultValue = false});
  EnumParameter<T> enum_<T extends Enum>(String name, String description, List<T> values);
}

/// Type-safe argument access
class InteractionArgs {
  T get<T>(String name);
  T? getOrNull<T>(String name);
}
```

---

## LLM Interface (JSON over VM Service)

### Get Tree

```json
// Request
{"method": "ext.interaction_tree.getTree"}

// Response - flat structure with clear hierarchy
{
  "tree": {
    "id": "root",
    "description": "App root",
    "children": [
      {
        "id": "login-form",
        "description": "Login form with email and password",
        "interactions": [
          {
            "name": "submit",
            "description": "Submit the form with current values"
          },
          {
            "name": "fill",
            "description": "Fill form fields",
            "parameters": [
              {"name": "email", "type": "string", "required": true, "description": "Email address"},
              {"name": "password", "type": "string", "required": true, "description": "Password"}
            ]
          },
          {
            "name": "login",
            "description": "Fill credentials and submit",
            "parameters": [
              {"name": "email", "type": "string", "required": true, "description": "Email address"},
              {"name": "password", "type": "string", "required": true, "description": "Password"}
            ]
          }
        ],
        "children": [
          {
            "id": "email-field",
            "description": "Email input field",
            "metadata": {"value": "", "hint": "Enter email"},
            "interactions": [
              {"name": "fill", "description": "Enter email address", "parameters": [
                {"name": "text", "type": "string", "required": true}
              ]},
              {"name": "clear", "description": "Clear email field"}
            ]
          }
        ]
      }
    ]
  }
}
```

### Execute Interaction

```json
// Request
{
  "method": "ext.interaction_tree.execute",
  "params": {
    "id": "login-form",
    "interaction": "login",
    "args": {
      "email": "test@example.com",
      "password": "secret123"
    }
  }
}

// Response
{
  "success": true,
  "durationMs": 245,
  "settled": true  // animations complete
}

// Error response
{
  "success": false,
  "error": "Node not found: login-form",
  "durationMs": 2
}
```

---

## Generated Integration Test Code

When recording flows, generate idiomatic Flutter test code:

```dart
// Generated from recorded flow
testWidgets('User can log in', (tester) async {
  await tester.pumpWidget(const MyApp());
  await tester.pumpAndSettle();
  
  // Fill login form
  await tester.enterText(find.byKey(const Key('email-field')), 'test@example.com');
  await tester.enterText(find.byKey(const Key('password-field')), 'secret123');
  await tester.pumpAndSettle();
  
  // Submit
  await tester.tap(find.byKey(const Key('submit-button')));
  await tester.pumpAndSettle();
  
  // Verify
  expect(find.byType(HomeScreen), findsOneWidget);
});
```

---

## Open Questions

1. **Tree Building Strategy**: Build lazily on demand vs eagerly maintain in sync with widget tree?
2. **Node Lifecycle**: How to handle nodes for widgets that unmount/remount?
3. **Async State**: How to represent loading/error states in the tree?
4. **Conflict Resolution**: What if multiple widgets have same interactionId?
5. **Performance**: How to minimize overhead in production builds?
6. **Security**: How to prevent unauthorized interaction execution?

---

## References

- Flutter Semantics: https://api.flutter.dev/flutter/semantics/semantics-library.html
- Diagnosticable: https://api.flutter.dev/flutter/foundation/Diagnosticable-class.html
- integration_test: https://docs.flutter.dev/testing/integration-tests
- flutter_driver: https://api.flutter.dev/flutter/flutter_driver/flutter_driver-library.html
- VM Service Protocol: https://github.com/dart-lang/sdk/blob/main/runtime/vm/service/service.md
