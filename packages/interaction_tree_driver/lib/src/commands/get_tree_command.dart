import 'dart:convert';

import 'package:flutter_driver/flutter_driver.dart';

/// Command to get the full interaction tree from the app.
///
/// Use with FlutterDriver.sendCommand:
/// ```dart
/// final result = await driver.sendCommand(GetTreeCommand());
/// final tree = result as GetTreeResult;
/// print(tree.targets);
/// ```
class GetTreeCommand extends Command {
  const GetTreeCommand({
    this.includeBounds = false,
    this.includeWidgetType = false,
    this.includeState = false,
    super.timeout,
  });

  /// Whether to include bounds (x, y, width, height) for each target.
  final bool includeBounds;

  /// Whether to include the widget type name.
  final bool includeWidgetType;

  /// Whether to include current state (text value, enabled, visible).
  final bool includeState;

  @override
  String get kind => 'getTree';

  @override
  Map<String, String> serialize() => super.serialize()
    ..addAll(<String, String>{
      'includeBounds': includeBounds.toString(),
      'includeWidgetType': includeWidgetType.toString(),
      'includeState': includeState.toString(),
    });

  /// Deserialize from JSON parameters.
  factory GetTreeCommand.deserialize(Map<String, String> params) {
    return GetTreeCommand(
      includeBounds: params['includeBounds'] == 'true',
      includeWidgetType: params['includeWidgetType'] == 'true',
      includeState: params['includeState'] == 'true',
    );
  }
}

/// Result of GetTreeCommand.
class GetTreeResult extends Result {
  const GetTreeResult(this.targets);

  /// The interaction tree as a list of nodes.
  final List<Map<String, Object?>> targets;

  @override
  Map<String, dynamic> toJson() => {
        'targets': targets,
      };

  /// Deserialize from JSON response.
  factory GetTreeResult.fromJson(Map<String, dynamic> json) {
    final targets = json['targets'] as List?;
    return GetTreeResult(
      targets?.cast<Map<String, Object?>>() ?? [],
    );
  }

  /// Parse from response string (for driver-side use).
  factory GetTreeResult.fromResponse(String response) {
    final json = jsonDecode(response) as Map<String, dynamic>;
    return GetTreeResult.fromJson(json);
  }
}
