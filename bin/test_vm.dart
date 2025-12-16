import 'dart:convert';
import 'package:vm_service/vm_service_io.dart';

void main(List<String> args) async {
  if (args.isEmpty) {
    print('Usage: dart run bin/test_vm.dart <vm_service_ws_uri>');
    return;
  }
  
  final uri = args[0];
  print('Connecting to $uri...');
  
  final service = await vmServiceConnectUri(uri);
  final vm = await service.getVM();
  final isolateId = vm.isolates!.first.id!;
  print('Connected. Isolate: $isolateId\n');
  
  // Get full tree
  print('=== Full interaction tree ===\n');
  final treeResult = await service.callServiceExtension(
    'ext.interaction_tree.getTree',
    isolateId: isolateId,
  );
  final targets = (treeResult.json?['targets'] as List?) ?? [];
  for (final target in targets) {
    final id = target['id'];
    final desc = target['description'];
    final caps = (target['capabilities'] as List).join(', ');
    final type = target['widgetType'];
    print('[$id] $type - $desc');
    print('  capabilities: $caps\n');
  }

  // Test interactions
  print('=== Testing interactions ===\n');
  
  // Tap increment button
  print('Tapping increment-btn...');
  var result = await service.callServiceExtension(
    'ext.interaction_tree.tap',
    isolateId: isolateId,
    args: {'id': 'increment-btn'},
  );
  print('Result: ${result.json?['success']}\n');

  // Enter text
  print('Entering text...');
  result = await service.callServiceExtension(
    'ext.interaction_tree.enterText',
    isolateId: isolateId,
    args: {'id': 'text-input', 'text': 'Hello from VM!'},
  );
  print('Result: ${result.json?['success']}\n');

  // Toggle checkbox
  print('Tapping checkbox...');
  result = await service.callServiceExtension(
    'ext.interaction_tree.tap',
    isolateId: isolateId,
    args: {'id': 'checkbox'},
  );
  print('Result: ${result.json?['success']}\n');

  // Toggle switch
  print('Tapping switch...');
  result = await service.callServiceExtension(
    'ext.interaction_tree.tap',
    isolateId: isolateId,
    args: {'id': 'switch'},
  );
  print('Result: ${result.json?['success']}\n');

  // Drag slider
  print('Dragging slider...');
  result = await service.callServiceExtension(
    'ext.interaction_tree.drag',
    isolateId: isolateId,
    args: {'id': 'slider', 'dx': '100', 'dy': '0'},
  );
  print('Result: ${result.json?['success']}\n');

  // Tap submit
  print('Tapping submit-btn...');
  result = await service.callServiceExtension(
    'ext.interaction_tree.tap',
    isolateId: isolateId,
    args: {'id': 'submit-btn'},
  );
  print('Result: ${result.json?['success']}\n');

  await service.dispose();
  print('Done!');
}
