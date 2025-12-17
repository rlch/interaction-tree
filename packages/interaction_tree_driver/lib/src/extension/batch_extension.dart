import 'package:flutter/widgets.dart';
import 'package:flutter_driver/driver_extension.dart';
import 'package:flutter_driver/flutter_driver.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

import '../commands/batch_command.dart';
import '../finders/interaction_key_finder.dart';

/// App-side extension that handles BatchCommand.
class BatchExtension extends CommandExtension {
  @override
  String get commandKind => 'batch';

  @override
  Command deserialize(
    Map<String, String> params,
    DeserializeFinderFactory finderFactory,
    DeserializeCommandFactory commandFactory,
  ) {
    return BatchCommand.deserialize(params);
  }

  @override
  Future<Result> call(
    Command command,
    WidgetController prober,
    CreateFinderFactory finderFactory,
    CommandHandlerFactory handlerFactory,
  ) async {
    final cmd = command as BatchCommand;
    final stopwatch = Stopwatch()..start();
    final results = <BatchStepResult>[];
    final allLogs = <String>[];
    final allErrors = <CapturedError>[];
    final allWarnings = <String>[];

    // Take snapshot before batch for diff
    final snapshotBefore = TreeSnapshot.fromNodes(_getCurrentTree());

    for (var i = 0; i < cmd.steps.length; i++) {
      final step = cmd.steps[i];
      final stepStopwatch = Stopwatch()..start();

      try {
        final (_, diagnostics) = await DiagnosticCollector.run(() async {
          await _executeStep(step, prober, finderFactory, handlerFactory);

          if (step.settle) {
            await prober.pumpAndSettle();
          }
        });

        // Collect diagnostics
        allLogs.addAll(diagnostics.logs);
        allErrors.addAll(diagnostics.errors);
        allWarnings.addAll(diagnostics.warnings);

        results.add(BatchStepResult(
          step: i,
          success: true,
          durationMs: stepStopwatch.elapsedMilliseconds,
        ));
      } catch (e) {
        results.add(BatchStepResult(
          step: i,
          success: false,
          error: e.toString(),
          durationMs: stepStopwatch.elapsedMilliseconds,
        ));

        // Stop batch on first failure
        return BatchResult(
          success: false,
          results: results,
          tree: _buildTreeJson(),
          focusedId: _getFocusedId(),
          diagnostics: _buildDiagnosticsJson(allLogs, allErrors, allWarnings),
          durationMs: stopwatch.elapsedMilliseconds,
        );
      }
    }

    // Compute diff
    final diff = TreeDiffer.diff(snapshotBefore, _getCurrentTree());

    return BatchResult(
      success: true,
      results: results,
      tree: _buildTreeJson(),
      diff: diff.isNotEmpty ? diff.toJson() : null,
      focusedId: _getFocusedId(),
      diagnostics: _buildDiagnosticsJson(allLogs, allErrors, allWarnings),
      durationMs: stopwatch.elapsedMilliseconds,
    );
  }

  Future<void> _executeStep(
    BatchStep step,
    WidgetController prober,
    CreateFinderFactory finderFactory,
    CommandHandlerFactory handlerFactory,
  ) async {
    final id = step.id;

    switch (step.action) {
      case 'tap':
        if (id == null) throw ArgumentError('tap requires id');
        final finder = finderFactory.createFinder(InteractionKeyFinder(id));
        await prober.tap(finder);

      case 'doubleTap':
        if (id == null) throw ArgumentError('doubleTap requires id');
        final finder = finderFactory.createFinder(InteractionKeyFinder(id));
        // Flutter's WidgetController doesn't have doubleTap directly,
        // so we tap twice with a short delay
        await prober.tap(finder);
        await Future.delayed(const Duration(milliseconds: 50));
        await prober.tap(finder);

      case 'longPress':
        if (id == null) throw ArgumentError('longPress requires id');
        final finder = finderFactory.createFinder(InteractionKeyFinder(id));
        await prober.longPress(finder);

      case 'enterText':
        if (id == null) throw ArgumentError('enterText requires id');
        final text = step.text ?? '';
        // Use Flutter Driver's built-in EnterText command via handler
        await handlerFactory.handleCommand(
          Tap(InteractionKeyFinder(id)),
          prober,
          finderFactory,
        );
        await prober.pump();
        await handlerFactory.handleCommand(
          EnterText(text),
          prober,
          finderFactory,
        );

      case 'clearText':
        if (id == null) throw ArgumentError('clearText requires id');
        // Use Flutter Driver's built-in EnterText command via handler
        await handlerFactory.handleCommand(
          Tap(InteractionKeyFinder(id)),
          prober,
          finderFactory,
        );
        await prober.pump();
        await handlerFactory.handleCommand(
          EnterText(''),
          prober,
          finderFactory,
        );

      case 'drag':
        if (id == null) throw ArgumentError('drag requires id');
        final dx = step.dx ?? 0.0;
        final dy = step.dy ?? 0.0;
        final finder = finderFactory.createFinder(InteractionKeyFinder(id));
        await prober.drag(finder, Offset(dx, dy));

      case 'scroll':
        if (id == null) throw ArgumentError('scroll requires id');
        final dx = step.dx ?? 0.0;
        final dy = step.dy ?? 0.0;
        final finder = finderFactory.createFinder(InteractionKeyFinder(id));
        // Use drag for scrolling
        await prober.drag(finder, Offset(dx, dy));

      case 'scrollIntoView':
        if (id == null) throw ArgumentError('scrollIntoView requires id');
        // TODO: alignment parameter support (not directly available in WidgetController)
        final finder = finderFactory.createFinder(InteractionKeyFinder(id));
        await prober.ensureVisible(finder);

      case 'waitFor':
        if (id == null) throw ArgumentError('waitFor requires id');
        final condition = step.condition ?? 'exists';
        final timeoutMs = step.timeoutMs ?? 10000;
        final finder = finderFactory.createFinder(InteractionKeyFinder(id));
        final timeout = Duration(milliseconds: timeoutMs);
        final deadline = DateTime.now().add(timeout);

        while (DateTime.now().isBefore(deadline)) {
          final matches = finder.evaluate();
          final conditionMet = switch (condition) {
            'exists' => matches.isNotEmpty,
            'notExists' => matches.isEmpty,
            'visible' => matches.isNotEmpty,
            'notVisible' => matches.isEmpty,
            _ => matches.isNotEmpty,
          };

          if (conditionMet) break;
          await prober.pump(const Duration(milliseconds: 100));
        }

      case 'executeAction':
        if (id == null) throw ArgumentError('executeAction requires id');
        final actionName = step.actionName;
        if (actionName == null) {
          throw ArgumentError('executeAction requires actionName');
        }
        final args = step.args ?? {};

        final target = _findTargetById(id);
        if (target == null) {
          throw StateError('Target "$id" not found');
        }

        final action = target.findAction(actionName);
        if (action == null) {
          throw StateError('Action "$actionName" not found on target "$id"');
        }

        await action.execute(args);

      default:
        throw ArgumentError('Unknown action: ${step.action}');
    }
  }

