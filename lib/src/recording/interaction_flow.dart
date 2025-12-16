import 'package:flutter/foundation.dart';

import 'interaction_step.dart';

@immutable
class InteractionFlow {
  const InteractionFlow({
    required this.name,
    this.description,
    this.steps = const [],
    required this.createdAt,
  });

  final String name;
  final String? description;
  final List<InteractionStep> steps;
  final DateTime createdAt;

  InteractionFlow addStep(InteractionStep step) {
    return InteractionFlow(
      name: name,
      description: description,
      steps: [...steps, step],
      createdAt: createdAt,
    );
  }

  Map<String, Object?> toJson() => {
        'name': name,
        if (description != null) 'description': description,
        'steps': steps.map((s) => s.toJson()).toList(),
        'created_at': createdAt.toIso8601String(),
      };

  factory InteractionFlow.fromJson(Map<String, Object?> json) {
    return InteractionFlow(
      name: json['name'] as String,
      description: json['description'] as String?,
      steps: (json['steps'] as List<Object?>)
          .map((s) => InteractionStep.fromJson(s as Map<String, Object?>))
          .toList(),
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  InteractionFlow copyWith({
    String? name,
    String? description,
    List<InteractionStep>? steps,
    DateTime? createdAt,
  }) {
    return InteractionFlow(
      name: name ?? this.name,
      description: description ?? this.description,
      steps: steps ?? this.steps,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is InteractionFlow &&
          runtimeType == other.runtimeType &&
          name == other.name &&
          description == other.description &&
          listEquals(steps, other.steps) &&
          createdAt == other.createdAt;

  @override
  int get hashCode => Object.hash(
        name,
        description,
        Object.hashAll(steps),
        createdAt,
      );

  @override
  String toString() =>
      'InteractionFlow(name: $name, steps: ${steps.length}, createdAt: $createdAt)';
}
