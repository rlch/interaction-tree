import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  group('InteractionNode', () {
    test('creates context node (no id)', () {
      final node = InteractionNode(
        description: 'Login form section',
        children: [],
      );

      expect(node.isContext, isTrue);
      expect(node.isInteractive, isFalse);
      expect(node.id, isNull);
      expect(node.description, 'Login form section');
    });

    test('creates interactive node (with id)', () {
      final node = InteractionNode(
        id: 'login_button',
        description: 'Submit login form',
        capabilities: {InteractionCapability.tap},
        widgetType: 'ElevatedButton',
      );

      expect(node.isContext, isFalse);
      expect(node.isInteractive, isTrue);
      expect(node.id, 'login_button');
      expect(node.capabilities, contains(InteractionCapability.tap));
    });

    test('hasChildren returns correctly', () {
      final leaf = InteractionNode(id: 'leaf');
      final parent = InteractionNode(
        id: 'parent',
        children: [leaf],
      );

      expect(leaf.hasChildren, isFalse);
      expect(parent.hasChildren, isTrue);
    });

    test('toJson produces correct output', () {
      final node = InteractionNode(
        id: 'test_button',
        description: 'A test button',
        capabilities: {InteractionCapability.tap, InteractionCapability.longPress},
        widgetType: 'ElevatedButton',
        bounds: const Rect(10, 20, 100, 50),
      );

      final json = node.toJson(
        includeBounds: true,
        includeWidgetType: true,
      );

      expect(json['id'], 'test_button');
      expect(json['description'], 'A test button');
      expect(json['capabilities'], containsAll(['tap', 'longPress']));
      expect(json['widgetType'], 'ElevatedButton');
      expect(json['bounds'], {
        'x': 10.0,
        'y': 20.0,
        'width': 100.0,
        'height': 50.0,
      });
    });

    test('toJson excludes optional fields when not requested', () {
      final node = InteractionNode(
        id: 'test',
        widgetType: 'Container',
        bounds: const Rect(0, 0, 100, 100),
      );

      final json = node.toJson();

      expect(json.containsKey('widgetType'), isFalse);
      expect(json.containsKey('bounds'), isFalse);
    });

    test('toJson includes state when requested', () {
      final node = InteractionNode(
        id: 'text_field',
        capabilities: {InteractionCapability.enterText},
      );

      final stateProvider = (String id) => {
            'text': 'Hello',
            'enabled': true,
          };

      final json = node.toJson(
        includeState: true,
        stateProvider: stateProvider,
      );

      expect(json['state'], {'text': 'Hello', 'enabled': true});
    });

    test('toJson serializes children recursively', () {
      final child = InteractionNode(
        id: 'child',
        description: 'Child node',
      );

      final parent = InteractionNode(
        id: 'parent',
        children: [child],
      );

      final json = parent.toJson();

      expect(json['children'], isA<List>());
      expect((json['children'] as List).length, 1);
      expect((json['children'] as List)[0]['id'], 'child');
    });

    test('toJson handles actions', () {
      final node = InteractionNode(
        id: 'custom_widget',
        actions: [
          InteractionAction(
            name: 'doSomething',
            description: 'Does something special',
            parameters: [
              const ActionParameter(
                name: 'value',
                type: 'int',
                description: 'The value',
              ),
            ],
            execute: (_) async {},
          ),
        ],
      );

      final json = node.toJson();

      expect(json['actions'], isA<List>());
      final actions = json['actions'] as List;
      expect(actions.length, 1);
      expect(actions[0]['name'], 'doSomething');
      expect(actions[0]['description'], 'Does something special');
      expect(actions[0]['parameters'], isA<List>());
    });
  });

  group('Rect', () {
    test('stores dimensions correctly', () {
      const rect = Rect(10, 20, 100, 50);

      expect(rect.left, 10);
      expect(rect.top, 20);
      expect(rect.width, 100);
      expect(rect.height, 50);
    });
  });
}
