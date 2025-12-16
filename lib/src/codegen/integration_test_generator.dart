import '../recording/interaction_flow.dart';

class IntegrationTestGenerator {
  const IntegrationTestGenerator();

  String generate(InteractionFlow flow) {
    final buffer = StringBuffer();

    buffer.writeln("import 'package:flutter_test/flutter_test.dart';");
    buffer.writeln("import 'package:interaction_tree/interaction_tree.dart';");
    buffer.writeln('// TODO: Add your app import here');
    buffer.writeln();
    buffer.writeln('void main() {');
    buffer.writeln("  testWidgets('${_escapeString(flow.name)}', (tester) async {");
    buffer.writeln('    // TODO: Pump your app widget');
    buffer.writeln('    // await tester.pumpWidget(MyApp());');
    buffer.writeln();

    for (var i = 0; i < flow.steps.length; i++) {
      final step = flow.steps[i];
      final stepNum = i + 1;

      if (step.description != null) {
        buffer.writeln('    // Step $stepNum: ${step.description}');
      } else {
        buffer.writeln('    // Step $stepNum: ${step.interaction} on ${step.targetId}');
      }

      switch (step.interaction) {
        case 'tap':
          buffer.writeln("    await tester.tap(find.byKey(const InteractionKey('${_escapeString(step.targetId)}')));");
        case 'doubleTap':
          buffer.writeln("    await tester.tap(find.byKey(const InteractionKey('${_escapeString(step.targetId)}')));");
          buffer.writeln('    await tester.pump(const Duration(milliseconds: 50));');
          buffer.writeln("    await tester.tap(find.byKey(const InteractionKey('${_escapeString(step.targetId)}')));");
        case 'longPress':
          buffer.writeln("    await tester.longPress(find.byKey(const InteractionKey('${_escapeString(step.targetId)}')));");
        case 'enterText':
          final text = step.arguments['text'] as String? ?? '';
          buffer.writeln("    await tester.tap(find.byKey(const InteractionKey('${_escapeString(step.targetId)}')));");
          buffer.writeln("    await tester.enterText(find.byKey(const InteractionKey('${_escapeString(step.targetId)}')), '${_escapeString(text)}');");
        case 'drag':
          final dx = step.arguments['dx'] as num? ?? 0;
          final dy = step.arguments['dy'] as num? ?? 0;
          buffer.writeln("    await tester.drag(find.byKey(const InteractionKey('${_escapeString(step.targetId)}')), const Offset($dx, $dy));");
        case 'scroll':
          final dx = step.arguments['dx'] as num? ?? 0;
          final dy = step.arguments['dy'] as num? ?? 0;
          buffer.writeln("    await tester.drag(find.byKey(const InteractionKey('${_escapeString(step.targetId)}')), const Offset($dx, $dy));");
        default:
          buffer.writeln('    // Unknown interaction: ${step.interaction}');
      }

      buffer.writeln('    await tester.pumpAndSettle();');

      if (i < flow.steps.length - 1) {
        buffer.writeln();
      }
    }

    buffer.writeln('  });');
    buffer.writeln('}');

    return buffer.toString();
  }

  String generateReplayFunction(InteractionFlow flow, {String functionName = 'replayFlow'}) {
    final buffer = StringBuffer();

    buffer.writeln("import 'package:interaction_tree/interaction_tree.dart';");
    buffer.writeln();
    buffer.writeln('/// Replays the "${_escapeString(flow.name)}" flow');
    if (flow.description != null) {
      buffer.writeln('/// ${flow.description}');
    }
    buffer.writeln('Future<void> $functionName(Interactor interactor) async {');

    for (final step in flow.steps) {
      if (step.description != null) {
        buffer.writeln('  // ${step.description}');
      }

      switch (step.interaction) {
        case 'tap':
          buffer.writeln("  await interactor.tap('${_escapeString(step.targetId)}');");
        case 'doubleTap':
          buffer.writeln("  await interactor.doubleTap('${_escapeString(step.targetId)}');");
        case 'longPress':
          buffer.writeln("  await interactor.longPress('${_escapeString(step.targetId)}');");
        case 'enterText':
          final text = step.arguments['text'] as String? ?? '';
          buffer.writeln("  await interactor.enterText('${_escapeString(step.targetId)}', '${_escapeString(text)}');");
        case 'drag':
          final dx = step.arguments['dx'] as num? ?? 0;
          final dy = step.arguments['dy'] as num? ?? 0;
          buffer.writeln("  await interactor.drag('${_escapeString(step.targetId)}', const Offset($dx, $dy));");
        case 'scroll':
          final dx = step.arguments['dx'] as num? ?? 0;
          final dy = step.arguments['dy'] as num? ?? 0;
          buffer.writeln("  await interactor.scroll('${_escapeString(step.targetId)}', const Offset($dx, $dy));");
        default:
          buffer.writeln('  // Unknown interaction: ${step.interaction}');
      }
    }

    buffer.writeln('}');

    return buffer.toString();
  }

  String _escapeString(String value) {
    return value
        .replaceAll('\\', '\\\\')
        .replaceAll("'", "\\'")
        .replaceAll('\n', '\\n')
        .replaceAll('\r', '\\r')
        .replaceAll('\t', '\\t');
  }
}
