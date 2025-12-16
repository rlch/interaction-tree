import 'dart:async';
import 'dart:convert';
import 'dart:developer';
import 'dart:ui';

import '../core/interactor.dart' show Interactor, WaitCondition;

class InteractionService {
  InteractionService._();

  static InteractionService? _instance;
  static bool _registered = false;

  static InteractionService register() {
    _instance ??= InteractionService._();
    _instance!._registerExtensions();
    return _instance!;
  }

  static InteractionService? get instance => _instance;

  Interactor get _interactor => Interactor.instance;

  void _registerExtensions() {
    if (_registered) return;
    _registered = true;

    registerExtension('ext.interaction_tree.getTree', _handleGetTree);
    registerExtension('ext.interaction_tree.getState', _handleGetState);
    registerExtension('ext.interaction_tree.tap', _handleTap);
    registerExtension('ext.interaction_tree.doubleTap', _handleDoubleTap);
    registerExtension('ext.interaction_tree.longPress', _handleLongPress);
    registerExtension('ext.interaction_tree.enterText', _handleEnterText);
    registerExtension('ext.interaction_tree.clearText', _handleClearText);
    registerExtension('ext.interaction_tree.drag', _handleDrag);
    registerExtension('ext.interaction_tree.scroll', _handleScroll);
    registerExtension('ext.interaction_tree.scrollIntoView', _handleScrollIntoView);
    registerExtension('ext.interaction_tree.waitFor', _handleWaitFor);
    registerExtension('ext.interaction_tree.batch', _handleBatch);
    registerExtension('ext.interaction_tree.executeAction', _handleExecuteAction);
  }

  Future<ServiceExtensionResponse> _handleGetTree(
    String method,
    Map<String, String> parameters,
  ) async {
    final includeBounds = parameters['includeBounds'] == 'true';
    final includeWidgetType = parameters['includeWidgetType'] == 'true';
    final includeState = parameters['includeState'] == 'true';
    return _success(_interactor.getTree(
      includeBounds: includeBounds,
      includeWidgetType: includeWidgetType,
      includeState: includeState,
    ));
  }

  Future<ServiceExtensionResponse> _handleGetState(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];
    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }
    return _success(_interactor.getState(id));
  }

  Future<ServiceExtensionResponse> _handleTap(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];
    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }

    final settle = parameters['settle'] == 'true';
    final result = await _interactor.tap(id, settle: settle);
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleDoubleTap(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];
    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }

    final settle = parameters['settle'] == 'true';
    final result = await _interactor.doubleTap(id, settle: settle);
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleLongPress(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];
    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }

    final settle = parameters['settle'] == 'true';
    final result = await _interactor.longPress(id, settle: settle);
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleEnterText(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];
    final text = parameters['text'];

    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }
    if (text == null) {
      return _error('Missing required parameter: text');
    }

    final settle = parameters['settle'] == 'true';
    final result = await _interactor.enterText(id, text, settle: settle);
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleDrag(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];
    final dxStr = parameters['dx'];
    final dyStr = parameters['dy'];

    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }

    final dx = double.tryParse(dxStr ?? '') ?? 0.0;
    final dy = double.tryParse(dyStr ?? '') ?? 0.0;

    final settle = parameters['settle'] == 'true';
    final result = await _interactor.drag(id, Offset(dx, dy), settle: settle);
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleScroll(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];
    final dxStr = parameters['dx'];
    final dyStr = parameters['dy'];

    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }

    final dx = double.tryParse(dxStr ?? '') ?? 0.0;
    final dy = double.tryParse(dyStr ?? '') ?? 0.0;

    final settle = parameters['settle'] == 'true';
    final result = await _interactor.scroll(id, Offset(dx, dy), settle: settle);
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleClearText(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];

    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }

    final settle = parameters['settle'] == 'true';
    final result = await _interactor.clearText(id, settle: settle);
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleScrollIntoView(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];

    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }

    final alignmentStr = parameters['alignment'];
    final alignment = double.tryParse(alignmentStr ?? '') ?? 0.0;
    final settle = parameters['settle'] == 'true';

    final result = await _interactor.scrollIntoView(
      id,
      alignment: alignment,
      settle: settle,
    );
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleWaitFor(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];

    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }

    final conditionStr = parameters['condition'] ?? 'exists';
    final condition = switch (conditionStr) {
      'notExists' => WaitCondition.notExists,
      'visible' => WaitCondition.visible,
      'notVisible' => WaitCondition.notVisible,
      _ => WaitCondition.exists,
    };

    final timeoutMs = int.tryParse(parameters['timeoutMs'] ?? '') ?? 10000;

    final result = await _interactor.waitFor(
      id,
      condition: condition,
      timeout: Duration(milliseconds: timeoutMs),
    );
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleBatch(
    String method,
    Map<String, String> parameters,
  ) async {
    final stepsJson = parameters['steps'];
    if (stepsJson == null || stepsJson.isEmpty) {
      return _error('Missing required parameter: steps');
    }

    List<Map<String, Object?>> steps;
    try {
      final decoded = jsonDecode(stepsJson);
      if (decoded is! List) {
        return _error('steps must be a JSON array');
      }
      steps = decoded.cast<Map<String, Object?>>();
    } catch (e) {
      return _error('Invalid JSON in steps: $e');
    }

    final settle = parameters['settle'] == 'true';
    final result = await _interactor.batch(steps, settle: settle);
    return _success(result.toJson());
  }

  Future<ServiceExtensionResponse> _handleExecuteAction(
    String method,
    Map<String, String> parameters,
  ) async {
    final id = parameters['id'];
    final actionName = parameters['actionName'];

    if (id == null || id.isEmpty) {
      return _error('Missing required parameter: id');
    }
    if (actionName == null || actionName.isEmpty) {
      return _error('Missing required parameter: actionName');
    }

    Map<String, dynamic> args = {};
    final argsJson = parameters['args'];
    if (argsJson != null && argsJson.isNotEmpty) {
      try {
        final decoded = jsonDecode(argsJson);
        if (decoded is Map<String, dynamic>) {
          args = decoded;
        }
      } catch (e) {
        return _error('Invalid JSON in args: $e');
      }
    }

    final settle = parameters['settle'] == 'true';
    final result = await _interactor.executeAction(
      id,
      actionName,
      args: args,
      settle: settle,
    );
    return _success(result.toJson());
  }

  ServiceExtensionResponse _success(Map<String, Object?> data) {
    return ServiceExtensionResponse.result(jsonEncode(data));
  }

  ServiceExtensionResponse _error(String message) {
    return ServiceExtensionResponse.error(
      ServiceExtensionResponse.extensionError,
      message,
    );
  }

  void dispose() {
    if (_instance == this) {
      _instance = null;
    }
  }
}
