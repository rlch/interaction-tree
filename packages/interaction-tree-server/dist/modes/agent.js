/**
 * Agent mode - AI-powered intent interpretation.
 *
 * Uses Claude Agent SDK with Claude Code as runtime to interpret
 * natural language intents and execute them via native functions.
 */
import { ListToolsRequestSchema, CallToolRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import * as schemas from '../tools/schemas.js';
import * as handlers from '../tools/handlers.js';
import { executeAgent, getDefaultAgentConfig } from '../agent/index.js';
// Session management for multi-turn conversations
const sessions = new Map();
const DEFAULT_CONFIG = {
    maxTurns: 10,
    sessionTimeoutMs: 5 * 60 * 1000, // 5 minutes
};
// Clean up expired sessions periodically
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.lastActiveAt.getTime() > DEFAULT_CONFIG.sessionTimeoutMs) {
            sessions.delete(id);
        }
    }
}, 60000);
const AGENT_SYSTEM_PROMPT = `You are an AI agent that interprets user intents and executes them using a Flutter app's interaction tree.

## Available Tools

You have access to these tools via the interaction-tree MCP server:

- connect: Connect to a Flutter app via VM service WebSocket URI
- getStatus: Get current connection status
- getTree: Get the current interaction tree showing all interactable widgets
- execute: Execute an interaction on a widget (tap, doubleTap, longPress, enterText, clearText, scroll, drag, scrollIntoView, waitFor, executeAction)
- getState: Get the current state of a widget
- batch: Execute multiple interactions in sequence
- hotReload: Reload app code changes (applies code changes while preserving state)
- hotRestart: Full app restart (resets all state)
- getLogs: Get recent app logs (may be empty if not implemented)
- getErrors: Get runtime errors (may be empty if not implemented)

## How to Work

1. First, check if connected using getStatus
2. If not connected, you need a VM service URI to connect. Ask for it if not provided.
3. Call getTree to see what widgets are available
4. Analyze the tree to find the widgets needed for the intent
5. Execute interactions in logical order
6. Return a concise summary of what happened

## When You Need More Information

If you cannot proceed because you need more context from the caller, respond EXACTLY in this format:

ASK_CONTEXT: <your question>
SUGGESTIONS: <optional comma-separated suggestions>

Examples:
- "ASK_CONTEXT: I see a user list but don't know which user to select. What's the target user?"
- "ASK_CONTEXT: The 'submit' button is disabled. Should I fill in required fields first? SUGGESTIONS: Check form validation, Look for error messages"

Only ask when truly necessary. Try to infer from tree state and context first.

## Response Format

When you successfully complete an intent, summarize what you did concisely.
When you fail, explain what went wrong and include any error messages.
`;
/**
 * Execute an intent using the Claude Agent SDK.
 */
