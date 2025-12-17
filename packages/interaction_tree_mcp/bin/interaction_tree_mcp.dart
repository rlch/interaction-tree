import 'dart:io';

import 'package:dart_mcp/stdio.dart';
import 'package:interaction_tree_mcp/interaction_tree_mcp.dart';

void main() {
  InteractionTreeMcpServer(stdioChannel(input: stdin, output: stdout));
}
