/// Flutter Driver integration for interaction_tree.
///
/// This package provides:
/// - [InteractionKeyFinder]: SerializableFinder to locate widgets by InteractionKey ID
/// - [enableInteractionTreeDriver]: Wrapper around enableFlutterDriverExtension
/// - Custom commands: GetTreeCommand, ExecuteActionCommand, BatchCommand
///
/// ## App Setup
///
/// In your app's main entry point:
/// ```dart
/// import 'package:interaction_tree_driver/interaction_tree_driver.dart';
///
/// void main() {
///   enableInteractionTreeDriver();
///   runApp(const MyApp());
/// }
/// ```
///
/// ## Driver Test Setup
///
/// In your driver tests:
/// ```dart
/// import 'package:flutter_driver/flutter_driver.dart';
/// import 'package:interaction_tree_driver/interaction_tree_driver.dart';
///
/// void main() {
///   late FlutterDriver driver;
///
///   setUpAll(() async {
///     driver = await FlutterDriver.connect();
///   });
///
///   tearDownAll(() async {
///     await driver.close();
///   });
///
///   test('tap login button', () async {
///     // Use InteractionKeyFinder with standard driver commands
///     await driver.tap(InteractionKeyFinder('login_button'));
///
///     // Get the interaction tree
///     final result = await driver.sendCommand(GetTreeCommand());
///     print(result.toJson());
///   });
/// }
/// ```
library;

// Finders
export 'src/finders/interaction_key_finder.dart' show InteractionKeyFinder;

// Commands and Results
export 'src/commands/get_tree_command.dart' show GetTreeCommand, GetTreeResult;
export 'src/commands/execute_action_command.dart'
    show ExecuteActionCommand, ExecuteActionResult;
export 'src/commands/batch_command.dart'
    show BatchCommand, BatchStep, BatchResult, BatchStepResult;

// App-side extensions (for custom setups)
export 'src/extension/interaction_key_finder_extension.dart'
    show InteractionKeyFinderExtension;
export 'src/extension/get_tree_extension.dart' show GetTreeExtension;
export 'src/extension/execute_action_extension.dart'
    show ExecuteActionExtension;
export 'src/extension/batch_extension.dart' show BatchExtension;

// Main setup function
export 'src/enable_driver.dart' show enableInteractionTreeDriver;
