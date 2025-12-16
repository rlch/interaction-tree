import 'package:flutter/foundation.dart';

import 'interaction_capability.dart';

@immutable
class InteractionKey extends LocalKey {
  const InteractionKey(
    this.id, {
    this.description,
    this.semanticLabel,
    this.capabilities,
  });

  final String id;
  final String? description;
  final String? semanticLabel;
  
  /// Explicit capabilities override. If null, capabilities are inferred
  /// from the render tree.
  final Set<InteractionCapability>? capabilities;

  @override
  bool operator ==(Object other) =>
      other is InteractionKey && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() => 'InteractionKey($id)';
}
