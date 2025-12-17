import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree_driver/interaction_tree_driver.dart';

void main() {
  group('InteractionKeyFinder', () {
    test('creates finder with id', () {
      const finder = InteractionKeyFinder('test_id');
      expect(finder.id, 'test_id');
    });

    test('has correct finderType', () {
      const finder = InteractionKeyFinder('test');
      expect(finder.finderType, 'InteractionKeyFinder');
    });

    test('serialize includes id', () {
      const finder = InteractionKeyFinder('login_button');
      final serialized = finder.serialize();

      expect(serialized['finderType'], 'InteractionKeyFinder');
      expect(serialized['id'], 'login_button');
    });

    test('deserialize creates finder from params', () {
      final finder = InteractionKeyFinder.deserialize({
        'id': 'signup_button',
      });

      expect(finder.id, 'signup_button');
    });

    test('deserialize throws on missing id', () {
      expect(
        () => InteractionKeyFinder.deserialize({}),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('deserialize throws on empty id', () {
      expect(
        () => InteractionKeyFinder.deserialize({'id': ''}),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('toString returns readable format', () {
      const finder = InteractionKeyFinder('my_widget');
      expect(finder.toString(), 'InteractionKeyFinder("my_widget")');
    });

    test('equality is based on id', () {
      const finder1 = InteractionKeyFinder('same_id');
      const finder2 = InteractionKeyFinder('same_id');
      const finder3 = InteractionKeyFinder('different_id');

      expect(finder1, equals(finder2));
      expect(finder1, isNot(equals(finder3)));
    });

    test('hashCode is based on id', () {
      const finder1 = InteractionKeyFinder('test');
      const finder2 = InteractionKeyFinder('test');

      expect(finder1.hashCode, equals(finder2.hashCode));
    });
  });
}
