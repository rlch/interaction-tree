/// MCP server for interaction_tree - enables AI assistants to interact with Flutter apps.
///
/// This package provides an MCP (Model Context Protocol) server that allows AI
/// assistants to:
/// - Connect to running Flutter apps via VM service
/// - Get the interaction tree of widgets marked with InteractionKey
/// - Perform gestures (tap, double tap, long press, etc.)
/// - Enter and clear text
/// - Scroll and drag
/// - Execute custom actions defined via InteractableMixin
/// - Run batch operations and interaction flows
///
/// ## Usage
///
/// Run the MCP server:
/// ```bash
/// dart run interaction_tree_mcp
/// ```
///
/// Or use programmatically:
/// ```dart
/// import 'dart:io';
/// import 'package:dart_mcp/stdio.dart';
/// import 'package:interaction_tree_mcp/interaction_tree_mcp.dart';
///
/// void main() {
///   InteractionTreeMcpServer(
///     stdioChannel(input: stdin, output: stdout),
///   );
/// }
/// ```
library;

export 'src/driver_client.dart' show DriverClient;
export 'src/server.dart' show InteractionTreeMcpServer;
