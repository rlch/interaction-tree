import 'package:flutter/foundation.dart';

@immutable
class InteractionStep {
  const InteractionStep({
    required this.targetId,
    required this.interaction,
    this.arguments = const {},
    required this.timestamp,
    this.description,
  });

  final String targetId;
  final String interaction;
  final Map<String, Object?> arguments;
  final DateTime timestamp;
  final String? description;

  Map<String, Object?> toJson() => {
        'target_id': targetId,
        'interaction': interaction,
        if (arguments.isNotEmpty) 'arguments': arguments,
        'timestamp': timestamp.toIso8601String(),
        if (description != null) 'description': description,
      };

  factory InteractionStep.fromJson(Map<String, Object?> json) {
    return InteractionStep(
      targetId: json['target_id'] as String,
      interaction: json['interaction'] as String,
      arguments: (json['arguments'] as Map<String, Object?>?) ?? const {},
      timestamp: DateTime.parse(json['timestamp'] as String),
      description: json['description'] as String?,
    );
  }

  InteractionStep copyWith({
    String? targetId,
    String? interaction,
    Map<String, Object?>? arguments,
    DateTime? timestamp,
    String? description,
  }) {
    return InteractionStep(
      targetId: targetId ?? this.targetId,
      interaction: interaction ?? this.interaction,
      arguments: arguments ?? this.arguments,
      timestamp: timestamp ?? this.timestamp,
      description: description ?? this.description,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is InteractionStep &&
          runtimeType == other.runtimeType &&
          targetId == other.targetId &&
          interaction == other.interaction &&
          mapEquals(arguments, other.arguments) &&
          timestamp == other.timestamp &&
          description == other.description;

  @override
  int get hashCode => Object.hash(
        targetId,
        interaction,
        Object.hashAll(arguments.entries),
        timestamp,
        description,
      );

  @override
  String toString() =>
      'InteractionStep(targetId: $targetId, interaction: $interaction, arguments: $arguments)';
}
