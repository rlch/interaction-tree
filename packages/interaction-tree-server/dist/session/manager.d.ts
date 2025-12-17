/**
 * SessionManager - manages sessions with dedicated agents per Flutter app.
 */
import { EventEmitter } from 'events';
import { VMServiceClient } from '../vm/client.js';
import type { Session, SessionInfo, CreateSessionOptions, RunAppOptions, RebuildAppOptions } from './types.js';
declare class SessionManager extends EventEmitter {
    private sessions;
    private activeSessionId;
    /**
     * Create a new session.
     */
    create(options: CreateSessionOptions): SessionInfo;
    /**
     * Destroy a session.
     */
    destroy(nameOrId: string): Promise<void>;
    /**
     * List all sessions.
     */
    list(): SessionInfo[];
    /**
     * Get a session by name or ID.
     */
    get(nameOrId: string): Session | undefined;
    /**
     * Connect to a session (set as active).
     */
    connect(nameOrId: string): SessionInfo;
    /**
     * Disconnect from current session.
     */
    disconnect(): void;
    /**
     * Get the active session.
     */
    getActive(): Session | null;
    /**
     * Get the active session or throw.
     */
    requireActive(): Session;
    /**
     * Get VM client for active session.
     */
    getActiveVMClient(): VMServiceClient | null;
    /**
     * Require VM client for active session.
     */
    requireActiveVMClient(): VMServiceClient;
    /**
     * Run app in active session.
     */
    runApp(options?: RunAppOptions): Promise<SessionInfo>;
    /**
     * Stop app in active session.
     */
    stopApp(nameOrId?: string): Promise<void>;
    /**
     * Hot reload app in active session.
     */
    hotReload(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Hot restart app in active session.
     */
    hotRestart(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Rebuild app in active session.
     */
    rebuildApp(options: RebuildAppOptions): Promise<SessionInfo>;
    /**
     * Get logs for active session.
     */
    getLogs(maxLines?: number): string[];
    private startProcess;
    private connectToApp;
    private addLog;
    private toInfo;
}
export declare function getSessionManager(): SessionManager;
export {};
//# sourceMappingURL=manager.d.ts.map