/**
 * Session types for managing Flutter app instances with dedicated agents.
 */
import type { ChildProcess } from 'child_process';
import type { VMServiceClient } from '../vm/client.js';
/**
 * App state within a session.
 * Can be started/stopped while session persists.
 */
export interface SessionApp {
    process: ChildProcess;
    vmClient: VMServiceClient;
    status: 'starting' | 'running' | 'stopped' | 'error';
    vmServiceUri?: string;
    pid?: number;
    startedAt?: Date;
    error?: string;
    logs: string[];
}
/**
 * A session binds a project directory to a dedicated agent.
 * The session persists across app restarts.
 */
export interface Session {
    /** Unique session ID */
    id: string;
    /** Human-readable session name */
    name: string;
    /** Project directory (immutable for session lifetime) */
    projectPath: string;
    /** Current app state (null if not running) */
    app: SessionApp | null;
    /** Session creation time */
    createdAt: Date;
    /** Last activity time */
    lastActiveAt: Date;
}
/**
 * Public session info (for listing).
 */
export interface SessionInfo {
    id: string;
    name: string;
    projectPath: string;
    appStatus: 'not_running' | 'starting' | 'running' | 'stopped' | 'error';
    vmServiceUri?: string;
    pid?: number;
    createdAt: string;
    lastActiveAt: string;
}
/**
 * Options for creating a session.
 */
export interface CreateSessionOptions {
    name: string;
    projectPath: string;
}
/**
 * Options for running an app within a session.
 */
export interface RunAppOptions {
    device?: string;
    flavor?: string;
    target?: string;
    dartDefines?: Record<string, string>;
    additionalArgs?: string[];
}
/**
 * Options for rebuilding an app.
 */
export interface RebuildAppOptions extends RunAppOptions {
    clean?: boolean;
}
//# sourceMappingURL=types.d.ts.map