import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  group('IntegrationTestGenerator', () {
    const generator = IntegrationTestGenerator();

    test('generates basic test structure', () {
      final flow = InteractionFlow(
        name: 'Login flow',
        createdAt: DateTime(2024, 1, 15),
        steps: [],
      );

      final code = generator.generate(flow);

      expect(code, contains("import 'package:flutter_test/flutter_test.dart';"));
      expect(code, contains("import 'package:interaction_tree/interaction_tree.dart';"));
      expect(code, contains('void main()'));
      expect(code, contains("testWidgets('Login flow'"));
    });

    test('generates tap step with InteractionKey', () {
      final flow = InteractionFlow(
        name: 'Test',
        createdAt: DateTime(2024, 1, 15),
        steps: [
          InteractionStep(
            targetId: 'submit-button',
            interaction: 'tap',
            timestamp: DateTime(2024, 1, 15, 10, 30),
          ),
        ],
      );

      final code = generator.generate(flow);

      expect(code, contains("await tester.tap(find.byKey(const InteractionKey('submit-button')));"));
      expect(code, contains('await tester.pumpAndSettle()'));
    });

    test('generates enterText step', () {
      final flow = InteractionFlow(
        name: 'Test',
        createdAt: DateTime(2024, 1, 15),
        steps: [
          InteractionStep(
            targetId: 'email-field',
            interaction: 'enterText',
            arguments: {'text': 'user@example.com'},
            timestamp: DateTime(2024, 1, 15, 10, 30),
          ),
        ],
      );

      final code = generator.generate(flow);

      expect(code, contains("await tester.tap(find.byKey(const InteractionKey('email-field')));"));
      expect(code, contains("await tester.enterText(find.byKey(const InteractionKey('email-field')), 'user@example.com');"));
    });

    test('generates longPress step', () {
      final flow = InteractionFlow(
        name: 'Test',
        createdAt: DateTime(2024, 1, 15),
        steps: [
          InteractionStep(
            targetId: 'menu-button',
            interaction: 'longPress',
            timestamp: DateTime(2024, 1, 15, 10, 30),
          ),
        ],
      );

      final code = generator.generate(flow);

      expect(code, contains("await tester.longPress(find.byKey(const InteractionKey('menu-button')));"));
    });

    test('generates drag step', () {
      final flow = InteractionFlow(
        name: 'Test',
        createdAt: DateTime(2024, 1, 15),
        steps: [
          InteractionStep(
            targetId: 'slider',
            interaction: 'drag',
            arguments: {'dx': 100.0, 'dy': 0.0},
            timestamp: DateTime(2024, 1, 15, 10, 30),
          ),
        ],
      );

      final code = generator.generate(flow);

      expect(code, contains("await tester.drag(find.byKey(const InteractionKey('slider')), const Offset(100.0, 0.0));"));
    });

    test('generates step comments from description', () {
      final flow = InteractionFlow(
        name: 'Test',
        createdAt: DateTime(2024, 1, 15),
        steps: [
          InteractionStep(
            targetId: 'email-field',
            interaction: 'enterText',
            arguments: {'text': 'test'},
            timestamp: DateTime(2024, 1, 15, 10, 30),
            description: 'Enter user email',
          ),
        ],
      );

      final code = generator.generate(flow);

      expect(code, contains('// Step 1: Enter user email'));
    });

    test('generates default step comments without description', () {
      final flow = InteractionFlow(
        name: 'Test',
        createdAt: DateTime(2024, 1, 15),
        steps: [
          InteractionStep(
            targetId: 'submit-button',
            interaction: 'tap',
            timestamp: DateTime(2024, 1, 15, 10, 30),
          ),
        ],
      );

      final code = generator.generate(flow);

      expect(code, contains('// Step 1: tap on submit-button'));
    });

    test('escapes special characters in strings', () {
      final flow = InteractionFlow(
        name: "Test's flow",
        createdAt: DateTime(2024, 1, 15),
        steps: [
          InteractionStep(
            targetId: "button's-id",
            interaction: 'tap',
            timestamp: DateTime(2024, 1, 15, 10, 30),
          ),
        ],
      );

      final code = generator.generate(flow);

      expect(code, contains("testWidgets('Test\\'s flow'"));
      expect(code, contains("InteractionKey('button\\'s-id')"));
    });

    test('generates multiple steps', () {
      final flow = InteractionFlow(
        name: 'Login flow',
        createdAt: DateTime(2024, 1, 15),
        steps: [
          InteractionStep(
            targetId: 'email-field',
            interaction: 'enterText',
            arguments: {'text': 'user@example.com'},
            timestamp: DateTime(2024, 1, 15, 10, 30),
            description: 'Enter email',
          ),
          InteractionStep(
            targetId: 'password-field',
            interaction: 'enterText',
            arguments: {'text': 'secret123'},
            timestamp: DateTime(2024, 1, 15, 10, 31),
            description: 'Enter password',
          ),
          InteractionStep(
            targetId: 'submit-button',
            interaction: 'tap',
            timestamp: DateTime(2024, 1, 15, 10, 32),
            description: 'Submit form',
          ),
        ],
      );

      final code = generator.generate(flow);

      expect(code, contains('// Step 1: Enter email'));
      expect(code, contains('// Step 2: Enter password'));
      expect(code, contains('// Step 3: Submit form'));
      expect(code, contains("InteractionKey('email-field')"));
      expect(code, contains("InteractionKey('password-field')"));
      expect(code, contains("InteractionKey('submit-button')"));
    });

    group('generateReplayFunction', () {
      test('generates replay function', () {
        final flow = InteractionFlow(
          name: 'Login flow',
          description: 'Tests login functionality',
          createdAt: DateTime(2024, 1, 15),
          steps: [
            InteractionStep(
              targetId: 'button-1',
              interaction: 'tap',
              timestamp: DateTime(2024, 1, 15, 10, 30),
            ),
          ],
        );

        final code = generator.generateReplayFunction(flow);

        expect(code, contains("import 'package:interaction_tree/interaction_tree.dart';"));
        expect(code, contains('/// Replays the "Login flow" flow'));
        expect(code, contains('/// Tests login functionality'));
        expect(code, contains('Future<void> replayFlow(Interactor interactor)'));
        expect(code, contains("await interactor.tap('button-1');"));
      });

      test('uses custom function name', () {
        final flow = InteractionFlow(
          name: 'Test',
          createdAt: DateTime(2024, 1, 15),
          steps: [],
        );

        final code = generator.generateReplayFunction(
          flow,
          functionName: 'runLoginFlow',
        );

        expect(code, contains('Future<void> runLoginFlow('));
      });

      test('generates enterText in replay', () {
        final flow = InteractionFlow(
          name: 'Test',
          createdAt: DateTime(2024, 1, 15),
          steps: [
            InteractionStep(
              targetId: 'email',
              interaction: 'enterText',
              arguments: {'text': 'test@example.com'},
              timestamp: DateTime(2024, 1, 15, 10, 30),
            ),
          ],
        );

        final code = generator.generateReplayFunction(flow);

        expect(code, contains("await interactor.enterText('email', 'test@example.com');"));
      });

      test('generates drag in replay', () {
        final flow = InteractionFlow(
          name: 'Test',
          createdAt: DateTime(2024, 1, 15),
          steps: [
            InteractionStep(
              targetId: 'slider',
              interaction: 'drag',
              arguments: {'dx': 50.0, 'dy': 10.0},
              timestamp: DateTime(2024, 1, 15, 10, 30),
            ),
          ],
        );

        final code = generator.generateReplayFunction(flow);

        expect(code, contains("await interactor.drag('slider', const Offset(50.0, 10.0));"));
      });
    });
  });
}
