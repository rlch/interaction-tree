import 'package:flutter/widgets.dart';

/// Data class representing an InteractionContext's name and description.
/// This is internal - used for serialization to the tree service.
class InteractionContextInfo {
  const InteractionContextInfo({
    required this.name,
    this.description,
  });

  final String name;
  final String? description;

  Map<String, dynamic> toJson() => {
        'name': name,
        if (description != null) 'description': description,
      };
}

/// A widget that adds contextual grouping to the interaction tree
/// without marking its child as interactive.
///
/// Use this to provide semantic grouping that helps structure
/// a section of the UI for AI agents. The [name] is used as the
/// grouping label in the tree, and [description] provides additional context.
///
/// Example:
/// ```dart
/// InteractionContext(
///   name: 'user-profile',
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
    required this.name,
    this.description,
    required this.child,
  });

  /// The name/identifier for this context region.
  /// This will be used as the grouping label in the tree.
  final String name;

  /// Optional description providing additional context.
  final String? description;

  /// The child widget tree this context applies to.
  final Widget child;

  @override
  Widget build(BuildContext context) => child;

  /// Finds the nearest [InteractionContext] above the given context.
  static InteractionContext? of(BuildContext context) {
    return context.findAncestorWidgetOfExactType<InteractionContext>();
  }

  /// Collects all [InteractionContext] info from ancestors.
  static List<InteractionContextInfo> allOf(BuildContext context) {
    final contexts = <InteractionContextInfo>[];
    context.visitAncestorElements((element) {
      if (element.widget is InteractionContext) {
        final ctx = element.widget as InteractionContext;
        contexts.add(InteractionContextInfo(
          name: ctx.name,
          description: ctx.description,
        ));
      }
      return true;
    });
    return contexts.reversed.toList();
  }
}
