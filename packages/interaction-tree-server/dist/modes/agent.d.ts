/**
 * Agent mode - AI-powered intent interpretation.
 *
 * Uses Claude Agent SDK with Claude Code as runtime to interpret
 * natural language intents and execute them via native functions.
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { IntentResult, ExecuteIntentInput, AgentConfig } from '../types/agent.js';
/**
 * Execute an intent using the Claude Agent SDK.
 */
declare function executeIntentWithAgent(input: ExecuteIntentInput, config: AgentConfig): Promise<IntentResult>;
export declare function registerAgentTools(server: Server): void;
export { executeIntentWithAgent };
//# sourceMappingURL=agent.d.ts.map