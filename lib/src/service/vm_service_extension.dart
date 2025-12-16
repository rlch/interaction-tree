import 'dart:async';
import 'dart:convert';
import 'dart:developer';
import 'dart:ui';

import '../core/interactor.dart';

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
    registerExtension('ext.interaction_tree.tap', _handleTap);
    registerExtension('ext.interaction_tree.doubleTap', _handleDoubleTap);
    registerExtension('ext.interaction_tree.longPress', _handleLongPress);
    registerExtension('ext.interaction_tree.enterText', _handleEnterText);
    registerExtension('ext.interaction_tree.drag', _handleDrag);
    registerExtension('ext.interaction_tree.scroll', _handleScroll);
  }

  Future<ServiceExtensionResponse> _handleGetTree(
    String method,
    Map<String, String> parameters,
  ) async {
    final includeBounds = parameters['includeBounds'] == 'true';
    final includeWidgetType = parameters['includeWidgetType'] == 'true';
    return _success(_interactor.getTree(
      includeBounds: includeBounds,
      includeWidgetType: includeWidgetType,
    ));
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
