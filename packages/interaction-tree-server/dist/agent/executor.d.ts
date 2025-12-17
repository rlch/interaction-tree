/**
 * Agent executor using Claude Agent SDK.
 *
 * Uses the Claude Agent SDK which runs Claude Code as its runtime.
 * Authentication is handled by the Claude Code CLI in PATH.
 */
import type { AgentConfig } from '../types/agent.js';
export interface AgentExecutorConfig {
    /** Max turns before giving up */
    maxTurns: number;
    /** Working directory */
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
}
/**
 * Execute an agent with the interaction tree tools.
 */
export declare function executeAgent(systemPrompt: string, userMessage: string, config: AgentExecutorConfig): Promise<AgentExecutionResult>;
/**
 * Get the default agent config.
 */
export declare function getDefaultAgentConfig(overrides?: Partial<AgentConfig>): AgentExecutorConfig;
//# sourceMappingURL=executor.d.ts.map