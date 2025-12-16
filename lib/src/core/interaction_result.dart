import 'package:flutter/foundation.dart';

@immutable
sealed class InteractionResult {
  const InteractionResult({required this.durationMs});

  final int durationMs;

  Map<String, Object?> toJson();
}

final class InteractionSuccess extends InteractionResult {
  const InteractionSuccess({
    required super.durationMs,
    this.data,
    this.tree,
  });

  final Object? data;

  /// The tree state after the interaction (and settle, if requested).
  final Map<String, Object?>? tree;

  @override
  Map<String, Object?> toJson() => {
        'success': true,
        'duration_ms': durationMs,
        if (tree != null) 'tree': tree,
        if (data != null) 'data': data,
      };
}

final class InteractionFailure extends InteractionResult {
  const InteractionFailure({
    required super.durationMs,
    required this.error,
    this.stackTrace,
  });

  final String error;
  final String? stackTrace;

  @override
  Map<String, Object?> toJson() => {
        'success': false,
        'duration_ms': durationMs,
        'error': error,
        if (stackTrace != null) 'stack_trace': stackTrace,
      };
}
