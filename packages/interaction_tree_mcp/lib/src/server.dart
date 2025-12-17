import 'dart:async';
import 'dart:convert';

import 'package:dart_mcp/server.dart';

import 'driver_client.dart';

/// MCP server for interacting with Flutter apps via interaction_tree.
///
/// Provides tools for:
/// - Connecting to running Flutter apps
/// - Getting the interaction tree
/// - Performing gestures (tap, double tap, long press, etc.)
/// - Entering text
/// - Scrolling and dragging
/// - Executing custom actions
/// - Batch operations
base class InteractionTreeMcpServer extends MCPServer with ToolsSupport {
  InteractionTreeMcpServer(super.channel)
    : super.fromStreamChannel(
        implementation: Implementation(
          name: 'interaction_tree_mcp',
          version: '0.1.0',
        ),
        instructions: '''
An MCP server for interacting with Flutter apps using the interaction_tree package.

Connect to a running Flutter app via its VM service WebSocket URI, then use the
interaction tools to automate UI interactions.

Typical workflow:
1. connect - Connect to a running Flutter app
2. get_tree - Get all InteractionKey-marked widgets
3. tap/enterText/etc - Interact with widgets by their ID
4. disconnect - Close the connection
''',
      ) {
    _registerTools();
  }

  DriverClient? _client;

  void _registerTools() {
    registerTool(_connectTool, _handleConnect);
    registerTool(_disconnectTool, _handleDisconnect);
    registerTool(_getTreeTool, _handleGetTree);
    registerTool(_tapTool, _handleTap);
    registerTool(_doubleTapTool, _handleDoubleTap);
    registerTool(_longPressTool, _handleLongPress);
    registerTool(_enterTextTool, _handleEnterText);
    registerTool(_clearTextTool, _handleClearText);
    registerTool(_dragTool, _handleDrag);
    registerTool(_scrollTool, _handleScroll);
    registerTool(_scrollIntoViewTool, _handleScrollIntoView);
    registerTool(_waitForTool, _handleWaitFor);
    registerTool(_getStateTool, _handleGetState);
    registerTool(_executeActionTool, _handleExecuteAction);
    registerTool(_batchTool, _handleBatch);
    registerTool(_runFlowTool, _handleRunFlow);
  }

  // Tool definitions

  final _connectTool = Tool(
    name: 'connect',
    description:
        'Connect to a running Flutter app via its VM service WebSocket URI. '
        'Get the URI from flutter run output or DevTools.',
    inputSchema: Schema.object(
      properties: {
        'uri': Schema.string(
          description:
              'The VM service WebSocket URI (e.g., ws://127.0.0.1:12345/xxx=/ws)',
        ),
      },
      required: ['uri'],
    ),
  );

  final _disconnectTool = Tool(
    name: 'disconnect',
    description: 'Disconnect from the currently connected Flutter app.',
    inputSchema: Schema.object(properties: {}),
  );

  final _getTreeTool = Tool(
    name: 'get_tree',
    description:
        'Get all InteractionKey-marked widgets from the connected Flutter app. '
        'Returns a tree of targets with id, description, and capabilities. '
        'Use includeBounds/includeWidgetType/includeState for additional info.',
    inputSchema: Schema.object(
      properties: {
        'includeBounds': Schema.bool(
          description: 'Include global x/y/width/height for each target',
        ),
        'includeWidgetType': Schema.bool(
          description: 'Include the Flutter widget type name',
        ),
        'includeState': Schema.bool(
          description:
              'Include current state (text value, enabled, visible) for each target',
        ),
      },
    ),
  );

  final _tapTool = Tool(
    name: 'tap',
    description: 'Tap on a widget by its InteractionKey id.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
      },
      required: ['id'],
    ),
  );

  final _doubleTapTool = Tool(
    name: 'doubleTap',
    description: 'Double-tap on a widget by its InteractionKey id.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
      },
      required: ['id'],
    ),
  );

  final _longPressTool = Tool(
    name: 'longPress',
    description: 'Long-press on a widget by its InteractionKey id.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
      },
      required: ['id'],
    ),
  );

  final _enterTextTool = Tool(
    name: 'enterText',
    description: 'Enter text into a text field by its InteractionKey id.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
        'text': Schema.string(description: 'The text to enter'),
      },
      required: ['id', 'text'],
    ),
  );

  final _clearTextTool = Tool(
    name: 'clearText',
    description: 'Clear text from a text field by its InteractionKey id.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
      },
      required: ['id'],
    ),
  );

  final _dragTool = Tool(
    name: 'drag',
    description: 'Drag a widget by its InteractionKey id.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
        'dx': Schema.string(description: 'Horizontal drag distance'),
        'dy': Schema.string(description: 'Vertical drag distance'),
      },
      required: ['id'],
    ),
  );

  final _scrollTool = Tool(
    name: 'scroll',
    description: 'Scroll a scrollable widget by its InteractionKey id.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
        'dx': Schema.string(description: 'Horizontal scroll delta'),
        'dy': Schema.string(description: 'Vertical scroll delta'),
      },
      required: ['id'],
    ),
  );

  final _scrollIntoViewTool = Tool(
    name: 'scrollIntoView',
    description:
        'Scroll to make a widget visible. Automatically finds the nearest '
        'scrollable ancestor and scrolls until the target is in view.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
        'alignment': Schema.string(
          description:
              'Where to position the widget: 0.0 = top/start, 0.5 = center, 1.0 = bottom/end. Default: 0.0',
        ),
      },
      required: ['id'],
    ),
  );

  final _waitForTool = Tool(
    name: 'waitFor',
    description:
        'Wait for a widget to reach a certain state. Useful for waiting for async content to load.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
        'condition': Schema.string(
          description:
              'The condition to wait for: exists (default), notExists, visible, notVisible',
        ),
        'timeoutMs': Schema.int(
          description: 'Timeout in milliseconds. Default: 10000',
        ),
      },
      required: ['id'],
    ),
  );

  final _getStateTool = Tool(
    name: 'get_state',
    description:
        'Get the current state of a widget. Returns text content for text '
        'fields, enabled/disabled status, and visibility.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
      },
      required: ['id'],
    ),
  );

  final _executeActionTool = Tool(
    name: 'executeAction',
    description:
        'Execute a custom action defined on a widget via InteractableMixin. '
        'Actions are shown in the get_tree output under the "actions" field.',
    inputSchema: Schema.object(
      properties: {
        'id': Schema.string(description: 'The InteractionKey id of the target'),
        'actionName': Schema.string(
          description: 'The name of the action to execute',
        ),
        'args': Schema.object(
          description:
              'Arguments to pass to the action (as defined in the action\'s parameters)',
          properties: {},
        ),
      },
      required: ['id', 'actionName'],
    ),
  );

  final _batchTool = Tool(
    name: 'batch',
    description:
        'Execute multiple interactions in sequence as a single operation. '
        'Useful for reducing round-trips when performing a series of actions.',
    inputSchema: Schema.object(
      properties: {
        'steps': Schema.list(
          description:
              'Array of step objects, each with "action" and action-specific params',
          items: Schema.object(
            properties: {
              'action': Schema.string(
                description:
                    'The action: tap, doubleTap, longPress, enterText, clearText, drag, scroll, scrollIntoView, waitFor, executeAction',
              ),
              'id': Schema.string(description: 'The InteractionKey id'),
              'text': Schema.string(description: 'Text for enterText'),
              'dx': Schema.num(description: 'X offset for drag/scroll'),
              'dy': Schema.num(description: 'Y offset for drag/scroll'),
              'alignment': Schema.num(
                description: 'Alignment for scrollIntoView',
              ),
              'actionName': Schema.string(
                description: 'Action name for executeAction',
              ),
              'args': Schema.object(
                description: 'Arguments for executeAction',
                properties: {},
              ),
              'condition': Schema.string(description: 'Condition for waitFor'),
              'timeoutMs': Schema.int(description: 'Timeout for waitFor'),
              'settle': Schema.bool(
                description:
                    'Whether to wait for animations to settle after this step',
              ),
            },
            required: ['action'],
          ),
        ),
      },
      required: ['steps'],
    ),
  );

  final _runFlowTool = Tool(
    name: 'runFlow',
    description:
        'Execute a saved interaction flow (a sequence of steps with metadata). '
        'Flows can be saved as JSON files and rerun for testing or automation.',
    inputSchema: Schema.object(
      properties: {
        'flow': Schema.object(
          description: 'The flow object containing name, steps, and metadata',
          properties: {
            'name': Schema.string(description: 'Name of the flow'),
            'description': Schema.string(description: 'Optional description'),
            'steps': Schema.list(
              description: 'Array of interaction steps',
              items: Schema.object(
                properties: {
                  'target_id': Schema.string(
                    description: 'The InteractionKey id',
                  ),
                  'interaction': Schema.string(
                    description:
                        'The interaction type: tap, doubleTap, longPress, enterText, clearText, drag, scroll, scrollIntoView, waitFor, executeAction',
                  ),
                  'arguments': Schema.object(
                    description:
                        'Action-specific arguments (text, dx, dy, etc.)',
                    properties: {},
                  ),
                  'settle': Schema.bool(
                    description: 'Whether to settle after this step',
                  ),
                  'timestamp': Schema.string(
                    description: 'ISO timestamp of when step was recorded',
                  ),
                },
                required: ['target_id', 'interaction', 'timestamp'],
              ),
            ),
            'version': Schema.int(description: 'Flow version (default: 1)'),
            'created_at': Schema.string(
              description: 'ISO timestamp when flow was created',
            ),
          },
          required: ['name', 'steps', 'created_at'],
        ),
      },
      required: ['flow'],
    ),
  );

  // Tool handlers

  FutureOr<CallToolResult> _handleConnect(CallToolRequest request) async {
    final args = request.arguments ?? {};
    final uri = args['uri'] as String?;
    if (uri == null) {
      return _error('uri is required');
    }

    try {
      _client = await DriverClient.connect(uri);
      return CallToolResult(content: [TextContent(text: 'Connected to $uri')]);
    } catch (e) {
      return _error('Failed to connect: $e');
    }
  }

  FutureOr<CallToolResult> _handleDisconnect(CallToolRequest request) async {
    if (_client == null) {
      return _error('Not connected');
    }

    try {
      await _client!.disconnect();
      _client = null;
      return CallToolResult(content: [TextContent(text: 'Disconnected')]);
    } catch (e) {
      return _error('Failed to disconnect: $e');
    }
  }

  FutureOr<CallToolResult> _handleGetTree(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final includeBounds = args['includeBounds'] as bool? ?? false;
    final includeWidgetType = args['includeWidgetType'] as bool? ?? false;
    final includeState = args['includeState'] as bool? ?? false;

    try {
      final tree = await client.getTree(
        includeBounds: includeBounds,
        includeWidgetType: includeWidgetType,
        includeState: includeState,
      );
      return CallToolResult(content: [TextContent(text: _formatJson(tree))]);
    } catch (e) {
      return _error('Failed to get tree: $e');
    }
  }

  FutureOr<CallToolResult> _handleTap(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    if (id == null) return _error('id is required');

    try {
      final result = await client.tap(id);
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to tap: $e');
    }
  }

  FutureOr<CallToolResult> _handleDoubleTap(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    if (id == null) return _error('id is required');

    try {
      final result = await client.doubleTap(id);
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to double tap: $e');
    }
  }

  FutureOr<CallToolResult> _handleLongPress(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    if (id == null) return _error('id is required');

    try {
      final result = await client.longPress(id);
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to long press: $e');
    }
  }

  FutureOr<CallToolResult> _handleEnterText(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    final text = args['text'] as String?;
    if (id == null) return _error('id is required');
    if (text == null) return _error('text is required');

    try {
      final result = await client.enterText(id, text);
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to enter text: $e');
    }
  }

  FutureOr<CallToolResult> _handleClearText(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    if (id == null) return _error('id is required');

    try {
      final result = await client.clearText(id);
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to clear text: $e');
    }
  }

  FutureOr<CallToolResult> _handleDrag(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    final dxStr = args['dx'] as String?;
    final dyStr = args['dy'] as String?;
    if (id == null) return _error('id is required');

    final dx = double.tryParse(dxStr ?? '0') ?? 0;
    final dy = double.tryParse(dyStr ?? '0') ?? 0;

    try {
      final result = await client.drag(id, dx: dx, dy: dy);
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to drag: $e');
    }
  }

  FutureOr<CallToolResult> _handleScroll(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    final dxStr = args['dx'] as String?;
    final dyStr = args['dy'] as String?;
    if (id == null) return _error('id is required');

    final dx = double.tryParse(dxStr ?? '0') ?? 0;
    final dy = double.tryParse(dyStr ?? '0') ?? 0;

    try {
      final result = await client.scroll(id, dx: dx, dy: dy);
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to scroll: $e');
    }
  }

  FutureOr<CallToolResult> _handleScrollIntoView(
    CallToolRequest request,
  ) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    final alignmentStr = args['alignment'] as String?;
    if (id == null) return _error('id is required');

    final alignment = double.tryParse(alignmentStr ?? '0') ?? 0;

    try {
      final result = await client.scrollIntoView(id, alignment: alignment);
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to scroll into view: $e');
    }
  }

  FutureOr<CallToolResult> _handleWaitFor(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    final condition = args['condition'] as String? ?? 'exists';
    final timeoutMs = args['timeoutMs'] as int? ?? 10000;
    if (id == null) return _error('id is required');

    try {
      final result = await client.waitFor(
        id,
        condition: condition,
        timeoutMs: timeoutMs,
      );
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to wait for: $e');
    }
  }

  FutureOr<CallToolResult> _handleGetState(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    if (id == null) return _error('id is required');

    try {
      final state = await client.getState(id);
      return CallToolResult(content: [TextContent(text: _formatJson(state))]);
    } catch (e) {
      return _error('Failed to get state: $e');
    }
  }

  FutureOr<CallToolResult> _handleExecuteAction(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final id = args['id'] as String?;
    final actionName = args['actionName'] as String?;
    final actionArgs = args['args'] as Map<String, dynamic>? ?? {};
    if (id == null) return _error('id is required');
    if (actionName == null) return _error('actionName is required');

    try {
      final result = await client.executeAction(
        id,
        actionName,
        args: actionArgs,
      );
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to execute action: $e');
    }
  }

  FutureOr<CallToolResult> _handleBatch(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final steps = args['steps'] as List<dynamic>?;
    if (steps == null) return _error('steps is required');

    try {
      final result = await client.batch(steps.cast<Map<String, Object?>>());
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to execute batch: $e');
    }
  }

  FutureOr<CallToolResult> _handleRunFlow(CallToolRequest request) async {
    final client = _ensureConnected();
    if (client == null) return _notConnectedError();

    final args = request.arguments ?? {};
    final flow = args['flow'] as Map<String, dynamic>?;
    if (flow == null) return _error('flow is required');

    final flowSteps = flow['steps'] as List<dynamic>?;
    if (flowSteps == null) return _error('flow.steps is required');

    final batchSteps =
        flowSteps.map((step) {
          final s = step as Map<String, dynamic>;
          return <String, Object?>{
            'action': s['interaction'],
            'id': s['target_id'],
            ...s['arguments'] as Map<String, dynamic>? ?? {},
            if (s['settle'] == true) 'settle': true,
          };
        }).toList();

    try {
      final result = await client.batch(batchSteps);
      return CallToolResult(content: [TextContent(text: _formatJson(result))]);
    } catch (e) {
      return _error('Failed to run flow: $e');
    }
  }

  // Helpers

  DriverClient? _ensureConnected() => _client;

  CallToolResult _notConnectedError() =>
      _error('Not connected to a Flutter app. Use the connect tool first.');

  CallToolResult _error(String message) =>
      CallToolResult(content: [TextContent(text: message)], isError: true);

  String _formatJson(Object? obj) {
    const encoder = JsonEncoder.withIndent('  ');
    return encoder.convert(obj);
  }
}
