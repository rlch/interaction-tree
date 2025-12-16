import 'package:flutter/widgets.dart';

import 'interactable_mixin.dart';
import 'interaction_action.dart';
import 'interaction_capability.dart';
import 'interaction_context.dart';
import 'interaction_key.dart';
import 'interaction_node.dart' as node;
import 'interaction_target.dart';

class InteractionFinder {
  InteractionFinder._();

  static final instance = InteractionFinder._();

  InteractionTarget? byId(String id) {
    final targets = allTargets();
    for (final target in targets) {
      if (target.id == id) return target;
    }
    return null;
  }

  List<InteractionTarget> byDescription(Pattern pattern) {
    return allTargets().where((t) {
      final desc = t.description;
      if (desc == null) return false;
      if (pattern is String) return desc.contains(pattern);
      if (pattern is RegExp) return pattern.hasMatch(desc);
      return false;
    }).toList();
  }

  List<InteractionTarget> byWidgetType<T extends Widget>() {
    return allTargets().where((t) => t.widget is T).toList();
  }

  List<InteractionTarget> byCapability(InteractionCapability capability) {
    return allTargets().where((t) => t.capabilities.contains(capability)).toList();
  }

  /// Returns a flat list of all interactive targets.
  List<InteractionTarget> allTargets() {
    final rootElement = WidgetsBinding.instance.rootElement;
    if (rootElement == null) return [];

    final targets = <InteractionTarget>[];
    _collectTargets(rootElement, targets);
    return targets;
  }

  void _collectTargets(Element element, List<InteractionTarget> targets) {
    final key = element.widget.key;
    if (key is InteractionKey) {
      final capabilities = key.capabilities ?? inferCapabilities(element);
      final actions = _findActionsForElement(element, key.id);
      targets.add(InteractionTarget(
        key: key,
        element: element,
        capabilities: capabilities,
        actions: actions,
      ));
    }
    element.visitChildren((child) => _collectTargets(child, targets));
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

  /// Returns the interaction tree with proper hierarchy.
  List<node.InteractionNode> tree() {
    final rootElement = WidgetsBinding.instance.rootElement;
    if (rootElement == null) return [];

    return _buildTree(rootElement);
  }

  List<node.InteractionNode> _buildTree(Element element) {
    final widget = element.widget;
    final key = widget.key;

    // Collect children first
    final childNodes = <node.InteractionNode>[];
    element.visitChildren((child) {
      childNodes.addAll(_buildTree(child));
    });

    // Check if this element creates a node
    if (widget is InteractionContext) {
      // Context node - wrap children
      return [
        node.InteractionNode(
          description: widget.description,
          children: childNodes,
        ),
      ];
    }

    if (key is InteractionKey) {
      // Interactive node - wrap children
      final capabilities = key.capabilities ?? inferCapabilities(element);
      final actions = _findActionsForElement(element, key.id);
      final renderBox = _getRenderBox(element);

      return [
        node.InteractionNode(
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

    // Not a significant node - pass children up
    return childNodes;
  }

  RenderBox? _getRenderBox(Element element) {
    final renderObject = element.renderObject;
    if (renderObject is RenderBox && renderObject.hasSize) {
      return renderObject;
    }
    return null;
  }

  node.Rect _toBounds(RenderBox box) {
    final topLeft = box.localToGlobal(Offset.zero);
    return node.Rect(topLeft.dx, topLeft.dy, box.size.width, box.size.height);
  }

  @Deprecated('Use allTargets() instead')
  List<InteractionTarget> all() => allTargets();
}
