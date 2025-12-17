import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:interaction_tree/interaction_tree.dart';

void main() {
  group('CapturedDiagnostics', () {
    test('empty diagnostics', () {
      const diagnostics = CapturedDiagnostics.empty;

      expect(diagnostics.isEmpty, isTrue);
      expect(diagnostics.isNotEmpty, isFalse);
      expect(diagnostics.hasErrors, isFalse);
      expect(diagnostics.logs, isEmpty);
      expect(diagnostics.errors, isEmpty);
      expect(diagnostics.warnings, isEmpty);
    });

    test('diagnostics with logs', () {
      const diagnostics = CapturedDiagnostics(
        logs: ['Log 1', 'Log 2'],
      );

      expect(diagnostics.isEmpty, isFalse);
      expect(diagnostics.logs, ['Log 1', 'Log 2']);
    });

    test('diagnostics with errors', () {
      const diagnostics = CapturedDiagnostics(
        errors: [
          CapturedError(message: 'Error 1'),
          CapturedError(message: 'Error 2', stackTrace: 'stack...'),
        ],
      );

      expect(diagnostics.hasErrors, isTrue);
      expect(diagnostics.errors.length, 2);
    });

    test('toJson produces correct output', () {
      const diagnostics = CapturedDiagnostics(
        logs: ['Log message'],
        errors: [CapturedError(message: 'Error')],
        warnings: ['Warning'],
      );

      final json = diagnostics.toJson();

      expect(json['logs'], ['Log message']);
      expect(json['errors'], isA<List>());
      expect(json['warnings'], ['Warning']);
    });

    test('toJson excludes empty lists', () {
      const diagnostics = CapturedDiagnostics(logs: ['Log']);
      final json = diagnostics.toJson();

      expect(json.containsKey('logs'), isTrue);
      expect(json.containsKey('errors'), isFalse);
      expect(json.containsKey('warnings'), isFalse);
    });
  });

  group('CapturedError', () {
    test('creates error with message only', () {
      const error = CapturedError(message: 'Something went wrong');

      expect(error.message, 'Something went wrong');
      expect(error.stackTrace, isNull);
    });

    test('creates error with stack trace', () {
      const error = CapturedError(
        message: 'Error',
        stackTrace: 'at line 42',
      );

      expect(error.message, 'Error');
      expect(error.stackTrace, 'at line 42');
    });

    test('toJson produces correct output', () {
      const error = CapturedError(
        message: 'Error message',
        stackTrace: 'stack trace',
      );

      final json = error.toJson();

      expect(json['message'], 'Error message');
      expect(json['stackTrace'], 'stack trace');
    });

    test('toJson excludes null stack trace', () {
      const error = CapturedError(message: 'Error');
      final json = error.toJson();

      expect(json.containsKey('message'), isTrue);
      expect(json.containsKey('stackTrace'), isFalse);
    });
  });

  group('DiagnosticCollector', () {
    test('captures print statements', () async {
      final (result, diagnostics) = await DiagnosticCollector.run(() async {
        print('Hello from action');
        print('Another log');
        return 42;
      });

      expect(result, 42);
      expect(diagnostics.logs, contains('Hello from action'));
      expect(diagnostics.logs, contains('Another log'));
    });

    test('captures Flutter errors', () async {
      final originalOnError = FlutterError.onError;

      try {
        final (_, diagnostics) = await DiagnosticCollector.run(() async {
          FlutterError.reportError(FlutterErrorDetails(
            exception: Exception('Test error'),
            library: 'test',
          ));
        });

        expect(diagnostics.hasErrors, isTrue);
        expect(
          diagnostics.errors.any((e) => e.message.contains('Test error')),
          isTrue,
        );
      } finally {
        FlutterError.onError = originalOnError;
      }
    });

    test('returns result on success', () async {
      final (result, _) = await DiagnosticCollector.run(() async {
        return 'success';
      });

      expect(result, 'success');
    });

    test('runSync captures print statements', () {
      final (result, diagnostics) = DiagnosticCollector.runSync(() {
        print('Sync log');
        return 123;
      });

      expect(result, 123);
      expect(diagnostics.logs, contains('Sync log'));
    });

    test('runSync handles Flutter errors', () {
      final originalOnError = FlutterError.onError;

      try {
        final (_, diagnostics) = DiagnosticCollector.runSync(() {
          FlutterError.reportError(FlutterErrorDetails(
            exception: Exception('Sync error'),
            library: 'test',
          ));
          return 0;
        });

        expect(diagnostics.hasErrors, isTrue);
      } finally {
        FlutterError.onError = originalOnError;
      }
    });
  });
}
