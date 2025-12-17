import 'package:flutter_driver/driver_extension.dart';

import 'extension/batch_extension.dart';
import 'extension/execute_action_extension.dart';
import 'extension/get_tree_extension.dart';
import 'extension/interaction_key_finder_extension.dart';

/// Enables Flutter Driver with interaction_tree extensions.
///
/// Call this in your app's main() before runApp():
/// ```dart
/// void main() {
///   enableInteractionTreeDriver();
///   runApp(const MyApp());
/// }
/// ```
///
/// This registers:
/// - InteractionKeyFinder: Find widgets by InteractionKey ID
/// - GetTreeCommand: Get the full interaction tree
/// - ExecuteActionCommand: Execute custom actions on widgets with InteractableMixin
/// - BatchCommand: Execute multiple interactions in sequence
///
/// Additional parameters are passed to enableFlutterDriverExtension.
void enableInteractionTreeDriver({
  DataHandler? handler,
  bool silenceErrors = false,
  bool enableTextEntryEmulation = true,
  List<FinderExtension>? additionalFinders,
  List<CommandExtension>? additionalCommands,
}) {
  enableFlutterDriverExtension(
    handler: handler,
    silenceErrors: silenceErrors,
    enableTextEntryEmulation: enableTextEntryEmulation,
    finders: [
      InteractionKeyFinderExtension(),
      ...?additionalFinders,
    ],
    commands: [
      GetTreeExtension(),
      ExecuteActionExtension(),
      BatchExtension(),
      ...?additionalCommands,
    ],
  );
}
