/**
 * Agent executor using Claude Agent SDK.
 *
 * Uses the Claude Agent SDK which runs Claude Code as its runtime.
 * Authentication is handled by the Claude Code CLI in PATH.
 */
import type { VMServiceClient } from '../vm/client.js';
import type { AgentStreamEvent } from '../ws/protocol.js';
export declare const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export interface AgentConfig {
    /** Model to use (defaults to claude-haiku-4-5-20251001) */
    model?: string;
    /** Max conversation turns before giving up */
    maxTurns?: number;
    /** Session idle timeout in ms */
    sessionTimeoutMs?: number;
}
export interface AgentExecutorConfig {
    /** Max turns before giving up */
    maxTurns: number;
    /** Working directory (session's projectPath) */
    cwd: string;
    /** Model to use (optional, defaults to SDK default) */
    model?: string;
    /** Resume an existing Claude SDK session */
    resume?: string;
}
export interface AgentExecutionResult {
    status: 'success' | 'error' | 'needs_context';
    summary?: string;
    error?: string;
    question?: string;
    suggestions?: string[];
    /** The Claude SDK session ID to use for resumption */
    sessionId?: string;
}
export type AgentStreamCallback = (event: Omit<AgentStreamEvent, 'type' | 'id' | 'sessionId'>) => void;
/**
 * Execute an agent with the interaction tree tools bound to a specific VMClient.
 * VMClient is optional - the agent can still respond but app-specific tools will fail gracefully.
 */
export declare function executeAgent(systemPrompt: string, userMessage: string, config: AgentExecutorConfig, vmClient?: VMServiceClient, onEvent?: AgentStreamCallback): Promise<AgentExecutionResult>;
/**
 * Get the default agent config.
 */
export declare function getDefaultAgentConfig(cwd: string, overrides?: Partial<AgentConfig>): AgentExecutorConfig;
/**
 * AgentExecutor class that wraps agent execution for a session.
 * Maintains a single Claude SDK session per fleeter session for conversation continuity.
 */
export declare class AgentExecutor {
    private config;
    /** Claude SDK session ID for resuming conversations */
    private sdkSessionId?;
    constructor(config?: Partial<AgentConfig>);
    /** Get the current Claude SDK session ID */
    getSessionId(): string | undefined;
    /** Clear the session (start fresh conversation) */
    clearSession(): void;
    execute(options: {
        intent: string;
        vmClient?: VMServiceClient;
        sessionId: string;
        cwd: string;
        onEvent?: AgentStreamCallback;
    }): Promise<AgentExecutionResult>;
}
//# sourceMappingURL=executor.d.ts.map