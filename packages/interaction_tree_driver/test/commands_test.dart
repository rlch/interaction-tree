import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree_driver/interaction_tree_driver.dart';

void main() {
  group('GetTreeCommand', () {
    test('creates command with defaults', () {
      const cmd = GetTreeCommand();
      expect(cmd.includeBounds, isFalse);
      expect(cmd.includeWidgetType, isFalse);
      expect(cmd.includeState, isFalse);
    });

    test('creates command with options', () {
      const cmd = GetTreeCommand(
        includeBounds: true,
        includeWidgetType: true,
        includeState: true,
      );

      expect(cmd.includeBounds, isTrue);
      expect(cmd.includeWidgetType, isTrue);
      expect(cmd.includeState, isTrue);
    });

    test('has correct kind', () {
      const cmd = GetTreeCommand();
      expect(cmd.kind, 'getTree');
    });

    test('serialize produces correct map', () {
      const cmd = GetTreeCommand(
        includeBounds: true,
        includeWidgetType: false,
        includeState: true,
      );

      final serialized = cmd.serialize();
      expect(serialized['includeBounds'], 'true');
      expect(serialized['includeWidgetType'], 'false');
      expect(serialized['includeState'], 'true');
    });

    test('deserialize creates command from params', () {
      final cmd = GetTreeCommand.deserialize({
        'includeBounds': 'true',
        'includeWidgetType': 'true',
        'includeState': 'false',
      });

      expect(cmd.includeBounds, isTrue);
      expect(cmd.includeWidgetType, isTrue);
      expect(cmd.includeState, isFalse);
    });
  });

  group('GetTreeResult', () {
    test('creates result with targets', () {
      final result = GetTreeResult([
        {'id': 'node1'},
        {'id': 'node2'},
      ]);

      expect(result.targets.length, 2);
    });

    test('toJson produces correct map', () {
      final result = GetTreeResult([
        {'id': 'test'}
      ]);

      final json = result.toJson();
      expect(json['targets'], [
        {'id': 'test'}
      ]);
    });

    test('fromJson creates result', () {
      final result = GetTreeResult.fromJson({
        'targets': [
          {'id': 'node1'},
          {'id': 'node2'},
        ],
      });

      expect(result.targets.length, 2);
      expect(result.targets[0]['id'], 'node1');
    });

    test('fromResponse parses JSON string', () {
      final result = GetTreeResult.fromResponse(
        '{"targets":[{"id":"test"}]}',
      );

      expect(result.targets.length, 1);
      expect(result.targets[0]['id'], 'test');
    });
  });

  group('ExecuteActionCommand', () {
    test('creates command with required params', () {
      final cmd = ExecuteActionCommand(
        const InteractionKeyFinder('widget'),
        actionName: 'doSomething',
      );

      expect(cmd.actionName, 'doSomething');
      expect(cmd.args, isEmpty);
      expect(cmd.settle, isFalse);
    });

    test('creates command with all params', () {
      final cmd = ExecuteActionCommand(
        const InteractionKeyFinder('widget'),
        actionName: 'setCounter',
        args: {'value': 42},
        settle: true,
      );

      expect(cmd.actionName, 'setCounter');
      expect(cmd.args, {'value': 42});
      expect(cmd.settle, isTrue);
    });

    test('has correct kind', () {
      final cmd = ExecuteActionCommand(
        const InteractionKeyFinder('widget'),
        actionName: 'action',
      );
      expect(cmd.kind, 'executeAction');
    });

    test('serialize includes all fields', () {
      final cmd = ExecuteActionCommand(
        const InteractionKeyFinder('widget'),
        actionName: 'action',
        args: {'key': 'value'},
        settle: true,
      );

      final serialized = cmd.serialize();
      expect(serialized['actionName'], 'action');
      expect(serialized['args'], '{"key":"value"}');
      expect(serialized['settle'], 'true');
    });
  });

  group('ExecuteActionResult', () {
    test('creates success result', () {
      const result = ExecuteActionResult(
        success: true,
        tree: {'targets': []},
        focusedId: 'focused_widget',
      );

      expect(result.success, isTrue);
      expect(result.error, isNull);
      expect(result.tree, isNotNull);
    });

    test('creates failure result', () {
      const result = ExecuteActionResult(
        success: false,
        error: 'Action not found',
      );

      expect(result.success, isFalse);
      expect(result.error, 'Action not found');
    });

    test('toJson produces correct map', () {
      const result = ExecuteActionResult(
        success: true,
        focusedId: 'widget',
      );

      final json = result.toJson();
      expect(json['success'], isTrue);
      expect(json['focusedId'], 'widget');
    });

    test('fromJson creates result', () {
      final result = ExecuteActionResult.fromJson({
        'success': true,
        'focusedId': 'test',
      });

      expect(result.success, isTrue);
      expect(result.focusedId, 'test');
    });
  });

  group('BatchCommand', () {
    test('creates command with steps', () {
      final cmd = BatchCommand([
        const BatchStep(action: 'tap', id: 'button1'),
        const BatchStep(action: 'tap', id: 'button2'),
      ]);

      expect(cmd.steps.length, 2);
    });

    test('has correct kind', () {
      final cmd = BatchCommand([]);
      expect(cmd.kind, 'batch');
    });

    test('serialize encodes steps as JSON', () {
      final cmd = BatchCommand([
        const BatchStep(action: 'tap', id: 'button'),
      ]);

      final serialized = cmd.serialize();
      expect(serialized['steps'], contains('tap'));
      expect(serialized['steps'], contains('button'));
    });

    test('deserialize parses steps from JSON', () {
      final cmd = BatchCommand.deserialize({
        'steps': jsonEncode([
          {'action': 'tap', 'id': 'btn1'},
          {'action': 'enterText', 'id': 'field', 'text': 'hello'},
        ]),
      });

      expect(cmd.steps.length, 2);
      expect(cmd.steps[0].action, 'tap');
      expect(cmd.steps[1].text, 'hello');
    });

    test('deserialize throws on missing steps', () {
      expect(
        () => BatchCommand.deserialize({}),
        throwsA(isA<ArgumentError>()),
      );
    });
  });

  group('BatchStep', () {
    test('creates step with action only', () {
      const step = BatchStep(action: 'tap');
      expect(step.action, 'tap');
      expect(step.id, isNull);
    });

    test('creates step with all fields', () {
      const step = BatchStep(
        action: 'enterText',
        id: 'email_field',
        text: 'test@example.com',
        dx: 10.0,
        dy: 20.0,
        alignment: 0.5,
        actionName: 'custom',
        args: {'key': 'value'},
        condition: 'exists',
        timeoutMs: 5000,
        settle: true,
      );

      expect(step.action, 'enterText');
      expect(step.id, 'email_field');
      expect(step.text, 'test@example.com');
      expect(step.dx, 10.0);
      expect(step.dy, 20.0);
      expect(step.alignment, 0.5);
      expect(step.actionName, 'custom');
      expect(step.args, {'key': 'value'});
      expect(step.condition, 'exists');
      expect(step.timeoutMs, 5000);
      expect(step.settle, isTrue);
    });

    test('toJson includes non-null fields only', () {
      const step = BatchStep(
        action: 'tap',
        id: 'button',
        settle: true,
      );

      final json = step.toJson();
      expect(json['action'], 'tap');
      expect(json['id'], 'button');
      expect(json['settle'], isTrue);
      expect(json.containsKey('text'), isFalse);
      expect(json.containsKey('dx'), isFalse);
    });

    test('fromJson creates step', () {
      final step = BatchStep.fromJson({
        'action': 'drag',
        'id': 'slider',
        'dx': 100.0,
        'dy': 0.0,
      });

      expect(step.action, 'drag');
      expect(step.id, 'slider');
      expect(step.dx, 100.0);
      expect(step.dy, 0.0);
    });
  });

  group('BatchResult', () {
    test('creates success result', () {
      final result = BatchResult(
        success: true,
        results: [
          const BatchStepResult(step: 0, success: true, durationMs: 10),
          const BatchStepResult(step: 1, success: true, durationMs: 20),
        ],
        durationMs: 30,
      );

      expect(result.success, isTrue);
      expect(result.results.length, 2);
      expect(result.durationMs, 30);
    });

    test('creates failure result with error', () {
      final result = BatchResult(
        success: false,
        results: [
          const BatchStepResult(step: 0, success: true),
          const BatchStepResult(
            step: 1,
            success: false,
            error: 'Target not found',
          ),
        ],
      );

      expect(result.success, isFalse);
      expect(result.results[1].error, 'Target not found');
    });

    test('toJson produces correct map', () {
      final result = BatchResult(
        success: true,
        results: [
          const BatchStepResult(step: 0, success: true),
        ],
        tree: {'targets': []},
        focusedId: 'widget',
      );

      final json = result.toJson();
      expect(json['success'], isTrue);
      expect(json['results'], isA<List>());
      expect(json['tree'], isA<Map>());
      expect(json['focusedId'], 'widget');
    });

    test('fromJson creates result', () {
      final result = BatchResult.fromJson({
        'success': true,
        'results': [
          {'step': 0, 'success': true},
        ],
        'durationMs': 100,
      });

      expect(result.success, isTrue);
      expect(result.results.length, 1);
      expect(result.durationMs, 100);
    });
  });

  group('BatchStepResult', () {
    test('creates success result', () {
      const result = BatchStepResult(
        step: 0,
        success: true,
        durationMs: 15,
      );

      expect(result.step, 0);
      expect(result.success, isTrue);
      expect(result.durationMs, 15);
      expect(result.error, isNull);
    });

    test('creates failure result', () {
      const result = BatchStepResult(
        step: 2,
        success: false,
        error: 'Widget not found',
      );

      expect(result.step, 2);
      expect(result.success, isFalse);
      expect(result.error, 'Widget not found');
    });

    test('toJson produces correct map', () {
      const result = BatchStepResult(
        step: 1,
        success: true,
        durationMs: 50,
      );

      final json = result.toJson();
      expect(json['step'], 1);
      expect(json['success'], isTrue);
      expect(json['durationMs'], 50);
    });

    test('fromJson creates result', () {
      final result = BatchStepResult.fromJson({
        'step': 3,
        'success': false,
        'error': 'Timeout',
        'durationMs': 10000,
      });

      expect(result.step, 3);
      expect(result.success, isFalse);
      expect(result.error, 'Timeout');
      expect(result.durationMs, 10000);
    });
  });
}
