/**
 * Agent executor using Claude Agent SDK.
 *
 * Uses the Claude Agent SDK which runs Claude Code as its runtime.
 * Authentication is handled by the Claude Code CLI in PATH.
 */
import type { VMServiceClient } from '../vm/client.js';
export interface AgentConfig {
    /** Model to use (optional, uses SDK default) */
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
}
export interface AgentExecutionResult {
    status: 'success' | 'failed' | 'needs_context';
    summary?: string;
    error?: string;
    question?: string;
    suggestions?: string[];
    conversationId?: string;
}
/**
 * Execute an agent with the interaction tree tools bound to a specific VMClient.
 */
export declare function executeAgent(systemPrompt: string, userMessage: string, config: AgentExecutorConfig, vmClient: VMServiceClient): Promise<AgentExecutionResult>;
/**
 * Get the default agent config.
 */
export declare function getDefaultAgentConfig(cwd: string, overrides?: Partial<AgentConfig>): AgentExecutorConfig;
/**
 * AgentExecutor class that wraps agent execution for a session.
 */
export declare class AgentExecutor {
    private config;
    constructor(config?: Partial<AgentConfig>);
    execute(options: {
        intent: string;
        conversationId?: string;
        vmClient?: VMServiceClient;
        sessionId: string;
        cwd: string;
    }): Promise<AgentExecutionResult>;
}
//# sourceMappingURL=executor.d.ts.map