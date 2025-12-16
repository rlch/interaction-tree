import 'package:flutter/widgets.dart';

import 'interaction_action.dart';

mixin InteractableMixin<T extends StatefulWidget> on State<T> {
  /// The ID that links this mixin to an InteractionKey on the widget.
  /// Must match the InteractionKey.id used on the widget.
  String get interactionId;

  /// Custom actions this widget supports.
  /// Override to provide actions that can be executed by the Interactor.
  List<InteractionAction> get actions => const [];
}
