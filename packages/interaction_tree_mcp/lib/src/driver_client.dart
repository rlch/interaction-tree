import 'dart:async';
import 'dart:convert';

import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

/// Client for connecting to Flutter apps and invoking Flutter Driver extension commands.
class DriverClient {
  DriverClient._(this._vmService, this._isolateId);

  final VmService _vmService;
  final String _isolateId;

  static Future<DriverClient> connect(String uri) async {
    final vmService = await vmServiceConnectUri(uri);
    final vm = await vmService.getVM();
    final isolateId = vm.isolates?.first.id;
    if (isolateId == null) {
      throw StateError('No isolates found');
    }
    return DriverClient._(vmService, isolateId);
  }

  Future<void> disconnect() async {
    await _vmService.dispose();
  }

  Future<Map<String, Object?>> getTree({
    bool includeBounds = false,
    bool includeWidgetType = false,
    bool includeState = false,
  }) async {
    final result = await _callExtension('getTree', {
      'includeBounds': includeBounds.toString(),
      'includeWidgetType': includeWidgetType.toString(),
      'includeState': includeState.toString(),
    });
    return result;
  }

  Future<Map<String, Object?>> tap(String id) async {
    return _callFinderExtension('tap', id);
  }

  Future<Map<String, Object?>> doubleTap(String id) async {
    return _callFinderExtension('tap', id)
        .then((_) => Future.delayed(const Duration(milliseconds: 50)))
        .then((_) => _callFinderExtension('tap', id));
  }

  Future<Map<String, Object?>> longPress(String id) async {
    return _callFinderExtension('longPress', id);
  }

  Future<Map<String, Object?>> enterText(String id, String text) async {
    await _callFinderExtension('tap', id);
    return _callExtension('enterText', {'text': text});
  }

  Future<Map<String, Object?>> clearText(String id) async {
    await _callFinderExtension('tap', id);
    return _callExtension('enterText', {'text': ''});
  }

  Future<Map<String, Object?>> drag(
    String id, {
    required double dx,
    required double dy,
  }) async {
    return _callExtension('scroll', {
      'finderType': 'InteractionKeyFinder',
      'id': id,
      'dx': dx.toString(),
      'dy': dy.toString(),
      'duration': '100000',
      'frequency': '60',
    });
  }

  Future<Map<String, Object?>> scroll(
    String id, {
    required double dx,
    required double dy,
  }) async {
    return drag(id, dx: dx, dy: dy);
  }

  Future<Map<String, Object?>> scrollIntoView(
    String id, {
    double alignment = 0.0,
  }) async {
    return _callExtension('scrollIntoView', {
      'finderType': 'InteractionKeyFinder',
      'id': id,
      'alignment': alignment.toString(),
    });
  }

  Future<Map<String, Object?>> waitFor(
    String id, {
    String condition = 'exists',
    int timeoutMs = 10000,
  }) async {
    final command = switch (condition) {
      'notExists' => 'waitForAbsent',
      'visible' => 'waitFor',
      'notVisible' => 'waitForAbsent',
      _ => 'waitFor',
    };
    return _callExtension(command, {
      'finderType': 'InteractionKeyFinder',
      'id': id,
      'timeout': (timeoutMs * 1000).toString(),
    });
  }

  Future<Map<String, Object?>> getState(String id) async {
    final tree = await getTree(includeState: true);
    final targets = tree['targets'] as List<dynamic>?;
    if (targets == null) return {};

    for (final target in targets) {
      if (target is Map<String, dynamic> && target['id'] == id) {
        return target['state'] as Map<String, Object?>? ?? {};
      }
    }
    return {};
  }

  Future<Map<String, Object?>> executeAction(
    String id,
    String actionName, {
    Map<String, dynamic> args = const {},
    bool settle = false,
  }) async {
    return _callExtension('executeAction', {
      'finderType': 'InteractionKeyFinder',
      'id': id,
      'actionName': actionName,
      'args': jsonEncode(args),
      'settle': settle.toString(),
    });
  }

  Future<Map<String, Object?>> batch(List<Map<String, Object?>> steps) async {
    return _callExtension('batch', {'steps': jsonEncode(steps)});
  }

  Future<Map<String, Object?>> _callFinderExtension(
    String command,
    String id,
  ) async {
    return _callExtension(command, {
      'finderType': 'InteractionKeyFinder',
      'id': id,
    });
  }

  Future<Map<String, Object?>> _callExtension(
    String command,
    Map<String, String> params,
  ) async {
    try {
      final response = await _vmService.callServiceExtension(
        'ext.flutter.driver',
        isolateId: _isolateId,
        args: {'command': command, ...params},
      );

      final json = response.json;
      if (json == null) return {};

      if (json['isError'] == true) {
        throw StateError(json['response'] as String? ?? 'Unknown error');
      }

      final responseStr = json['response'] as String?;
      if (responseStr == null) return {};

      return jsonDecode(responseStr) as Map<String, Object?>;
    } on RPCError catch (e) {
      throw StateError('RPC error: ${e.message}');
    }
  }
}
