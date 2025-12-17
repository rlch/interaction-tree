/**
 * WebSocket server for fleeter-daemon.
 */
import type { MonitoringEvent } from './protocol.js';
import type { SessionManager } from '../session/index.js';
import type { FlutterProcessManager } from '../flutter/index.js';
import type { VMServiceClient } from '../vm/index.js';
export interface DaemonServerConfig {
    port: number;
    host?: string;
}
export declare class DaemonServer {
    private wss;
    private clients;
    private sessionManager;
    private flutterManager;
    private vmClients;
    constructor(sessionManager: SessionManager, flutterManager: FlutterProcessManager, vmClients: Map<string, VMServiceClient>);
    start(config: DaemonServerConfig): void;
    stop(): void;
    private handleMessage;
    private handleHello;
    private handleCommand;
    private handleDisconnect;
    private sendError;
    broadcastEvent(source: MonitoringEvent['source'], eventType: string, payload: unknown, sessionId?: string): void;
    getClientCount(): number;
}
//# sourceMappingURL=server.d.ts.map