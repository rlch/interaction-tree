import 'package:flutter/widgets.dart';

import 'interaction_capability.dart';
import 'interaction_key.dart';

class InteractionTarget {
  InteractionTarget({
    required this.key,
    required this.element,
    required this.capabilities,
  });

  final InteractionKey key;
  final Element element;
  final Set<InteractionCapability> capabilities;

  String get id => key.id;
  String? get description => key.description;
  String? get semanticLabel => key.semanticLabel;

  Widget get widget => element.widget;
  String get widgetType => widget.runtimeType.toString();

  RenderBox? get renderBox {
    final renderObject = element.renderObject;
    if (renderObject is RenderBox && renderObject.hasSize) {
      return renderObject;
    }
    return null;
  }

  Offset get center {
    final box = renderBox;
    if (box == null) return Offset.zero;
    return box.localToGlobal(box.size.center(Offset.zero));
  }

  Rect get bounds {
    final box = renderBox;
    if (box == null) return Rect.zero;
    final topLeft = box.localToGlobal(Offset.zero);
    return topLeft & box.size;
  }

  bool get isVisible {
    final box = renderBox;
    if (box == null) return false;
    return box.hasSize && box.size.width > 0 && box.size.height > 0;
  }

  Map<String, Object?> toJson() => {
        'id': id,
        if (description != null) 'description': description,
        if (semanticLabel != null) 'semanticLabel': semanticLabel,
        'capabilities': capabilities.map((c) => c.name).toList(),
        'widgetType': widgetType,
        'bounds': {
          'x': bounds.left,
          'y': bounds.top,
          'width': bounds.width,
          'height': bounds.height,
        },
      };

  @override
  String toString() => 'InteractionTarget($id)';
}
