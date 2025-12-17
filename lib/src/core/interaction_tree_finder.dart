import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'interaction_key.dart';

/// A Finder that locates widgets by their InteractionKey ID.
/// Works with integration_test, widget tests, and the driver framework.
class InteractionTreeFinder extends MatchFinder {
  InteractionTreeFinder(this.id, {super.skipOffstage = true});

  final String id;

  @override
  String get description => 'InteractionKey("$id")';

  @override
  bool matches(Element candidate) {
    final key = candidate.widget.key;
    return key is InteractionKey && key.id == id;
  }
}

/// Convenience function to find by InteractionKey ID.
/// Use in tests: await tester.tap(interaction('login_button'));
Finder interaction(String id, {bool skipOffstage = true}) {
  return InteractionTreeFinder(id, skipOffstage: skipOffstage);
}