  InteractionTarget? _findTargetById(String id) {
    final rootElement = WidgetsBinding.instance.rootElement;
    if (rootElement == null) return null;

    InteractionTarget? result;
    _visitElements(rootElement, (element) {
      final key = element.widget.key;
      if (key is InteractionKey && key.id == id) {
        final capabilities = key.capabilities ?? inferCapabilities(element);
        final actions = _findActionsForElement(element, key.id);
        result = InteractionTarget(
          key: key,
          element: element,
          capabilities: capabilities,
          actions: actions,
        );
        return false;
      }
      return true;
    });
    return result;
  }

  List<InteractionAction> _findActionsForElement(Element element, String id) {
    if (element is StatefulElement) {
      final state = element.state;
      if (state is InteractableMixin && state.interactionId == id) {
        return state.actions;
      }
    }
    return const [];
  }

  void _visitElements(Element element, bool Function(Element) visitor) {
    if (!visitor(element)) return;
    element.visitChildren((child) => _visitElements(child, visitor));
  }

  List<InteractionNode> _getCurrentTree() {
    final rootElement = WidgetsBinding.instance.rootElement;
    if (rootElement == null) return [];
    return _collectNodes(rootElement);
  }

  List<InteractionNode> _collectNodes(Element element) {
    final widget = element.widget;
    final key = widget.key;

    final childNodes = <InteractionNode>[];
    element.visitChildren((child) {
      childNodes.addAll(_collectNodes(child));
    });

    if (widget is InteractionContext) {
      return [
        InteractionNode(
          description: widget.description,
          children: childNodes,
        ),
      ];
    }

    if (key is InteractionKey) {
      final capabilities = key.capabilities ?? inferCapabilities(element);
      final actions = _findActionsForElement(element, key.id);
      final renderBox = _getRenderBox(element);

      return [
        InteractionNode(
          id: key.id,
          description: key.description,
          capabilities: capabilities,
          actions: actions,
          widgetType: widget.runtimeType.toString(),
          bounds: renderBox != null ? _toBounds(renderBox) : null,
          children: childNodes,
        ),
      ];
    }

    return childNodes;
  }

  RenderBox? _getRenderBox(Element element) {
    final renderObject = element.renderObject;
    if (renderObject is RenderBox && renderObject.hasSize) {
      return renderObject;
    }
    return null;
  }

  Rect _toBounds(RenderBox box) {
    final topLeft = box.localToGlobal(Offset.zero);
    return Rect(topLeft.dx, topLeft.dy, box.size.width, box.size.height);
  }

  Map<String, Object?> _buildTreeJson() {
    final tree = _getCurrentTree();
    return {
      'targets': tree.map((n) => n.toJson()).toList(),
    };
  }

  String? _getFocusedId() {
    final focusNode = FocusManager.instance.primaryFocus;
    if (focusNode == null) return null;

    final context = focusNode.context;
    if (context == null) return null;

    String? foundId;
    context.visitAncestorElements((element) {
      final key = element.widget.key;
      if (key is InteractionKey) {
        foundId = key.id;
        return false;
      }
      return true;
    });

    return foundId;
  }

  Map<String, Object?>? _buildDiagnosticsJson(
    List<String> logs,
    List<CapturedError> errors,
    List<String> warnings,
  ) {
    if (logs.isEmpty && errors.isEmpty && warnings.isEmpty) return null;
    return {
      if (logs.isNotEmpty) 'logs': logs,
      if (errors.isNotEmpty)
        'errors': errors.map((e) => e.toJson()).toList(),
      if (warnings.isNotEmpty) 'warnings': warnings,
    };
  }
}
