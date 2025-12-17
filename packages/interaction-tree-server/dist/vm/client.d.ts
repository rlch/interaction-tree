/**
 * VM Service client for connecting to Flutter apps.
 * Implements JSON-RPC 2.0 over WebSocket.
 */
import type { InteractionTarget, InteractionResult, BatchStep, BatchResult, GetTreeOptions } from '../types/interaction-tree.js';
import type { LogEntry, RuntimeError, HotReloadResult, AppStatus } from '../types/dart-tooling.js';
export declare class VMServiceClient {
    private ws;
    private requestId;
    private pending;
    private isolateId;
    private uri;
    private onCloseCallbacks;
    get isConnected(): boolean;
    get connectionUri(): string | null;
    /**
     * Connect to a Flutter app via VM service WebSocket.
     */
    connect(uri: string): Promise<void>;
    /**
     * Disconnect from the VM service.
     */
    disconnect(): Promise<void>;
    /**
     * Register a callback for when the connection closes.
     */
    onClose(callback: () => void): void;
    getTree(options?: GetTreeOptions): Promise<InteractionTarget[]>;
    execute(id: string, interaction: string, args?: Record<string, unknown>): Promise<InteractionResult>;
    tap(id: string): Promise<InteractionResult>;
    doubleTap(id: string): Promise<InteractionResult>;
    longPress(id: string): Promise<InteractionResult>;
    enterText(id: string, text: string): Promise<InteractionResult>;
    clearText(id: string): Promise<InteractionResult>;
    scroll(id: string, dx: number, dy: number): Promise<InteractionResult>;
    drag(id: string, dx: number, dy: number): Promise<InteractionResult>;
    scrollIntoView(id: string, alignment?: number): Promise<InteractionResult>;
    waitFor(id: string, condition?: 'exists' | 'notExists' | 'visible' | 'notVisible', timeoutMs?: number): Promise<InteractionResult>;
    getState(id: string): Promise<Record<string, unknown>>;
    executeAction(id: string, actionName: string, args?: Record<string, unknown>): Promise<InteractionResult>;
    batch(steps: BatchStep[]): Promise<BatchResult>;
    hotReload(): Promise<HotReloadResult>;
    hotRestart(): Promise<HotReloadResult>;
    getLogs(_since?: string): Promise<LogEntry[]>;
    getRuntimeErrors(): Promise<RuntimeError[]>;
    getStatus(): Promise<AppStatus>;
    private findMainIsolate;
    private callMethod;
    private callExtension;
    private handleMessage;
    private handleClose;
}
//# sourceMappingURL=client.d.ts.map