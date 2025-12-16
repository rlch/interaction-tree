import 'package:flutter/foundation.dart';

@immutable
class ActionParameter {
  const ActionParameter({
    required this.name,
    required this.type,
    required this.description,
    this.required = true,
    this.defaultValue,
  });

  final String name;

  /// Type hint for the parameter: 'string', 'int', 'double', 'bool'
  final String type;

  final String description;

  final bool required;

  final Object? defaultValue;

  Map<String, Object?> toJson() => {
        'name': name,
        'type': type,
        'description': description,
        'required': required,
        if (defaultValue != null) 'defaultValue': defaultValue,
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ActionParameter &&
          runtimeType == other.runtimeType &&
          name == other.name &&
          type == other.type;

  @override
  int get hashCode => Object.hash(name, type);

  @override
  String toString() => 'ActionParameter($name: $type)';
}
