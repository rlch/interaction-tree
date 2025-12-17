import 'dart:async';

import 'package:flutter/foundation.dart';

/// Captured diagnostics from a code execution window.
class CapturedDiagnostics {
  const CapturedDiagnostics({
    this.logs = const [],
    this.errors = const [],
    this.warnings = const [],
  });

  static const empty = CapturedDiagnostics();

  final List<String> logs;
  final List<CapturedError> errors;
  final List<String> warnings;

  bool get isEmpty => logs.isEmpty && errors.isEmpty && warnings.isEmpty;
  bool get isNotEmpty => !isEmpty;
  bool get hasErrors => errors.isNotEmpty;

  Map<String, Object?> toJson() => {
        if (logs.isNotEmpty) 'logs': logs,
        if (errors.isNotEmpty) 'errors': errors.map((e) => e.toJson()).toList(),
        if (warnings.isNotEmpty) 'warnings': warnings,
      };
}

class CapturedError {
  const CapturedError({
    required this.message,
    this.stackTrace,
  });

  final String message;
  final String? stackTrace;

  Map<String, Object?> toJson() => {
        'message': message,
        if (stackTrace != null) 'stackTrace': stackTrace,
      };
}

/// Collects diagnostics (logs, errors, warnings) during code execution.
///
/// Uses Zones to intercept print() calls and FlutterError.onError to capture
/// framework errors that occur during the execution window.
class DiagnosticCollector {
  DiagnosticCollector._();

  /// Run an async action and capture all diagnostics that occur during execution.
  ///
  /// Returns a tuple of (result, diagnostics).
  static Future<(T, CapturedDiagnostics)> run<T>(
    Future<T> Function() action,
  ) async {
    final logs = <String>[];
    final errors = <CapturedError>[];
    final warnings = <String>[];

    // Save original error handler
    final originalOnError = FlutterError.onError;

    // Install our error handler
    FlutterError.onError = (details) {
      errors.add(CapturedError(
        message: details.exceptionAsString(),
        stackTrace: details.stack?.toString(),
      ));

      // Also add to warnings if it's a non-fatal error
      if (details.silent) {
        warnings.add(details.exceptionAsString());
      }
    };

    try {
      // Run in a guarded zone that captures print output and uncaught errors
      T? result;
      Object? caughtError;
      StackTrace? caughtStack;

      await runZonedGuarded(
        () async {
          result = await runZoned(
            action,
            zoneSpecification: ZoneSpecification(
              print: (self, parent, zone, line) {
                logs.add(line);
                // Still print to console for debugging
                parent.print(zone, line);
              },
            ),
          );
        },
        (error, stackTrace) {
          errors.add(CapturedError(
            message: error.toString(),
            stackTrace: stackTrace.toString(),
          ));
          caughtError = error;
          caughtStack = stackTrace;
        },
      );

      // If there was an uncaught error, rethrow it
      if (caughtError != null) {
        Error.throwWithStackTrace(caughtError!, caughtStack!);
      }

      return (
        result as T,
        CapturedDiagnostics(
          logs: logs,
          errors: errors,
          warnings: warnings,
        ),
      );
    } finally {
      // Restore original error handler
      FlutterError.onError = originalOnError;
    }
  }

  /// Run a synchronous action and capture diagnostics.
  static (T, CapturedDiagnostics) runSync<T>(T Function() action) {
    final logs = <String>[];
    final errors = <CapturedError>[];
    final warnings = <String>[];

    final originalOnError = FlutterError.onError;

    FlutterError.onError = (details) {
      errors.add(CapturedError(
        message: details.exceptionAsString(),
        stackTrace: details.stack?.toString(),
      ));

      if (details.silent) {
        warnings.add(details.exceptionAsString());
      }
    };

    try {
      final result = runZoned(
        action,
        zoneSpecification: ZoneSpecification(
          print: (self, parent, zone, line) {
            logs.add(line);
            parent.print(zone, line);
          },
        ),
      );

      return (
        result,
        CapturedDiagnostics(
          logs: logs,
          errors: errors,
          warnings: warnings,
        ),
      );
    } finally {
      FlutterError.onError = originalOnError;
    }
  }
}
