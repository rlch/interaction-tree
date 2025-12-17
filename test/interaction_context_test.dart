import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  group('InteractionContext', () {
    testWidgets('renders child widget', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: InteractionContext(
            description: 'Test context',
            child: Text('Child widget'),
          ),
        ),
      );

      expect(find.text('Child widget'), findsOneWidget);
    });

    testWidgets('stores description', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: InteractionContext(
            description: 'Login form section',
            child: Text('Form'),
          ),
        ),
      );

      final context = tester.element(find.byType(InteractionContext));
      final widget = context.widget as InteractionContext;

      expect(widget.description, 'Login form section');
    });

    testWidgets('InteractionContext.of finds nearest context', (tester) async {
      InteractionContext? foundContext;

      await tester.pumpWidget(
        MaterialApp(
          home: InteractionContext(
            description: 'Outer context',
            child: InteractionContext(
              description: 'Inner context',
              child: Builder(
                builder: (context) {
                  foundContext = InteractionContext.of(context);
                  return const Text('Child');
                },
              ),
            ),
          ),
        ),
      );

      expect(foundContext, isNotNull);
      expect(foundContext!.description, 'Inner context');
    });

    testWidgets('InteractionContext.of returns null when no context exists',
        (tester) async {
      InteractionContext? foundContext;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              foundContext = InteractionContext.of(context);
              return const Text('No context');
            },
          ),
        ),
      );

      expect(foundContext, isNull);
    });

    testWidgets('InteractionContext.allOf collects all ancestor descriptions',
        (tester) async {
      List<String>? allDescriptions;

      await tester.pumpWidget(
        MaterialApp(
          home: InteractionContext(
            description: 'App section',
            child: InteractionContext(
              description: 'User profile',
              child: InteractionContext(
                description: 'Edit form',
                child: Builder(
                  builder: (context) {
                    allDescriptions = InteractionContext.allOf(context);
                    return const Text('Child');
                  },
                ),
              ),
            ),
          ),
        ),
      );

      expect(allDescriptions, isNotNull);
      expect(allDescriptions!.length, 3);
      expect(allDescriptions, ['App section', 'User profile', 'Edit form']);
    });

    testWidgets('InteractionContext.allOf returns empty list when no context',
        (tester) async {
      List<String>? allDescriptions;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              allDescriptions = InteractionContext.allOf(context);
              return const Text('No context');
            },
          ),
        ),
      );

      expect(allDescriptions, isEmpty);
    });

    testWidgets('can be used with InteractionKey', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: InteractionContext(
              description: 'Profile section',
              child: Column(
                children: [
                  ElevatedButton(
                    key: const InteractionKey('submit_button'),
                    onPressed: () {},
                    child: const Text('Submit'),
                  ),
                  Container(
                    key: const InteractionKey('container'),
                    child: const Text('Content'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );

      expect(interaction('submit_button'), findsOneWidget);
      expect(interaction('container'), findsOneWidget);
    });
  });
}
