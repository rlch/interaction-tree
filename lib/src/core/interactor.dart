import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart' hide Notification;

import 'interaction_finder.dart';
import 'interaction_result.dart';
import 'interaction_target.dart';

enum WaitCondition {
  exists,
  notExists,
  visible,
  notVisible,
}

class Interactor {
  Interactor._();

  static final instance = Interactor._();

  final InteractionFinder find = InteractionFinder.instance;

  int _pointerIdCounter = 0;

  Map<String, Object?> getTree({
    bool includeBounds = false,
    bool includeWidgetType = false,
    bool includeState = false,
  }) {
    final tree = find.tree();
    return {
      'targets': tree
          .map((t) => t.toJson(
                includeBounds: includeBounds,
                includeWidgetType: includeWidgetType,
                includeState: includeState,
                stateProvider: includeState ? _getStateForId : null,
              ))
          .toList(),
    };
  }

  Map<String, Object?> _getStateForId(String id) {
    final target = find.byId(id);
    return target?.getState() ?? {};
  }

  Map<String, Object?> getState(String id) {
    final target = find.byId(id);
    if (target == null) {
      return {
        'success': false,
        'error': 'Target "$id" not found',
      };
    }
    return {
      'success': true,
      'id': id,
      'state': target.getState(),
    };
  }

  Future<InteractionResult> tap(String id, {bool settle = false}) async {
    return _perform(
      id,
      settle: settle,
      action: (target) => tapAt(target.center),
    );
  }

  Future<InteractionResult> doubleTap(String id, {bool settle = false}) async {
    return _perform(
      id,
      settle: settle,
      action: (target) => doubleTapAt(target.center),
    );
  }

  Future<InteractionResult> longPress(String id, {bool settle = false}) async {
    return _perform(
      id,
      settle: settle,
      action: (target) => longPressAt(target.center),
    );
  }

  Future<InteractionResult> enterText(
    String id,
    String text, {
    bool settle = false,
  }) async {
    return _perform(
      id,
      settle: settle,
      action: (target) async {
        await tapAt(target.center);
        await _pumpFrame();
        await _sendTextInputAction(text);
      },
    );
  }

  Future<InteractionResult> drag(
    String id,
    Offset offset, {
    bool settle = false,
  }) async {
    return _perform(
      id,
      settle: settle,
      action: (target) => dragFrom(target.center, offset),
    );
  }

  Future<InteractionResult> scroll(
    String id,
    Offset delta, {
    bool settle = false,
  }) async {
    return _perform(
      id,
      settle: settle,
      action: (target) => scrollAt(target.center, delta),
    );
  }

  Future<InteractionResult> clearText(String id, {bool settle = false}) async {
    return _perform(
      id,
      settle: settle,
      action: (target) async {
        await tapAt(target.center);
        await _pumpFrame();
        await _sendClearTextAction();
      },
    );
  }

  Future<InteractionResult> executeAction(
    String id,
    String actionName, {
    Map<String, dynamic> args = const {},
    bool settle = false,
  }) async {
    final stopwatch = Stopwatch()..start();
    try {
      final target = find.byId(id);
      if (target == null) {
        return InteractionFailure(
          durationMs: stopwatch.elapsedMilliseconds,
          error: 'Target "$id" not found',
        );
      }

      final action = target.findAction(actionName);
      if (action == null) {
        return InteractionFailure(
          durationMs: stopwatch.elapsedMilliseconds,
          error: 'Action "$actionName" not found on target "$id"',
        );
      }

      await action.execute(args);

      if (settle) {
        await _settle();
      }

      return InteractionSuccess(
        durationMs: stopwatch.elapsedMilliseconds,
        tree: getTree(),
      );
    } catch (e, st) {
      return InteractionFailure(
        durationMs: stopwatch.elapsedMilliseconds,
        error: e.toString(),
        stackTrace: st.toString(),
      );
    }
  }

  Future<InteractionResult> waitFor(
    String id, {
    WaitCondition condition = WaitCondition.exists,
    Duration timeout = const Duration(seconds: 10),
  }) async {
    final stopwatch = Stopwatch()..start();
    final deadline = DateTime.now().add(timeout);

    while (DateTime.now().isBefore(deadline)) {
      final target = find.byId(id);
      final conditionMet = switch (condition) {
        WaitCondition.exists => target != null,
        WaitCondition.notExists => target == null,
        WaitCondition.visible => target != null && target.isVisible,
        WaitCondition.notVisible => target == null || !target.isVisible,
      };

      if (conditionMet) {
        return InteractionSuccess(
          durationMs: stopwatch.elapsedMilliseconds,
          tree: getTree(),
        );
      }

      // Wait for next frame before checking again
      await _pumpFrame();
    }

    return InteractionFailure(
      durationMs: stopwatch.elapsedMilliseconds,
      error: 'Timeout waiting for "$id" to be ${condition.name}',
    );
  }

