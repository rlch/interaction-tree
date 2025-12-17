import 'package:flutter/gestures.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../core/interactable_mixin.dart';
import '../core/interaction_action.dart';
import '../core/interaction_capability.dart';
import '../core/interaction_key.dart';
import '../core/interaction_target.dart';

/// Executes interactions on widgets by dispatching real pointer/gesture events.
class InteractionExecutor {
  InteractionExecutor._();

  /// Execute an interaction on a target widget.
  static Future<Map<String, dynamic>> execute({
    required String id,
    required String interaction,
    Map<String, dynamic>? args,
  }) async {
    final stopwatch = Stopwatch()..start();

    try {
      final target = _findTarget(id);
      if (target == null) {
        return {
          'success': false,
          'error': 'Target not found: $id',
        };
      }

      final result = await _executeInteraction(target, interaction, args);
      stopwatch.stop();

      return {
        'success': result == null,
        if (result != null) 'error': result,
        'duration_ms': stopwatch.elapsedMilliseconds,
      };
    } catch (e, st) {
      stopwatch.stop();
      return {
        'success': false,
        'error': '$e',
        'stackTrace': '$st',
        'duration_ms': stopwatch.elapsedMilliseconds,
      };
    }
  }

  /// Find a target by ID in the widget tree.
  static InteractionTarget? _findTarget(String id) {
    InteractionTarget? found;
    final binding = WidgetsBinding.instance;

    void visit(Element element) {
      if (found != null) return;

      final key = element.widget.key;
      if (key is InteractionKey && key.id == id) {
        found = InteractionTarget(
          key: key,
          element: element,
          capabilities: key.capabilities ?? inferCapabilities(element),
          actions: _getActionsForElement(element),
        );
        return;
      }

      element.visitChildren(visit);
    }

    binding.rootElement?.visitChildren(visit);
    return found;
  }

  static List<InteractionAction> _getActionsForElement(Element element) {
    if (element is StatefulElement) {
      final state = element.state;
      if (state is InteractableMixin) {
        return state.actions;
      }
    }
    return const [];
  }

  /// Execute an interaction. Returns null on success, error message on failure.
  static Future<String?> _executeInteraction(
    InteractionTarget target,
    String interaction,
    Map<String, dynamic>? args,
  ) async {
    switch (interaction) {
      case 'tap':
        return _tap(target);

      case 'doubleTap':
        return _doubleTap(target);

      case 'longPress':
        return _longPress(target);

      case 'enterText':
        final text = args?['text'] as String?;
        if (text == null) {
          return 'enterText requires text parameter';
        }
        return _enterText(target, text);

      case 'clearText':
        return _clearText(target);

      case 'scroll':
        final dx = (args?['dx'] as num?)?.toDouble() ?? 0.0;
        final dy = (args?['dy'] as num?)?.toDouble() ?? 0.0;
        return _scroll(target, dx, dy);

      case 'drag':
        final dx = (args?['dx'] as num?)?.toDouble() ?? 0.0;
        final dy = (args?['dy'] as num?)?.toDouble() ?? 0.0;
        return _drag(target, dx, dy);

      case 'scrollIntoView':
        final alignment = (args?['alignment'] as num?)?.toDouble() ?? 0.0;
        return _scrollIntoView(target, alignment);

      case 'waitFor':
        final condition = args?['condition'] as String? ?? 'exists';
        final timeoutMs = (args?['timeoutMs'] as num?)?.toInt() ?? 10000;
        return _waitFor(target.id, condition, timeoutMs);

      case 'executeAction':
        final actionName = args?['actionName'] as String?;
        if (actionName == null) {
          return 'executeAction requires actionName parameter';
        }
        final actionArgs = args?['args'] as Map<String, dynamic>?;
        return _executeAction(target, actionName, actionArgs);

      default:
        return 'Unknown interaction: $interaction';
    }
  }

  /// Dispatch a tap gesture at the center of the target.
  static Future<String?> _tap(InteractionTarget target) async {
    final center = target.center;
    if (center == Offset.zero && !target.isVisible) {
      return 'Target is not visible';
    }

    await _dispatchPointerSequence([
      PointerDownEvent(position: center),
      PointerUpEvent(position: center),
    ]);

    // Allow frame to process
    await _pumpAndSettle();
    return null;
  }

  /// Dispatch a double-tap gesture.
  static Future<String?> _doubleTap(InteractionTarget target) async {
    final center = target.center;
    if (center == Offset.zero && !target.isVisible) {
      return 'Target is not visible';
    }

    // First tap
    await _dispatchPointerSequence([
      PointerDownEvent(position: center),
      PointerUpEvent(position: center),
    ]);

    // Short delay between taps (less than kDoubleTapTimeout)
    await Future<void>.delayed(const Duration(milliseconds: 50));

    // Second tap
    await _dispatchPointerSequence([
      PointerDownEvent(position: center),
      PointerUpEvent(position: center),
    ]);

    await _pumpAndSettle();
    return null;
  }

  /// Dispatch a long-press gesture.
  static Future<String?> _longPress(InteractionTarget target) async {
    final center = target.center;
    if (center == Offset.zero && !target.isVisible) {
      return 'Target is not visible';
    }

    await _dispatchPointerSequence([
      PointerDownEvent(position: center),
    ]);

    // Hold for long press duration
    await Future<void>.delayed(const Duration(milliseconds: 600));

    await _dispatchPointerSequence([
      PointerUpEvent(position: center),
    ]);

    await _pumpAndSettle();
    return null;
  }

