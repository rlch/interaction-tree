import 'package:flutter/foundation.dart';

import 'action_parameter.dart';

@immutable
class InteractionAction {
  const InteractionAction({
    required this.name,
    required this.description,
    required this.execute,
    this.parameters = const [],
  });

  final String name;

  final String description;

  final List<ActionParameter> parameters;

  final Future<void> Function(Map<String, dynamic> args) execute;

  Map<String, Object?> toJson() => {
        'name': name,
        'description': description,
        if (parameters.isNotEmpty)
          'parameters': parameters.map((p) => p.toJson()).toList(),
      };

  @override
  String toString() => 'InteractionAction($name)';
}
