/**
 * Dart VM Service Protocol types.
 * Based on: https://github.com/dart-lang/sdk/blob/main/runtime/vm/service/service.md
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface VMIsolate {
  id: string;
  name: string;
  number: string;
  isSystemIsolate: boolean;
  isolateGroupId: string;
}

export interface VMIsolateRef {
  type: 'Isolate';
  id: string;
  name: string;
  number: string;
  isSystemIsolate: boolean;
  isolateGroupId: string;
}

export interface VMResponse {
  type: string;
  [key: string]: unknown;
}

export interface ExtensionResponse {
  type: 'Success' | 'Error';
  result?: unknown;
  error?: string;
}

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
} as const;