async function executeIntentWithAgent(input, config) {
    // Check if this is a continuation
    if (input.conversationId && input.answer) {
        const session = sessions.get(input.conversationId);
        if (!session) {
            return {
                status: 'failed',
                error: `Session ${input.conversationId} not found or expired`,
            };
        }
        session.lastActiveAt = new Date();
        session.turnCount++;
        if (session.turnCount > DEFAULT_CONFIG.maxTurns) {
            sessions.delete(input.conversationId);
            return {
                status: 'failed',
                error: 'Max conversation turns exceeded',
            };
        }
        // Build context-aware continuation prompt with original intent
        let continuedIntent = `Original intent: ${session.originalIntent}\n`;
        if (session.originalContext && session.originalContext.length > 0) {
            continuedIntent += `Original context:\n${session.originalContext.join('\n---\n')}\n\n`;
        }
        continuedIntent += `You previously asked: ${session.lastQuestion}\nThe answer is: ${input.answer}\n\nPlease continue with the original intent.`;
        const result = await executeAgent(AGENT_SYSTEM_PROMPT, continuedIntent, getDefaultAgentConfig(config));
        if (result.status === 'needs_context') {
            session.lastQuestion = result.question;
            return {
                status: 'needs_context',
                question: result.question,
                suggestions: result.suggestions,
                conversationId: input.conversationId,
            };
        }
        sessions.delete(input.conversationId);
        if (result.status === 'failed') {
            return {
                status: 'failed',
                error: result.error,
            };
        }
        return {
            status: 'success',
            summary: result.summary,
        };
    }
    // Build prompt with context
    let prompt = input.intent;
    if (input.context && input.context.length > 0) {
        prompt = `Context:\n${input.context.join('\n---\n')}\n\nIntent: ${input.intent}`;
    }
    // Execute the agent
    const result = await executeAgent(AGENT_SYSTEM_PROMPT, prompt, getDefaultAgentConfig(config));
    // Handle needs_context - create a session
    if (result.status === 'needs_context') {
        const sessionId = uuidv4();
        sessions.set(sessionId, {
            id: sessionId,
            createdAt: new Date(),
            lastActiveAt: new Date(),
            turnCount: 1,
            originalIntent: input.intent,
            originalContext: input.context,
            lastQuestion: result.question,
        });
        return {
            status: 'needs_context',
            question: result.question,
            suggestions: result.suggestions,
            conversationId: sessionId,
        };
    }
    if (result.status === 'failed') {
        return {
            status: 'failed',
            error: result.error,
        };
    }
    return {
        status: 'success',
        summary: result.summary,
    };
}
export function registerAgentTools(server) {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            // Agent-specific tool
            {
                name: 'execute_intent',
                description: 'Execute a natural language intent against the Flutter app. ' +
                    'The AI agent will interpret the intent and perform the necessary interactions. ' +
                    'May return needs_context if more information is required.',
                inputSchema: schemas.executeIntentSchema,
            },
            // Also include raw tools for direct access when needed
            {
                name: 'connect',
                description: 'Connect to a running Flutter app via its VM service WebSocket URI.',
                inputSchema: schemas.connectSchema,
            },
            {
                name: 'disconnect',
                description: 'Disconnect from the currently connected Flutter app.',
                inputSchema: schemas.disconnectSchema,
            },
            {
                name: 'get_status',
                description: 'Get the current connection status.',
                inputSchema: schemas.getStatusSchema,
            },
            {
                name: 'get_tree',
                description: 'Get all InteractionKey-marked widgets from the connected Flutter app.',
                inputSchema: schemas.getTreeSchema,
            },
            {
                name: 'hot_reload',
                description: 'Trigger a hot reload of the Flutter app.',
                inputSchema: schemas.hotReloadSchema,
            },
            {
                name: 'hot_restart',
                description: 'Trigger a hot restart of the Flutter app.',
                inputSchema: schemas.hotRestartSchema,
            },
            {
                name: 'get_logs',
                description: 'Get recent logs from the Flutter app.',
                inputSchema: schemas.getLogsSchema,
            },
            {
                name: 'get_errors',
                description: 'Get runtime errors from the Flutter app.',
                inputSchema: schemas.getErrorsSchema,
            },
        ],
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        switch (name) {
            case 'execute_intent': {
                const result = await executeIntentWithAgent(args, DEFAULT_CONFIG);
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                };
            }
            // Connection tools (always available)
            case 'connect':
                return handlers.handleConnect(args);
            case 'disconnect':
                return handlers.handleDisconnect();
            case 'get_status':
                return handlers.handleGetStatus();
            case 'get_tree':
                return handlers.handleGetTree(args);
            case 'hot_reload':
                return handlers.handleHotReload();
            case 'hot_restart':
                return handlers.handleHotRestart();
            case 'get_logs':
                return handlers.handleGetLogs(args);
            case 'get_errors':
                return handlers.handleGetErrors();
            default:
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Unknown tool: ${name}. In agent mode, use execute_intent for most operations.`,
                        },
                    ],
                };
        }
    });
}
// Export for testing
export { AGENT_SYSTEM_PROMPT, executeIntentWithAgent };
//# sourceMappingURL=agent.js.map