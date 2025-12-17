import 'package:flutter/widgets.dart';
import 'package:flutter_driver/driver_extension.dart';
import 'package:flutter_driver/flutter_driver.dart';
import 'package:flutter_test/flutter_test.dart' as flutter_test;
import 'package:interaction_tree/interaction_tree.dart';

import '../finders/interaction_key_finder.dart';

/// App-side extension that registers the InteractionKeyFinder
/// with Flutter Driver.
///
/// This extension is automatically registered when calling
/// [enableInteractionTreeDriver].
class InteractionKeyFinderExtension extends FinderExtension {
  @override
  String get finderType => 'InteractionKeyFinder';

  @override
  SerializableFinder deserialize(
    Map<String, String> params,
    DeserializeFinderFactory finderFactory,
  ) {
    return InteractionKeyFinder.deserialize(params);
  }

  @override
  flutter_test.Finder createFinder(
    SerializableFinder finder,
    CreateFinderFactory finderFactory,
  ) {
    final keyFinder = finder as InteractionKeyFinder;

    return flutter_test.find.byElementPredicate(
      (Element element) {
        final key = element.widget.key;
        return key is InteractionKey && key.id == keyFinder.id;
      },
      description: 'InteractionKey("${keyFinder.id}")',
    );
  }
}