  Future<InteractionResult> batch(
    List<Map<String, Object?>> steps, {
    bool settle = false,
  }) async {
    final stopwatch = Stopwatch()..start();
    final results = <Map<String, Object?>>[];

    for (var i = 0; i < steps.length; i++) {
      final step = steps[i];
      final action = step['action'] as String?;
      final id = step['id'] as String?;

      if (action == null) {
        return InteractionFailure(
          durationMs: stopwatch.elapsedMilliseconds,
          error: 'Step $i: missing "action" field',
        );
      }

      InteractionResult result;
      try {
        result = await _executeStep(action, step);
      } catch (e, st) {
        return InteractionFailure(
          durationMs: stopwatch.elapsedMilliseconds,
          error: 'Step $i ($action): $e',
          stackTrace: st.toString(),
        );
      }

      results.add({
        'step': i,
        'action': action,
        if (id != null) 'id': id,
        'success': result is InteractionSuccess,
        'durationMs': result.durationMs,
        if (result is InteractionFailure) 'error': result.error,
      });

      if (result is InteractionFailure) {
        return InteractionFailure(
          durationMs: stopwatch.elapsedMilliseconds,
          error: 'Step $i ($action) failed: ${result.error}',
          stackTrace: result.stackTrace,
        );
      }
    }

    if (settle) {
      await _settle();
    }

    return InteractionSuccess(
      durationMs: stopwatch.elapsedMilliseconds,
      tree: getTree(),
      data: {'steps': results},
    );
  }

  Future<InteractionResult> _executeStep(
    String action,
    Map<String, Object?> step,
  ) async {
    final id = step['id'] as String?;

    return switch (action) {
      'tap' => tap(id!, settle: false),
      'doubleTap' => doubleTap(id!, settle: false),
      'longPress' => longPress(id!, settle: false),
      'enterText' => enterText(id!, step['text'] as String, settle: false),
      'clearText' => clearText(id!, settle: false),
      'drag' => drag(
          id!,
          Offset(
            (step['dx'] as num?)?.toDouble() ?? 0.0,
            (step['dy'] as num?)?.toDouble() ?? 0.0,
          ),
          settle: false,
        ),
      'scroll' => scroll(
          id!,
          Offset(
            (step['dx'] as num?)?.toDouble() ?? 0.0,
            (step['dy'] as num?)?.toDouble() ?? 0.0,
          ),
          settle: false,
        ),
      'scrollIntoView' => scrollIntoView(
          id!,
          alignment: (step['alignment'] as num?)?.toDouble() ?? 0.0,
          settle: false,
        ),
      'waitFor' => waitFor(
          id!,
          condition: _parseWaitCondition(step['condition'] as String?),
          timeout: Duration(
            milliseconds: (step['timeoutMs'] as num?)?.toInt() ?? 10000,
          ),
        ),
      'executeAction' => executeAction(
          id!,
          step['actionName'] as String,
          args: (step['args'] as Map<String, dynamic>?) ?? const {},
          settle: false,
        ),
      _ => throw ArgumentError('Unknown action: $action'),
    };
  }

  WaitCondition _parseWaitCondition(String? condition) {
    return switch (condition) {
      'exists' => WaitCondition.exists,
      'notExists' => WaitCondition.notExists,
      'visible' => WaitCondition.visible,
      'notVisible' => WaitCondition.notVisible,
      _ => WaitCondition.exists,
    };
  }

  Future<InteractionResult> scrollIntoView(
    String id, {
    double alignment = 0.0,
    bool settle = false,
  }) async {
    final stopwatch = Stopwatch()..start();
    try {
      final target = find.byId(id);
      if (target == null) {
        return InteractionFailure(
          durationMs: stopwatch.elapsedMilliseconds,
          error: 'Target "$id" not found',
        );
      }

      final renderObject = target.element.renderObject;
      if (renderObject == null) {
        return InteractionFailure(
          durationMs: stopwatch.elapsedMilliseconds,
          error: 'Target "$id" has no render object',
        );
      }

      // Use Scrollable.ensureVisible to scroll the target into view
      // We need a BuildContext, so we use the element itself
      await Scrollable.ensureVisible(
        target.element,
        alignment: alignment,
        duration: const Duration(milliseconds: 300),
      );

      if (settle) {
        await _settle();
      } else {
        await _pumpFrame();
      }

      return InteractionSuccess(
        durationMs: stopwatch.elapsedMilliseconds,
        tree: getTree(),
      );
    } catch (e, st) {
      return InteractionFailure(
        durationMs: stopwatch.elapsedMilliseconds,
        error: e.toString(),
        stackTrace: st.toString(),
      );
    }
  }

  Future<InteractionResult> _perform(
    String id, {
    required bool settle,
    required Future<void> Function(InteractionTarget target) action,
  }) async {
    final stopwatch = Stopwatch()..start();
    try {
      final target = find.byId(id);
      if (target == null) {
        return InteractionFailure(
          durationMs: stopwatch.elapsedMilliseconds,
          error: 'Target "$id" not found',
        );
      }

      await action(target);

      if (settle) {
        await _settle();
      }

      return InteractionSuccess(
        durationMs: stopwatch.elapsedMilliseconds,
        tree: getTree(),
      );
    } catch (e, st) {
      return InteractionFailure(
        durationMs: stopwatch.elapsedMilliseconds,
        error: e.toString(),
        stackTrace: st.toString(),
      );
    }
  }

