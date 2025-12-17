import 'package:flutter/widgets.dart';
import 'package:flutter_driver/driver_extension.dart';
import 'package:flutter_driver/flutter_driver.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

import '../commands/get_tree_command.dart';

/// App-side extension that handles GetTreeCommand.
class GetTreeExtension extends CommandExtension {
  @override
  String get commandKind => 'getTree';

  @override
  Command deserialize(
    Map<String, String> params,
    DeserializeFinderFactory finderFactory,
    DeserializeCommandFactory commandFactory,
  ) {
    return GetTreeCommand.deserialize(params);
  }

  @override
  Future<Result> call(
    Command command,
    WidgetController prober,
    CreateFinderFactory finderFactory,
    CommandHandlerFactory handlerFactory,
  ) async {
    final cmd = command as GetTreeCommand;

    final tree = _buildTree(
      includeBounds: cmd.includeBounds,
      includeWidgetType: cmd.includeWidgetType,
      includeState: cmd.includeState,
    );

    return GetTreeResult(tree);
  }

  List<Map<String, Object?>> _buildTree({
    required bool includeBounds,
    required bool includeWidgetType,
    required bool includeState,
  }) {
    final rootElement = WidgetsBinding.instance.rootElement;
    if (rootElement == null) return [];

    final nodes = _collectNodes(rootElement);
    return nodes
        .map((n) => n.toJson(
              includeBounds: includeBounds,
              includeWidgetType: includeWidgetType,
              includeState: includeState,
              stateProvider: includeState ? _getStateForId : null,
            ))
        .toList();
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

  List<InteractionAction> _findActionsForElement(Element element, String id) {
    if (element is StatefulElement) {
      final state = element.state;
      if (state is InteractableMixin && state.interactionId == id) {
        return state.actions;
      }
    }
    return const [];
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

  Map<String, Object?> _getStateForId(String id) {
    final target = _findTargetById(id);
    return target?.getState() ?? {};
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

  void _visitElements(Element element, bool Function(Element) visitor) {
    if (!visitor(element)) return;
    element.visitChildren((child) => _visitElements(child, visitor));
  }
}
