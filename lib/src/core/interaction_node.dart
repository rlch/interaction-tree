import 'interaction_action.dart';
import 'interaction_capability.dart';

/// A node in the interaction tree. Can be either:
/// - A context node (only has description + children)
/// - An interactive node (has id, capabilities, etc. + children)
class InteractionNode {
  InteractionNode({
    this.id,
    this.description,
    this.capabilities = const {},
    this.actions = const [],
    this.widgetType,
    this.bounds,
    this.children = const [],
  });

  /// Unique identifier (null for pure context nodes).
  final String? id;

  final String? description;
  final Set<InteractionCapability> capabilities;
  final List<InteractionAction> actions;
  final String? widgetType;
  final Rect? bounds;
  final List<InteractionNode> children;

  bool get isContext => id == null;
  bool get isInteractive => id != null;
  bool get hasChildren => children.isNotEmpty;

  Map<String, Object?> toJson({
    bool includeBounds = false,
    bool includeWidgetType = false,
    bool includeState = false,
    Map<String, Object?> Function(String id)? stateProvider,
  }) =>
      {
        if (id != null) 'id': id,
        if (description != null) 'description': description,
        if (capabilities.isNotEmpty)
          'capabilities': capabilities.map((c) => c.name).toList(),
        if (actions.isNotEmpty)
          'actions': actions.map((a) => a.toJson()).toList(),
        if (includeWidgetType && widgetType != null) 'widgetType': widgetType,
        if (includeBounds && bounds != null)
          'bounds': {
            'x': bounds!.left,
            'y': bounds!.top,
            'width': bounds!.width,
            'height': bounds!.height,
          },
        if (includeState && id != null && stateProvider != null)
          'state': stateProvider(id!),
        if (children.isNotEmpty)
          'children': children
              .map((c) => c.toJson(
                    includeBounds: includeBounds,
                    includeWidgetType: includeWidgetType,
                    includeState: includeState,
                    stateProvider: stateProvider,
                  ))
              .toList(),
      };
}

class Rect {
  const Rect(this.left, this.top, this.width, this.height);

  final double left;
  final double top;
  final double width;
  final double height;
}
