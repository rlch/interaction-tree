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
import { getMonitor } from '../monitoring/index.js';
async function withMonitoring(toolName, args, fn) {
    const start = Date.now();
    const monitor = getMonitor();
    monitor.mcp.request('tools/call', toolName, args);
    try {
        const result = await fn();
        const durationMs = Date.now() - start;
        const isError = typeof result === 'object' && result !== null &&
            'content' in result &&
            Array.isArray(result.content) &&
            result.content[0]?.text?.startsWith('Error:');
        monitor.mcp.response('tools/call', durationMs, !isError, {
            toolName,
            error: isError ? result.content[0]?.text : undefined,
        });
        return result;
    }
    catch (err) {
        const durationMs = Date.now() - start;
        monitor.mcp.response('tools/call', durationMs, false, {
            toolName,
            error: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
}
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
const AGENT_SYSTEM_PROMPT = `You are an AI agent that manages Flutter app lifecycle and interactions.

## Available Tools

### Lifecycle Management
- run: Start a Flutter app (spawns flutter run, auto-connects to VM service)
- stop: Stop the running Flutter app
- rebuild: Full rebuild (stop, optionally clean, then run again)
- hotReload: Apply code changes while preserving app state
- hotRestart: Apply code changes and reset app state (same process)
- getStatus: Get current app status (process state, VM connection)
- getLogs: Get recent app logs
- getErrors: Get runtime errors

### Interaction Tree
- getTree: Get all interactable widgets (those with InteractionKey)
- tap/doubleTap/longPress: Gesture interactions
- enterText/clearText: Text input
- scroll/drag: Scrolling and dragging
- scrollIntoView: Scroll to make a widget visible
- waitFor: Wait for widget state (exists, visible, etc.)
- getState: Get widget's current state
- executeAction: Run custom actions defined via InteractableMixin
- batch: Execute multiple interactions in sequence

## How to Work

1. Check app status with getStatus
2. If no app running, use run with the projectPath
3. Call getTree to see available widgets
4. Execute interactions based on the intent
5. Return a concise summary

## Lifecycle Commands

- **run**: Use when starting fresh or app not running
- **hotReload**: Use after code changes (preserves state, fast)
- **hotRestart**: Use when state needs reset but no rebuild needed
- **rebuild**: Use when dependencies changed or clean build needed
- **stop**: Use when done or need to switch projects

## When You Need More Information

If you cannot proceed, respond EXACTLY in this format:

ASK_CONTEXT: <your question>
SUGGESTIONS: <optional comma-separated suggestions>

Example:
- "ASK_CONTEXT: No project path provided. Where is the Flutter project located?"

Only ask when truly necessary. Try to infer from context first.

## Response Format

When successful, summarize what you did concisely.
When failed, explain what went wrong with error details.
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
            // Agent-specific tool - the main entry point
            {
                name: 'execute_intent',
                description: 'Execute a natural language intent against the Flutter app. ' +
                    'The AI agent will manage the app lifecycle and perform interactions. ' +
                    'May return needs_context if more information is required.',
                inputSchema: schemas.executeIntentSchema,
            },
            // Lifecycle tools (also available directly for control)
            {
                name: 'run',
                description: 'Run a Flutter app. Spawns flutter run, captures VM service URI, and auto-connects.',
                inputSchema: schemas.runSchema,
            },
            {
                name: 'stop',
                description: 'Stop the running Flutter app.',
                inputSchema: schemas.stopSchema,
            },
            {
                name: 'rebuild',
                description: 'Full rebuild - stops the app, optionally runs flutter clean, then runs again.',
                inputSchema: schemas.rebuildSchema,
            },
            {
                name: 'get_status',
                description: 'Get the current app status (process state and VM connection).',
                inputSchema: schemas.getStatusSchema,
            },
            {
                name: 'get_tree',
                description: 'Get all InteractionKey-marked widgets from the running Flutter app.',
                inputSchema: schemas.getTreeSchema,
            },
            {
                name: 'hot_reload',
                description: 'Hot reload - apply code changes while preserving app state.',
                inputSchema: schemas.hotReloadSchema,
            },
            {
                name: 'hot_restart',
                description: 'Hot restart - apply code changes and reset app state.',
                inputSchema: schemas.hotRestartSchema,
            },
            {
                name: 'get_logs',
                description: 'Get recent logs from the Flutter app process.',
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
                return withMonitoring(name, args, async () => {
                    const result = await executeIntentWithAgent(args, DEFAULT_CONFIG);
                    return {
                        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                    };
                });
            }
            // Lifecycle tools (direct access)
            case 'run':
                return withMonitoring(name, args, () => handlers.handleRun(args));
            case 'stop':
                return withMonitoring(name, args, () => handlers.handleStop(args));
            case 'rebuild':
                return withMonitoring(name, args, () => handlers.handleRebuild(args));
            case 'get_status':
                return withMonitoring(name, args, () => handlers.handleGetStatus(args));
            case 'get_tree':
                return withMonitoring(name, args, () => handlers.handleGetTree(args));
            case 'hot_reload':
                return withMonitoring(name, args, () => handlers.handleHotReload(args));
            case 'hot_restart':
                return withMonitoring(name, args, () => handlers.handleHotRestart(args));
            case 'get_logs':
                return withMonitoring(name, args, () => handlers.handleGetLogs(args));
            case 'get_errors':
                return withMonitoring(name, args, () => handlers.handleGetErrors(args));
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