  Future<void> tapAt(Offset position) async {
    final pointerId = _nextPointerId();
    final now = Duration(milliseconds: DateTime.now().millisecondsSinceEpoch);

    _dispatchPointerEvent(PointerDownEvent(
      pointer: pointerId,
      position: position,
      timeStamp: now,
    ));
    await _pumpFrame();

    _dispatchPointerEvent(PointerUpEvent(
      pointer: pointerId,
      position: position,
      timeStamp: now + const Duration(milliseconds: 16),
    ));
    await _pumpFrame();
  }

  Future<void> doubleTapAt(Offset position) async {
    await tapAt(position);
    await Future.delayed(const Duration(milliseconds: 50));
    await tapAt(position);
  }

  Future<void> longPressAt(Offset position) async {
    final pointerId = _nextPointerId();
    final now = Duration(milliseconds: DateTime.now().millisecondsSinceEpoch);

    _dispatchPointerEvent(PointerDownEvent(
      pointer: pointerId,
      position: position,
      timeStamp: now,
    ));
    await _pumpFrame();

    await Future.delayed(const Duration(milliseconds: 600));

    _dispatchPointerEvent(PointerUpEvent(
      pointer: pointerId,
      position: position,
      timeStamp: now + const Duration(milliseconds: 616),
    ));
    await _pumpFrame();
  }

  Future<void> dragFrom(Offset start, Offset offset, {int steps = 20}) async {
    final pointerId = _nextPointerId();
    final now = Duration(milliseconds: DateTime.now().millisecondsSinceEpoch);

    _dispatchPointerEvent(PointerDownEvent(
      pointer: pointerId,
      position: start,
      timeStamp: now,
    ));
    await _pumpFrame();

    final stepOffset = offset / steps.toDouble();
    var current = start;
    for (var i = 0; i < steps; i++) {
      current = current + stepOffset;
      _dispatchPointerEvent(PointerMoveEvent(
        pointer: pointerId,
        position: current,
        delta: stepOffset,
        timeStamp: now + Duration(milliseconds: 16 * (i + 1)),
      ));
      await _pumpFrame();
    }

    _dispatchPointerEvent(PointerUpEvent(
      pointer: pointerId,
      position: current,
      timeStamp: now + Duration(milliseconds: 16 * (steps + 1)),
    ));
    await _pumpFrame();
  }

  Future<void> scrollAt(Offset position, Offset delta) async {
    _dispatchPointerEvent(PointerScrollEvent(
      position: position,
      scrollDelta: delta,
    ));
    await _pumpFrame();
  }

  void _dispatchPointerEvent(PointerEvent event) {
    GestureBinding.instance.handlePointerEvent(event);
  }

  int _nextPointerId() => ++_pointerIdCounter;

  Future<void> _pumpFrame() async {
    await WidgetsBinding.instance.endOfFrame;
  }

  /// Waits for animations to complete by pumping frames until no more are scheduled.
  Future<void> _settle({
    Duration timeout = const Duration(seconds: 10),
  }) async {
    final deadline = DateTime.now().add(timeout);

    while (DateTime.now().isBefore(deadline)) {
      final binding = WidgetsBinding.instance;

      if (!binding.hasScheduledFrame) {
        await _pumpFrame();
        if (!binding.hasScheduledFrame) {
          break;
        }
      }

      await _pumpFrame();
    }
  }

  Future<void> _sendTextInputAction(String text) async {
    final setEditingStateMessage = const JSONMethodCodec().encodeMethodCall(
      MethodCall('TextInputClient.updateEditingState', <dynamic>[
        -1,
        <String, dynamic>{
          'text': text,
          'selectionBase': text.length,
          'selectionExtent': text.length,
          'selectionAffinity': 'TextAffinity.downstream',
          'selectionIsDirectional': false,
          'composingBase': -1,
          'composingExtent': -1,
        },
      ]),
    );

    ServicesBinding.instance.channelBuffers.push(
      'flutter/textinput',
      setEditingStateMessage,
      (ByteData? data) {},
    );
    await _pumpFrame();
  }

  Future<void> _sendClearTextAction() async {
    final clearMessage = const JSONMethodCodec().encodeMethodCall(
      MethodCall('TextInputClient.updateEditingState', <dynamic>[
        -1,
        <String, dynamic>{
          'text': '',
          'selectionBase': 0,
          'selectionExtent': 0,
          'selectionAffinity': 'TextAffinity.downstream',
          'selectionIsDirectional': false,
          'composingBase': -1,
          'composingExtent': -1,
        },
      ]),
    );

    ServicesBinding.instance.channelBuffers.push(
      'flutter/textinput',
      clearMessage,
      (ByteData? data) {},
    );
    await _pumpFrame();
  }
}
