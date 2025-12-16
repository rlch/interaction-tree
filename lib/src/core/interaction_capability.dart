import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

enum InteractionCapability {
  tap,
  doubleTap,
  longPress,
  enterText,
  clearText,
  drag,
  scroll,
  toggle,
  hover,
  focus,
}

Set<InteractionCapability> inferCapabilities(Element element) {
  final caps = <InteractionCapability>{};

  _visitRenderTree(element, caps);

  return caps;
}

void _visitRenderTree(Element element, Set<InteractionCapability> caps) {
  final renderObject = element.renderObject;
  final widget = element.widget;

  // Base tap/press capabilities for any visible box
  if (renderObject is RenderBox && renderObject.hasSize) {
    caps.add(InteractionCapability.tap);
    caps.add(InteractionCapability.longPress);
    caps.add(InteractionCapability.doubleTap);
  }

  // Text input
  if (renderObject is RenderEditable) {
    caps.add(InteractionCapability.enterText);
    caps.add(InteractionCapability.clearText);
    caps.add(InteractionCapability.focus);
  }

  // Scrollable content
  if (renderObject is RenderAbstractViewport || 
      renderObject is RenderSliver ||
      renderObject is RenderSliverList ||
      renderObject is RenderSliverGrid ||
      renderObject is RenderSliverFixedExtentList) {
    caps.add(InteractionCapability.scroll);
  }

  // Rich text with tap handlers (links, clickable spans)
  if (renderObject is RenderParagraph) {
    final text = renderObject.text;
    if (_hasGestureRecognizer(text)) {
      caps.add(InteractionCapability.tap);
    }
  }

  // Mouse hover regions (desktop)
  if (widget is MouseRegion || widget is InkWell || widget is InkResponse) {
    caps.add(InteractionCapability.hover);
  }

  // Focusable widgets
  if (widget is Focus || widget is FocusScope) {
    caps.add(InteractionCapability.focus);
  }

  // Draggable widgets
  if (widget is Draggable || 
      widget is LongPressDraggable ||
      widget is ReorderableListView ||
      widget is ReorderableDragStartListener) {
    caps.add(InteractionCapability.drag);
  }

  // Slider/range controls
  if (widget is Slider || widget is RangeSlider) {
    caps.add(InteractionCapability.drag);
  }

  // Toggle widgets
  if (widget is Checkbox || 
      widget is Switch || 
      widget is Radio ||
      widget is CheckboxListTile ||
      widget is SwitchListTile ||
      widget is RadioListTile) {
    caps.add(InteractionCapability.toggle);
  }

  // Visit children to find nested capabilities
  element.visitChildren((child) => _visitRenderTree(child, caps));
}

bool _hasGestureRecognizer(InlineSpan span) {
  if (span is TextSpan) {
    if (span.recognizer != null) return true;
    final children = span.children;
    if (children != null) {
      for (final child in children) {
        if (_hasGestureRecognizer(child)) return true;
      }
    }
  }
  return false;
}

String capabilityToString(InteractionCapability cap) {
  return cap.name;
}

InteractionCapability? capabilityFromString(String name) {
  for (final cap in InteractionCapability.values) {
    if (cap.name == name) return cap;
  }
  return null;
}
