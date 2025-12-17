import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  group('InteractionKey', () {
    test('creates key with id', () {
      const key = InteractionKey('test_id');
      expect(key.id, 'test_id');
      expect(key.description, isNull);
      expect(key.semanticLabel, isNull);
      expect(key.capabilities, isNull);
    });

    test('creates key with all parameters', () {
      const key = InteractionKey(
        'test_id',
        description: 'Test description',
        semanticLabel: 'Test label',
        capabilities: {InteractionCapability.tap, InteractionCapability.scroll},
      );

      expect(key.id, 'test_id');
      expect(key.description, 'Test description');
      expect(key.semanticLabel, 'Test label');
      expect(key.capabilities, contains(InteractionCapability.tap));
      expect(key.capabilities, contains(InteractionCapability.scroll));
    });

    test('equality is based on id only', () {
      const key1 = InteractionKey('same_id', description: 'Desc 1');
      const key2 = InteractionKey('same_id', description: 'Desc 2');
      const key3 = InteractionKey('different_id');

      expect(key1, equals(key2));
      expect(key1, isNot(equals(key3)));
    });

    test('hashCode is based on id', () {
      const key1 = InteractionKey('test_id');
      const key2 = InteractionKey('test_id');

      expect(key1.hashCode, equals(key2.hashCode));
      expect(key1.hashCode, equals('test_id'.hashCode));
    });

    test('toString returns readable format', () {
      const key = InteractionKey('my_button');
      expect(key.toString(), 'InteractionKey(my_button)');
    });
  });
}
