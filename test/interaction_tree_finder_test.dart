import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  group('InteractionTreeFinder', () {
    testWidgets('finds widget by InteractionKey id', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                ElevatedButton(
                  key: const InteractionKey('login_button'),
                  onPressed: () {},
                  child: const Text('Login'),
                ),
                ElevatedButton(
                  key: const InteractionKey('signup_button'),
                  onPressed: () {},
                  child: const Text('Sign Up'),
                ),
              ],
            ),
          ),
        ),
      );

      expect(interaction('login_button'), findsOneWidget);
      expect(interaction('signup_button'), findsOneWidget);
      expect(interaction('nonexistent'), findsNothing);
    });

    testWidgets('finds nested widgets', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Container(
              key: const InteractionKey('outer'),
              child: Container(
                key: const InteractionKey('inner'),
                child: const Text('Content'),
              ),
            ),
          ),
        ),
      );

      expect(interaction('outer'), findsOneWidget);
      expect(interaction('inner'), findsOneWidget);
    });

    testWidgets('works with tester.tap', (tester) async {
      var tapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ElevatedButton(
              key: const InteractionKey('tap_me'),
              onPressed: () => tapped = true,
              child: const Text('Tap Me'),
            ),
          ),
        ),
      );

      await tester.tap(interaction('tap_me'));
      await tester.pump();

      expect(tapped, isTrue);
    });

    testWidgets('works with tester.enterText', (tester) async {
      final controller = TextEditingController();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TextField(
              key: const InteractionKey('email_field'),
              controller: controller,
            ),
          ),
        ),
      );

      await tester.enterText(interaction('email_field'), 'test@example.com');
      expect(controller.text, 'test@example.com');
    });

    testWidgets('respects skipOffstage parameter', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Offstage(
              offstage: true,
              child: Container(
                key: const InteractionKey('hidden'),
                child: const Text('Hidden'),
              ),
            ),
          ),
        ),
      );

      // Default: skip offstage widgets
      expect(interaction('hidden'), findsNothing);

      // With skipOffstage: false
      expect(interaction('hidden', skipOffstage: false), findsOneWidget);
    });

    testWidgets('description is useful for debugging', (tester) async {
      final finder = InteractionTreeFinder('my_button');
      expect(finder.description, 'InteractionKey("my_button")');
    });
  });

  group('interaction() helper', () {
    testWidgets('is equivalent to InteractionTreeFinder', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Container(
            key: const InteractionKey('test'),
            child: const Text('Test'),
          ),
        ),
      );

      expect(
        interaction('test').evaluate().single,
        equals(InteractionTreeFinder('test').evaluate().single),
      );
    });
  });
}
