import 'dart:convert';

import 'package:flutter_driver/flutter_driver.dart';

/// A single step in a batch command.
class BatchStep {
  const BatchStep({
    required this.action,
    this.id,
    this.text,
    this.dx,
    this.dy,
    this.alignment,
    this.actionName,
    this.args,
    this.condition,
    this.timeoutMs,
    this.settle = false,
  });

  /// The action to perform: tap, doubleTap, longPress, enterText, clearText,
  /// drag, scroll, scrollIntoView, waitFor, executeAction
  final String action;

  /// The InteractionKey ID to target (not needed for all actions).
  final String? id;

  /// Text for enterText action.
  final String? text;

  /// X offset for drag/scroll actions.
  final double? dx;

  /// Y offset for drag/scroll actions.
  final double? dy;

  /// Alignment for scrollIntoView (0.0 = top, 0.5 = center, 1.0 = bottom).
  final double? alignment;

  /// Action name for executeAction.
  final String? actionName;

  /// Arguments for executeAction.
  final Map<String, dynamic>? args;

  /// Condition for waitFor: exists, notExists, visible, notVisible.
  final String? condition;

  /// Timeout in milliseconds for waitFor.
  final int? timeoutMs;

  /// Whether to settle after this step.
  final bool settle;

  Map<String, Object?> toJson() => {
        'action': action,
        if (id != null) 'id': id,
        if (text != null) 'text': text,
        if (dx != null) 'dx': dx,
        if (dy != null) 'dy': dy,
        if (alignment != null) 'alignment': alignment,
        if (actionName != null) 'actionName': actionName,
        if (args != null) 'args': args,
        if (condition != null) 'condition': condition,
        if (timeoutMs != null) 'timeoutMs': timeoutMs,
        if (settle) 'settle': true,
      };

  factory BatchStep.fromJson(Map<String, dynamic> json) {
    return BatchStep(
      action: json['action'] as String,
      id: json['id'] as String?,
      text: json['text'] as String?,
      dx: (json['dx'] as num?)?.toDouble(),
      dy: (json['dy'] as num?)?.toDouble(),
      alignment: (json['alignment'] as num?)?.toDouble(),
      actionName: json['actionName'] as String?,
      args: json['args'] as Map<String, dynamic>?,
      condition: json['condition'] as String?,
      timeoutMs: json['timeoutMs'] as int?,
      settle: json['settle'] as bool? ?? false,
    );
  }
}

/// Command to execute multiple interactions in sequence.
///
/// Use with FlutterDriver.sendCommand:
/// ```dart
/// final result = await driver.sendCommand(BatchCommand([
///   BatchStep(action: 'tap', id: 'login_button'),
///   BatchStep(action: 'enterText', id: 'email_field', text: 'test@example.com'),
///   BatchStep(action: 'tap', id: 'submit_button', settle: true),
/// ]));
/// ```
class BatchCommand extends Command {
  const BatchCommand(this.steps, {super.timeout});

  /// The steps to execute in sequence.
  final List<BatchStep> steps;

  @override
  String get kind => 'batch';

  @override
  Map<String, String> serialize() => super.serialize()
    ..addAll(<String, String>{
      'steps': jsonEncode(steps.map((s) => s.toJson()).toList()),
    });

  factory BatchCommand.deserialize(Map<String, String> params) {
    final stepsJson = params['steps'];
    if (stepsJson == null || stepsJson.isEmpty) {
      throw ArgumentError('BatchCommand requires "steps" parameter');
    }

    final decoded = jsonDecode(stepsJson) as List;
    final steps = decoded
        .map((s) => BatchStep.fromJson(s as Map<String, dynamic>))
        .toList();

    return BatchCommand(steps);
  }
}

/// Result of a single batch step.
class BatchStepResult {
  const BatchStepResult({
    required this.step,
    required this.success,
    this.error,
    this.durationMs,
  });

  final int step;
  final bool success;
  final String? error;
  final int? durationMs;

  Map<String, Object?> toJson() => {
        'step': step,
        'success': success,
        if (error != null) 'error': error,
        if (durationMs != null) 'durationMs': durationMs,
      };

  factory BatchStepResult.fromJson(Map<String, dynamic> json) {
    return BatchStepResult(
      step: json['step'] as int,
      success: json['success'] as bool,
      error: json['error'] as String?,
      durationMs: json['durationMs'] as int?,
    );
  }
}

/// Result of BatchCommand.
class BatchResult extends Result {
  const BatchResult({
    required this.success,
    required this.results,
    this.tree,
    this.diff,
    this.focusedId,
    this.diagnostics,
    this.durationMs,
  });

  final bool success;
  final List<BatchStepResult> results;
  final Map<String, Object?>? tree;
  final Map<String, Object?>? diff;
  final String? focusedId;
  final Map<String, Object?>? diagnostics;
  final int? durationMs;

  @override
  Map<String, dynamic> toJson() => {
        'success': success,
        'results': results.map((r) => r.toJson()).toList(),
        if (tree != null) 'tree': tree,
        if (diff != null) 'diff': diff,
        if (focusedId != null) 'focusedId': focusedId,
        if (diagnostics != null) 'diagnostics': diagnostics,
        if (durationMs != null) 'durationMs': durationMs,
      };

  factory BatchResult.fromJson(Map<String, dynamic> json) {
    final resultsJson = json['results'] as List?;
    return BatchResult(
      success: json['success'] as bool? ?? false,
      results: resultsJson
              ?.map((r) => BatchStepResult.fromJson(r as Map<String, dynamic>))
              .toList() ??
          [],
      tree: json['tree'] as Map<String, Object?>?,
      diff: json['diff'] as Map<String, Object?>?,
      focusedId: json['focusedId'] as String?,
      diagnostics: json['diagnostics'] as Map<String, Object?>?,
      durationMs: json['durationMs'] as int?,
    );
  }

  factory BatchResult.fromResponse(String response) {
    final json = jsonDecode(response) as Map<String, dynamic>;
    return BatchResult.fromJson(json);
  }
}
