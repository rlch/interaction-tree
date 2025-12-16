import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'interaction_finder.dart';
import 'interaction_result.dart';
import 'interaction_target.dart';

class Interactor {
  Interactor._();

  static final instance = Interactor._();

  final InteractionFinder find = InteractionFinder.instance;

  int _pointerIdCounter = 0;

  Map<String, Object?> getTree({
    bool includeBounds = false,
    bool includeWidgetType = false,
  }) {
    final tree = find.tree();
    return {
      'targets': tree
          .map((t) => t.toJson(
                includeBounds: includeBounds,
                includeWidgetType: includeWidgetType,
              ))
          .toList(),
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
}
