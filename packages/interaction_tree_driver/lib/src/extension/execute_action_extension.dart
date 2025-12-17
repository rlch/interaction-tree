import 'package:flutter/widgets.dart';
import 'package:flutter_driver/driver_extension.dart';
import 'package:flutter_driver/flutter_driver.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

import '../commands/execute_action_command.dart';
import '../finders/interaction_key_finder.dart';

/// App-side extension that handles ExecuteActionCommand.
class ExecuteActionExtension extends CommandExtension {
  @override
  String get commandKind => 'executeAction';

  @override
  Command deserialize(
    Map<String, String> params,
    DeserializeFinderFactory finderFactory,
    DeserializeCommandFactory commandFactory,
  ) {
    return ExecuteActionCommand.deserialize(params, finderFactory);
  }

  @override
  Future<Result> call(
    Command command,
    WidgetController prober,
    CreateFinderFactory finderFactory,
    CommandHandlerFactory handlerFactory,
  ) async {
    final cmd = command as ExecuteActionCommand;
    final keyFinder = cmd.finder as InteractionKeyFinder;

    // Take snapshot before action for diff
    TreeSnapshot? snapshotBefore;
    if (cmd.settle) {
      snapshotBefore = TreeSnapshot.fromNodes(_getCurrentTree());
    }

    try {
      // Find the target
      final target = _findTargetById(keyFinder.id);
      if (target == null) {
        return ExecuteActionResult(
          success: false,
          error: 'Target "${keyFinder.id}" not found',
        );
      }

      // Find the action
      final action = target.findAction(cmd.actionName);
      if (action == null) {
        return ExecuteActionResult(
          success: false,
          error:
              'Action "${cmd.actionName}" not found on target "${keyFinder.id}"',
        );
      }

      // Execute with diagnostic collection
      final (_, diagnostics) = await DiagnosticCollector.run(() async {
        await action.execute(cmd.args);

        if (cmd.settle) {
          await _settle(prober);
        }
      });

      // Compute diff if we settled
      TreeDiff? diff;
      if (cmd.settle && snapshotBefore != null) {
        diff = TreeDiffer.diff(snapshotBefore, _getCurrentTree());
      }

      final tree = _buildTreeJson();

      return ExecuteActionResult(
        success: true,
        tree: tree,
        diff: diff?.isNotEmpty == true ? diff!.toJson() : null,
        focusedId: _getFocusedId(),
        diagnostics:
            diagnostics.isNotEmpty ? diagnostics.toJson() : null,
      );
    } catch (e) {
      return ExecuteActionResult(
        success: false,
        error: e.toString(),
      );
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

  Future<void> _settle(WidgetController prober) async {
    await prober.pumpAndSettle();
  }
}
