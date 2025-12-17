/**
 * MCP Proxy - translates MCP protocol to daemon WebSocket commands.
 */
import { DaemonClient } from './daemon-client.js';
export declare class McpProxy {
    private server;
    private daemonClient;
    constructor(daemonClient: DaemonClient);
    private setupHandlers;
    start(): Promise<void>;
}
//# sourceMappingURL=proxy.d.ts.map