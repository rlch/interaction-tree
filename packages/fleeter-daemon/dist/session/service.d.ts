/**
 * SessionService - unified service for all session operations.
 * One instance per active session, wrapping VMServiceClient, SessionManager, and FlutterProcessManager.
 */
import { EventEmitter } from 'events';
import type { VMServiceClient } from '../vm/client.js';
import type { SessionManager } from './manager.js';
import type { FlutterProcessManager, RunAppOptions } from '../flutter/process-manager.js';
import type { SessionInfo } from './types.js';
import type { InteractionTarget, InteractionResult, BatchStep, BatchResult, GetTreeOptions, RuntimeError, HotReloadResult } from '../vm/types.js';
export interface SessionServiceOptions {
    sessionId: string;
    vmClient?: VMServiceClient;
    sessionManager: SessionManager;
    processManager: FlutterProcessManager;
    projectPath: string;
}
export interface SessionStatus {
    sessionInfo: SessionInfo;
    vmConnected: boolean;
    vmServiceUri?: string;
}
export declare class SessionService extends EventEmitter {
    private readonly sessionId;
    private vmClient?;
    private readonly sessionManager;
    private readonly processManager;
    private readonly projectPath;
    private treeCache;
    private treeCacheTime;
    private readonly treeCacheTtlMs;
    constructor(options: SessionServiceOptions);
    /** Set the VM client (called when VM connects after runApp) */
    setVmClient(vmClient: VMServiceClient): void;
    /** Clear the VM client (called when app exits but session persists) */
    clearVmClient(): void;
    get id(): string;
    get isVmConnected(): boolean;
    get client(): VMServiceClient | undefined;
    getTree(options?: GetTreeOptions): Promise<InteractionTarget[]>;
    execute(nodeId: string, interaction: string, args?: Record<string, unknown>): Promise<InteractionResult>;
    getState(nodeId: string): Promise<Record<string, unknown>>;
    batch(steps: BatchStep[]): Promise<BatchResult>;
    hotReload(clearErrors?: boolean): Promise<HotReloadResult>;
    hotRestart(clearErrors?: boolean): Promise<HotReloadResult>;
    getRuntimeErrors(): Promise<RuntimeError[]>;
    clearRuntimeErrors(): void;
    getLogs(maxLines?: number): string[];
    getStatus(): SessionStatus;
    runApp(options?: RunAppOptions): Promise<void>;
    stopApp(): Promise<void>;
    private requireVmConnection;
    private invalidateTreeCache;
}
//# sourceMappingURL=service.d.ts.map