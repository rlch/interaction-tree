/**
 * Types for agent mode operations.
 */
import type { RuntimeError, LogEntry } from './dart-tooling.js';
/**
 * Result from execute_intent - can succeed, fail, or need more context.
 */
export type IntentResult = IntentSuccess | IntentFailed | IntentNeedsContext;
export interface IntentSuccess {
    status: 'success';
    summary: string;
    /** Any errors encountered (but recovered from) */
    errors?: RuntimeError[];
    /** Relevant logs from the execution */
    logs?: LogEntry[];
}
export interface IntentFailed {
    status: 'failed';
    error: string;
    /** Logs leading up to the failure */
    logs?: LogEntry[];
    /** Stack trace if available */
    stackTrace?: string;
}
export interface IntentNeedsContext {
    status: 'needs_context';
    /** The question the agent is asking */
    question: string;
    /** Optional suggestions for the caller */
    suggestions?: string[];
    /** Conversation ID to continue this intent */
    conversationId: string;
}
/**
 * Input for execute_intent tool.
 */
export interface ExecuteIntentInput {
    /** The natural language intent */
    intent: string;
    /** Optional file contents or other context */
    context?: string[];
    /** Continue a previous conversation */
    conversationId?: string;
    /** Answer to a previous needs_context question */
    answer?: string;
}
/**
 * Configuration for agent mode.
 */
export interface AgentConfig {
    /** Model to use (optional, uses SDK default) */
    model?: string;
    /** Max conversation turns before giving up */
    maxTurns?: number;
    /** Session idle timeout in ms */
    sessionTimeoutMs?: number;
}
/**
 * Internal agent session state.
 */
export interface AgentSession {
    id: string;
    createdAt: Date;
    lastActiveAt: Date;
    turnCount: number;
    /** Original intent from the first turn */
    originalIntent: string;
    /** Optional context from the first turn */
    originalContext?: string[];
    /** Last question asked by the agent (for continuations) */
    lastQuestion?: string;
}
//# sourceMappingURL=agent.d.ts.map