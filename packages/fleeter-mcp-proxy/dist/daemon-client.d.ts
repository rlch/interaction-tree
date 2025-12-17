/**
 * WebSocket client for connecting to fleeter-daemon.
 */
export interface DaemonClientConfig {
    daemonUrl: string;
    clientId: string;
}
export declare class DaemonClient {
    private ws;
    private config;
    private pendingRequests;
    private connected;
    private reconnecting;
    constructor(config: DaemonClientConfig);
    connect(): Promise<void>;
    sendCommand(action: string, data?: Record<string, unknown>): Promise<unknown>;
    sendAgentMessage(sessionId: string, intent: string, conversationId?: string): Promise<unknown>;
    isConnected(): boolean;
    close(): void;
}
//# sourceMappingURL=daemon-client.d.ts.map