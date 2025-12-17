/**
 * WebSocket server for streaming monitoring events and handling commands.
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Command, AgentMessage } from './types.js';
export interface MonitoringServerConfig {
    port: number;
    host?: string;
}
type CommandHandler = (cmd: Command, ws: WebSocket) => Promise<void>;
type AgentHandler = (msg: AgentMessage, ws: WebSocket) => Promise<void>;
export declare function setCommandHandler(handler: CommandHandler): void;
export declare function setAgentHandler(handler: AgentHandler): void;
export declare function startMonitoringServer(config: MonitoringServerConfig | number): WebSocketServer;
export declare function stopMonitoringServer(): void;
export declare function getMonitoringServer(): WebSocketServer | null;
export declare function broadcastToClients(message: object): void;
export {};
//# sourceMappingURL=ws-server.d.ts.map