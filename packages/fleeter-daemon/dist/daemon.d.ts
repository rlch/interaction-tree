/**
 * Main Fleeter Daemon class.
 */
import { SessionManager } from './session/index.js';
import { DaemonServer } from './ws/index.js';
import { FlutterProcessManager } from './flutter/index.js';
export interface DaemonConfig {
    port: number;
    host?: string;
}
export declare class Daemon {
    private config;
    private sessionManager;
    private server;
    private flutterManager;
    private vmClients;
    private running;
    constructor(config: DaemonConfig);
    private setupFlutterEvents;
    start(): Promise<void>;
    shutdown(signal?: string): Promise<void>;
    getSessionManager(): SessionManager;
    getFlutterManager(): FlutterProcessManager;
    getServer(): DaemonServer;
    isRunning(): boolean;
}
//# sourceMappingURL=daemon.d.ts.map