  /// Enter text into a text field.
  static Future<String?> _enterText(InteractionTarget target, String text) async {
    // First tap to focus
    final tapError = await _tap(target);
    if (tapError != null) return tapError;

    // Wait for focus
    await Future<void>.delayed(const Duration(milliseconds: 100));

    // Send text input via channel buffers
    final binding = ServicesBinding.instance;
    
    // Use TextInput channel to simulate typing
    binding.channelBuffers.push(
      SystemChannels.textInput.name,
      const JSONMethodCodec().encodeMethodCall(
        MethodCall('TextInputClient.updateEditingState', [
          -1, // Client ID - will be handled by the focused field
          {
            'text': text,
            'selectionBase': text.length,
            'selectionExtent': text.length,
            'composingBase': -1,
            'composingExtent': -1,
          },
        ]),
      ),
      (data) {},
    );

    await _pumpAndSettle();
    return null;
  }

  /// Clear text from a text field.
  static Future<String?> _clearText(InteractionTarget target) async {
    return _enterText(target, '');
  }

  /// Scroll by delta.
  static Future<String?> _scroll(
    InteractionTarget target,
    double dx,
    double dy,
  ) async {
    final center = target.center;
    if (center == Offset.zero && !target.isVisible) {
      return 'Target is not visible';
    }

    // Use pointer scroll event
    final scrollEvent = PointerScrollEvent(
      position: center,
      scrollDelta: Offset(dx, dy),
    );

    GestureBinding.instance.handlePointerEvent(scrollEvent);
    await _pumpAndSettle();
    return null;
  }

  /// Drag from center by delta.
  static Future<String?> _drag(
    InteractionTarget target,
    double dx,
    double dy,
  ) async {
    final start = target.center;
    if (start == Offset.zero && !target.isVisible) {
      return 'Target is not visible';
    }

    final end = start + Offset(dx, dy);

    // Generate drag sequence
    const steps = 10;
    final events = <PointerEvent>[
      PointerDownEvent(position: start),
    ];

    for (var i = 1; i <= steps; i++) {
      final t = i / steps;
      final pos = Offset.lerp(start, end, t)!;
      events.add(PointerMoveEvent(position: pos));
    }

    events.add(PointerUpEvent(position: end));

    await _dispatchPointerSequence(events);
    await _pumpAndSettle();
    return null;
  }

  /// Scroll the target into view.
  static Future<String?> _scrollIntoView(
    InteractionTarget target,
    double alignment,
  ) async {
    final element = target.element;
    final renderObject = element.renderObject;

    if (renderObject == null) {
      return 'Target has no render object';
    }

    // Find the nearest scrollable ancestor
    RenderAbstractViewport? viewport;
    RenderObject? current = renderObject;
    while (current != null) {
      if (current is RenderAbstractViewport) {
        viewport = current;
        break;
      }
      current = current.parent;
    }

    if (viewport == null) {
      return 'Target is not in a scrollable container';
    }

    // Use Scrollable.ensureVisible for robust scrolling
    await Scrollable.ensureVisible(
      element,
      alignment: alignment,
      duration: const Duration(milliseconds: 300),
    );

    await _pumpAndSettle();
    return null;
  }

  /// Wait for a condition.
  static Future<String?> _waitFor(
    String id,
    String condition,
    int timeoutMs,
  ) async {
    final deadline = DateTime.now().add(Duration(milliseconds: timeoutMs));

    while (DateTime.now().isBefore(deadline)) {
      final target = _findTarget(id);
      final exists = target != null;
      final visible = target?.isVisible ?? false;

      final conditionMet = switch (condition) {
        'exists' => exists,
        'notExists' => !exists,
        'visible' => exists && visible,
        'notVisible' => !exists || !visible,
        _ => false,
      };

      if (conditionMet) {
        return null;
      }

      await Future<void>.delayed(const Duration(milliseconds: 100));
      await _pumpAndSettle();
    }

    return 'Timeout waiting for condition: $condition';
  }

  /// Execute a custom action defined in InteractableMixin.
  static Future<String?> _executeAction(
    InteractionTarget target,
    String actionName,
    Map<String, dynamic>? args,
  ) async {
    final action = target.findAction(actionName);
    if (action == null) {
      return 'Action not found: $actionName';
    }

    try {
      await action.execute(args ?? {});
      await _pumpAndSettle();
      return null;
    } catch (e) {
      return 'Action failed: $e';
    }
  }

  /// Dispatch a sequence of pointer events.
  static Future<void> _dispatchPointerSequence(List<PointerEvent> events) async {
    for (final event in events) {
      GestureBinding.instance.handlePointerEvent(event);
      // Small delay between events for gesture recognition
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
  }

  /// Pump frames until settled.
  static Future<void> _pumpAndSettle() async {
    final binding = WidgetsBinding.instance;
    
    // Schedule a frame and wait for it
    await Future<void>.delayed(Duration.zero);
    
    // Allow animations to complete
    var framesWaited = 0;
    const maxFrames = 100;
    
    while (binding.hasScheduledFrame && framesWaited < maxFrames) {
      await Future<void>.delayed(const Duration(milliseconds: 16));
      framesWaited++;
    }
  }
}
