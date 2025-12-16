import 'dart:ui' show Offset;

import '../core/interactor.dart';
import '../core/interaction_result.dart';
import 'interaction_flow.dart';
import 'interaction_step.dart';

class InteractionRecorder {
  InteractionRecorder();

  final Interactor _interactor = Interactor.instance;

  bool _isRecording = false;
  String? _flowName;
  String? _flowDescription;
  DateTime? _startedAt;
  final List<InteractionStep> _steps = [];

  bool get isRecording => _isRecording;
  int get stepCount => _steps.length;

  void startRecording({
    required String name,
    String? description,
  }) {
    if (_isRecording) {
      throw StateError('Recording already in progress');
    }
    _isRecording = true;
    _flowName = name;
    _flowDescription = description;
    _startedAt = DateTime.now();
    _steps.clear();
  }

  void stopRecording() {
    if (!_isRecording) {
      throw StateError('No recording in progress');
    }
    _isRecording = false;
  }

  InteractionFlow? getFlow() {
    if (_flowName == null || _startedAt == null) {
      return null;
    }
    return InteractionFlow(
      name: _flowName!,
      description: _flowDescription,
      steps: List.unmodifiable(_steps),
      createdAt: _startedAt!,
    );
  }

  void clear() {
    _isRecording = false;
    _flowName = null;
    _flowDescription = null;
    _startedAt = null;
    _steps.clear();
  }

  Future<InteractionResult> tap(String id, {String? stepDescription}) async {
    final result = await _interactor.tap(id);
    _recordStep('tap', id, {}, result, stepDescription);
    return result;
  }

  Future<InteractionResult> doubleTap(String id, {String? stepDescription}) async {
    final result = await _interactor.doubleTap(id);
    _recordStep('doubleTap', id, {}, result, stepDescription);
    return result;
  }

  Future<InteractionResult> longPress(String id, {String? stepDescription}) async {
    final result = await _interactor.longPress(id);
    _recordStep('longPress', id, {}, result, stepDescription);
    return result;
  }

  Future<InteractionResult> enterText(
    String id,
    String text, {
    String? stepDescription,
  }) async {
    final result = await _interactor.enterText(id, text);
    _recordStep('enterText', id, {'text': text}, result, stepDescription);
    return result;
  }

  Future<InteractionResult> drag(
    String id,
    double dx,
    double dy, {
    String? stepDescription,
  }) async {
    final result = await _interactor.drag(id, Offset(dx, dy));
    _recordStep('drag', id, {'dx': dx, 'dy': dy}, result, stepDescription);
    return result;
  }

  Future<InteractionResult> scroll(
    String id,
    double dx,
    double dy, {
    String? stepDescription,
  }) async {
    final result = await _interactor.scroll(id, Offset(dx, dy));
    _recordStep('scroll', id, {'dx': dx, 'dy': dy}, result, stepDescription);
    return result;
  }

  void _recordStep(
    String interaction,
    String targetId,
    Map<String, Object?> arguments,
    InteractionResult result,
    String? description,
  ) {
    if (_isRecording && result is InteractionSuccess) {
      _steps.add(InteractionStep(
        targetId: targetId,
        interaction: interaction,
        arguments: arguments,
        timestamp: DateTime.now(),
        description: description,
      ));
    }
  }
}
