import 'package:flutter_driver/flutter_driver.dart';

/// A SerializableFinder that locates widgets by their InteractionKey ID.
///
/// Use this in driver tests:
/// ```dart
/// final loginButton = InteractionKeyFinder('login_button');
/// await driver.tap(loginButton);
/// ```
class InteractionKeyFinder extends SerializableFinder {
  const InteractionKeyFinder(this.id);

  /// The unique identifier matching InteractionKey.id on the widget.
  final String id;

  @override
  String get finderType => 'InteractionKeyFinder';

  @override
  Map<String, String> serialize() => super.serialize()
    ..addAll(<String, String>{
      'id': id,
    });

  /// Deserialize from JSON parameters.
  factory InteractionKeyFinder.deserialize(Map<String, String> params) {
    final id = params['id'];
    if (id == null || id.isEmpty) {
      throw ArgumentError('InteractionKeyFinder requires "id" parameter');
    }
    return InteractionKeyFinder(id);
  }

  @override
  String toString() => 'InteractionKeyFinder("$id")';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is InteractionKeyFinder &&
          runtimeType == other.runtimeType &&
          id == other.id;

  @override
  int get hashCode => id.hashCode;
}
