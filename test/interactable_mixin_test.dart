import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

class TestWidget extends StatefulWidget {
  const TestWidget({super.key});

  @override
  State<TestWidget> createState() => _TestWidgetState();
}

class _TestWidgetState extends State<TestWidget> with InteractableMixin {
  int _counter = 0;

  @override
  String get interactionId => 'test_widget';

  @override
  List<InteractionAction> get actions => [
        InteractionAction(
          name: 'increment',
          description: 'Increment the counter',
          execute: (_) async {
            setState(() => _counter++);
          },
        ),
        InteractionAction(
          name: 'setCounter',
          description: 'Set the counter to a specific value',
          parameters: [
            const ActionParameter(
              name: 'value',
              type: 'int',
              description: 'The value to set',
            ),
          ],
          execute: (args) async {
            setState(() => _counter = args['value'] as int);
          },
        ),
      ];

  @override
  Widget build(BuildContext context) {
    return Text('Counter: $_counter');
  }
}

void main() {
  group('InteractableMixin', () {
    testWidgets('provides interactionId', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TestWidget(key: InteractionKey('test_widget')),
          ),
        ),
      );

      final element = tester.element(find.byType(TestWidget));
      final state = (element as StatefulElement).state as InteractableMixin;

      expect(state.interactionId, 'test_widget');
    });

    testWidgets('provides actions list', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TestWidget(key: InteractionKey('test_widget')),
          ),
        ),
      );

      final element = tester.element(find.byType(TestWidget));
      final state = (element as StatefulElement).state as InteractableMixin;

      expect(state.actions.length, 2);
      expect(state.actions[0].name, 'increment');
      expect(state.actions[1].name, 'setCounter');
    });

    testWidgets('actions can be executed', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TestWidget(key: InteractionKey('test_widget')),
          ),
        ),
      );

      expect(find.text('Counter: 0'), findsOneWidget);

      final element = tester.element(find.byType(TestWidget));
      final state = (element as StatefulElement).state as InteractableMixin;

      await state.actions[0].execute({});
      await tester.pump();

      expect(find.text('Counter: 1'), findsOneWidget);
    });

    testWidgets('actions can receive parameters', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: TestWidget(key: InteractionKey('test_widget')),
          ),
        ),
      );

      final element = tester.element(find.byType(TestWidget));
      final state = (element as StatefulElement).state as InteractableMixin;

      await state.actions[1].execute({'value': 42});
      await tester.pump();

      expect(find.text('Counter: 42'), findsOneWidget);
    });
  });

  group('InteractionAction', () {
    test('toJson produces correct output', () {
      final action = InteractionAction(
        name: 'testAction',
        description: 'A test action',
        parameters: [
          const ActionParameter(
            name: 'param1',
            type: 'string',
            description: 'First param',
          ),
        ],
        execute: (_) async {},
      );

      final json = action.toJson();

      expect(json['name'], 'testAction');
      expect(json['description'], 'A test action');
      expect(json['parameters'], isA<List>());
      expect((json['parameters'] as List)[0]['name'], 'param1');
    });

    test('toString returns readable format', () {
      final action = InteractionAction(
        name: 'myAction',
        description: 'Description',
        execute: (_) async {},
      );

      expect(action.toString(), 'InteractionAction(myAction)');
    });
  });

  group('ActionParameter', () {
    test('creates with all fields', () {
      const param = ActionParameter(
        name: 'value',
        type: 'int',
        description: 'The value',
        required: false,
        defaultValue: 10,
      );

      expect(param.name, 'value');
      expect(param.type, 'int');
      expect(param.description, 'The value');
      expect(param.required, isFalse);
      expect(param.defaultValue, 10);
    });

    test('toJson produces correct output', () {
      const param = ActionParameter(
        name: 'text',
        type: 'string',
        description: 'Text input',
        required: true,
        defaultValue: 'default',
      );

      final json = param.toJson();

      expect(json['name'], 'text');
      expect(json['type'], 'string');
      expect(json['description'], 'Text input');
      expect(json['required'], isTrue);
      expect(json['defaultValue'], 'default');
    });

    test('equality is based on name and type', () {
      const param1 = ActionParameter(
        name: 'value',
        type: 'int',
        description: 'Desc 1',
      );
      const param2 = ActionParameter(
        name: 'value',
        type: 'int',
        description: 'Desc 2',
      );
      const param3 = ActionParameter(
        name: 'value',
        type: 'string',
        description: 'Desc 1',
      );

      expect(param1, equals(param2));
      expect(param1, isNot(equals(param3)));
    });

    test('toString returns readable format', () {
      const param = ActionParameter(
        name: 'count',
        type: 'int',
        description: 'Count',
      );

      expect(param.toString(), 'ActionParameter(count: int)');
    });
  });
}
