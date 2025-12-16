import 'package:flutter/widgets.dart';

/// A widget that adds contextual description to the interaction tree
/// without marking its child as interactive.
///
/// Use this to provide "system prompt" style context that helps describe
/// a section of the UI without affecting interactivity detection.
///
/// Example:
/// ```dart
/// InteractionContext(
///   description: 'User profile section with editable fields',
///   child: Column(
///     children: [
///       TextField(key: InteractionKey('name-field')),
///       TextField(key: InteractionKey('email-field')),
///     ],
///   ),
/// )
/// ```
class InteractionContext extends StatelessWidget {
  const InteractionContext({
    super.key,
    required this.description,
    required this.child,
  });

  /// Contextual description for this region of the widget tree.
  final String description;

  /// The child widget tree this context applies to.
  final Widget child;

  @override
  Widget build(BuildContext context) => child;

  /// Finds the nearest [InteractionContext] above the given context.
  static InteractionContext? of(BuildContext context) {
    return context.findAncestorWidgetOfExactType<InteractionContext>();
  }

  /// Collects all [InteractionContext] descriptions from ancestors.
  static List<String> allOf(BuildContext context) {
    final descriptions = <String>[];
    context.visitAncestorElements((element) {
      if (element.widget is InteractionContext) {
        descriptions.add((element.widget as InteractionContext).description);
      }
      return true;
    });
    return descriptions.reversed.toList();
  }
}
