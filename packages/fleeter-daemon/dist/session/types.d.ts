/**
 * Session types for fleeter-daemon.
 */
import type { AgentExecutor } from '../agent/index.js';
export type AppStatus = 'not_running' | 'starting' | 'running' | 'stopped' | 'error';
export interface SessionInfo {
    id: string;
    name: string;
    projectPath: string;
    appStatus: AppStatus;
    vmServiceUri?: string;
    pid?: number;
    connectedClients: string[];
    createdAt: string;
    lastActiveAt: string;
}
export declare const MAX_SESSION_LOGS = 1000;
export interface Session {
    id: string;
    name: string;
    projectPath: string;
    appStatus: AppStatus;
    vmServiceUri?: string;
    pid?: number;
    connectedClients: Set<string>;
    createdAt: Date;
    lastActiveAt: Date;
    agent?: AgentExecutor;
    logs: string[];
}
export interface CreateSessionOptions {
    name: string;
    projectPath: string;
}
//# sourceMappingURL=types.d.ts.map