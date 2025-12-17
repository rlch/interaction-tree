/**
 * Dart VM Service Protocol types.
 * Based on: https://github.com/dart-lang/sdk/blob/main/runtime/vm/service/service.md
 */
/**
 * VM Service extension methods we care about.
 */
export const VM_EXTENSIONS = {
    // Interaction Tree extensions
    GET_TREE: 'ext.interaction_tree.getTree',
    EXECUTE: 'ext.interaction_tree.execute',
    GET_STATE: 'ext.interaction_tree.getState',
    BATCH: 'ext.interaction_tree.batch',
    // Flutter extensions
    HOT_RELOAD: 'ext.flutter.reassemble',
    // Dart Tooling Daemon extensions (if connected via DTD)
    GET_LOGS: 'ext.dart.getLogs',
    GET_RUNTIME_ERRORS: 'ext.dart.getRuntimeErrors',
};
//# sourceMappingURL=protocol.js.map