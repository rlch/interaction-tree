/**
 * SessionManager - manages sessions shared across all daemon clients.
 */
import { EventEmitter } from 'events';
import type { Session, SessionInfo, CreateSessionOptions, ChatMessage } from './types.js';
export declare class SessionManager extends EventEmitter {
    private sessions;
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
     * Connect a client to a session.
     */
    connectClient(sessionNameOrId: string, clientId: string): SessionInfo;
    /**
     * Disconnect a client from a session.
     */
    disconnectClient(sessionNameOrId: string, clientId: string): void;
    /**
     * Disconnect a client from all sessions.
     */
    disconnectClientFromAll(clientId: string): void;
    /**
     * Get sessions a client is connected to.
     */
    getClientSessions(clientId: string): SessionInfo[];
    /**
     * Update session status.
     */
    updateStatus(sessionId: string, status: Session['appStatus'], details?: {
        vmServiceUri?: string;
        pid?: number;
        error?: string;
    }): void;
    /**
     * Add a log line to a session. Logs persist across process restarts.
     */
    addLog(sessionId: string, line: string): void;
    /**
     * Get logs for a session.
     */
    getLogs(sessionId: string, maxLines?: number): string[];
    /**
     * Clear logs for a session.
     */
    clearLogs(sessionId: string): void;
    /**
     * Add a chat message to a session's history.
     * Deduplicates identical consecutive messages from the same role.
     */
    addChatMessage(sessionId: string, message: ChatMessage): void;
    /**
     * Get chat history for a session.
     */
    getChatHistory(sessionId: string): ChatMessage[];
    /**
     * Clear chat history for a session.
     */
    clearChatHistory(sessionId: string): void;
    toInfo(session: Session): SessionInfo;
}
//# sourceMappingURL=manager.d.ts.map