import 'dart:async';
import 'dart:convert';
import 'dart:io' as io;

import 'package:dart_mcp/server.dart';
import 'package:dart_mcp/stdio.dart';
import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

void main() {
  InteractionTreeMCPServer(
    stdioChannel(input: io.stdin, output: io.stdout),
  );
}

base class InteractionTreeMCPServer extends MCPServer with ToolsSupport {
  InteractionTreeMCPServer(super.channel)
      : super.fromStreamChannel(
          implementation: Implementation(
            name: 'interaction_tree',
            version: '0.2.0',
          ),
          instructions: '''
An MCP server for interacting with Flutter apps via the interaction_tree package.

First, connect to a running Flutter app using the `connect` tool with the VM service URI.
Then use `get_tree` to see available interaction targets, and action tools (tap, enterText, etc.) to perform interactions.

The Flutter app must have InteractionService.register() called and widgets marked with InteractionKey.
''',
        ) {
    registerTool(_connectTool, _handleConnect);
    registerTool(_disconnectTool, _handleDisconnect);
    registerTool(_getTreeTool, _handleGetTree);
    registerTool(_tapTool, _handleTap);
    registerTool(_doubleTapTool, _handleDoubleTap);
    registerTool(_longPressTool, _handleLongPress);
    registerTool(_enterTextTool, _handleEnterText);
    registerTool(_dragTool, _handleDrag);
    registerTool(_scrollTool, _handleScroll);
  }

  VmService? _vmService;
  String? _isolateId;

  bool get isConnected => _vmService != null && _isolateId != null;

  // ============ Tool Definitions ============

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
        'Use includeBounds/includeWidgetType for additional info.',
    inputSchema: Schema.object(
      properties: {
        'includeBounds': Schema.bool(
          description: 'Include global x/y/width/height for each target',
        ),
        'includeWidgetType': Schema.bool(
          description: 'Include the Flutter widget type name',
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

  // ============ Tool Handlers ============

  FutureOr<CallToolResult> _handleConnect(CallToolRequest request) async {
    final uri = request.arguments!['uri'] as String;

    try {
      if (_vmService != null) {
        await _vmService!.dispose();
      }

      _vmService = await vmServiceConnectUri(uri);
      
      final vm = await _vmService!.getVM();
      _isolateId = vm.isolates?.firstOrNull?.id;

      if (_isolateId == null) {
        _vmService = null;
        return _error('No isolates found in the VM');
      }

      return _success('Connected to Flutter app. Isolate: $_isolateId');
    } catch (e) {
      _vmService = null;
      _isolateId = null;
      return _error('Failed to connect: $e');
    }
  }

  FutureOr<CallToolResult> _handleDisconnect(CallToolRequest request) async {
    if (_vmService != null) {
      await _vmService!.dispose();
      _vmService = null;
      _isolateId = null;
    }
    return _success('Disconnected');
  }

  FutureOr<CallToolResult> _handleGetTree(CallToolRequest request) async {
    if (!isConnected) {
      return _error('Not connected. Use the connect tool first.');
    }

    try {
      final args = <String, String>{};
      final arguments = request.arguments;
      if (arguments != null) {
        if (arguments['includeBounds'] == true) {
          args['includeBounds'] = 'true';
        }
        if (arguments['includeWidgetType'] == true) {
          args['includeWidgetType'] = 'true';
        }
      }

      final response = await _vmService!.callServiceExtension(
        'ext.interaction_tree.getTree',
        isolateId: _isolateId,
        args: args.isNotEmpty ? args : null,
      );

      final json = response.json;
      if (json == null) {
        return _error('No response from extension');
      }

      return CallToolResult(
        content: [
          TextContent(
            text: const JsonEncoder.withIndent('  ').convert(json),
          ),
        ],
      );
    } catch (e) {
      return _error('Failed to get tree: $e');
    }
  }

  FutureOr<CallToolResult> _handleTap(CallToolRequest request) async {
    return _callAction('tap', request.arguments!);
  }

  FutureOr<CallToolResult> _handleDoubleTap(CallToolRequest request) async {
    return _callAction('doubleTap', request.arguments!);
  }

  FutureOr<CallToolResult> _handleLongPress(CallToolRequest request) async {
    return _callAction('longPress', request.arguments!);
  }

  FutureOr<CallToolResult> _handleEnterText(CallToolRequest request) async {
    return _callAction('enterText', request.arguments!);
  }

  FutureOr<CallToolResult> _handleDrag(CallToolRequest request) async {
    return _callAction('drag', request.arguments!);
  }

  FutureOr<CallToolResult> _handleScroll(CallToolRequest request) async {
    return _callAction('scroll', request.arguments!);
  }

  Future<CallToolResult> _callAction(
    String action,
    Map<String, Object?> args,
  ) async {
    if (!isConnected) {
      return _error('Not connected. Use the connect tool first.');
    }

    try {
      final stringArgs = <String, String>{};
      for (final entry in args.entries) {
        stringArgs[entry.key] = entry.value.toString();
      }

      final response = await _vmService!.callServiceExtension(
        'ext.interaction_tree.$action',
        isolateId: _isolateId,
        args: stringArgs,
      );

      final json = response.json;
      if (json == null) {
        return _error('No response from extension');
      }

      final success = json['success'] as bool? ?? false;
      if (!success) {
        final error = json['error'] as String? ?? 'Unknown error';
        return _error('Action failed: $error');
      }

      return CallToolResult(
        content: [
          TextContent(
            text: const JsonEncoder.withIndent('  ').convert(json),
          ),
        ],
      );
    } catch (e) {
      return _error('Failed to execute $action: $e');
    }
  }

  // ============ Helpers ============

  CallToolResult _success(String message) {
    return CallToolResult(content: [TextContent(text: message)]);
  }

  CallToolResult _error(String message) {
    return CallToolResult(
      content: [TextContent(text: 'Error: $message')],
      isError: true,
    );
  }
}
