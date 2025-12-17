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
export declare const VM_EXTENSIONS: {
    readonly GET_TREE: "ext.interaction_tree.getTree";
    readonly EXECUTE: "ext.interaction_tree.execute";
    readonly GET_STATE: "ext.interaction_tree.getState";
    readonly BATCH: "ext.interaction_tree.batch";
    readonly HOT_RELOAD: "ext.flutter.reassemble";
    readonly GET_LOGS: "ext.dart.getLogs";
    readonly GET_RUNTIME_ERRORS: "ext.dart.getRuntimeErrors";
};
//# sourceMappingURL=protocol.d.ts.map