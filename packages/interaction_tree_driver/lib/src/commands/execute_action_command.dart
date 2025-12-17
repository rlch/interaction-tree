import 'dart:convert';

import 'package:flutter_driver/flutter_driver.dart';

import '../finders/interaction_key_finder.dart';

/// Command to execute a custom action on a widget with InteractableMixin.
///
/// Use with FlutterDriver.sendCommand:
/// ```dart
/// final result = await driver.sendCommand(ExecuteActionCommand(
///   finder: InteractionKeyFinder('my_widget'),
///   actionName: 'doSomething',
///   args: {'value': '42'},
/// ));
/// ```
class ExecuteActionCommand extends CommandWithTarget {
  ExecuteActionCommand(
    InteractionKeyFinder super.finder, {
    required this.actionName,
    this.args = const {},
    this.settle = false,
    super.timeout,
  });

  /// The name of the action to execute.
  final String actionName;

  /// Arguments to pass to the action.
  final Map<String, dynamic> args;

  /// Whether to wait for animations to settle after the action.
  final bool settle;

  @override
  String get kind => 'executeAction';

  @override
  Map<String, String> serialize() => super.serialize()
    ..addAll(<String, String>{
      'actionName': actionName,
      'args': jsonEncode(args),
      'settle': settle.toString(),
    });

  /// Deserialize from JSON parameters.
  factory ExecuteActionCommand.deserialize(
    Map<String, String> params,
    DeserializeFinderFactory finderFactory,
  ) {
    final finder = finderFactory.deserializeFinder(params);
    if (finder is! InteractionKeyFinder) {
      throw ArgumentError(
        'ExecuteActionCommand requires an InteractionKeyFinder',
      );
    }

    final actionName = params['actionName'];
    if (actionName == null || actionName.isEmpty) {
      throw ArgumentError('ExecuteActionCommand requires "actionName"');
    }

    Map<String, dynamic> args = {};
    final argsJson = params['args'];
    if (argsJson != null && argsJson.isNotEmpty) {
      final decoded = jsonDecode(argsJson);
      if (decoded is Map<String, dynamic>) {
        args = decoded;
      }
    }

    return ExecuteActionCommand(
      finder,
      actionName: actionName,
      args: args,
      settle: params['settle'] == 'true',
    );
  }
}

/// Result of ExecuteActionCommand.
class ExecuteActionResult extends Result {
  const ExecuteActionResult({
    required this.success,
    this.error,
    this.tree,
    this.diff,
    this.focusedId,
    this.diagnostics,
  });

  final bool success;
  final String? error;
  final Map<String, Object?>? tree;
  final Map<String, Object?>? diff;
  final String? focusedId;
  final Map<String, Object?>? diagnostics;

  @override
  Map<String, dynamic> toJson() => {
        'success': success,
        if (error != null) 'error': error,
        if (tree != null) 'tree': tree,
        if (diff != null) 'diff': diff,
        if (focusedId != null) 'focusedId': focusedId,
        if (diagnostics != null) 'diagnostics': diagnostics,
      };

  factory ExecuteActionResult.fromJson(Map<String, dynamic> json) {
    return ExecuteActionResult(
      success: json['success'] as bool? ?? false,
      error: json['error'] as String?,
      tree: json['tree'] as Map<String, Object?>?,
      diff: json['diff'] as Map<String, Object?>?,
      focusedId: json['focusedId'] as String?,
      diagnostics: json['diagnostics'] as Map<String, Object?>?,
    );
  }

  factory ExecuteActionResult.fromResponse(String response) {
    final json = jsonDecode(response) as Map<String, dynamic>;
    return ExecuteActionResult.fromJson(json);
  }
}
