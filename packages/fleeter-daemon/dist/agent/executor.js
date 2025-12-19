/**
 * Agent executor using Claude Agent SDK.
 *
 * Uses the Claude Agent SDK which runs Claude Code as its runtime.
 * Authentication is handled by the Claude Code CLI in PATH.
 */
import { query, createSdkMcpServer, tool, } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
/**
 * Parse ASK_CONTEXT pattern from assistant response.
 * More robust parsing: case-insensitive, handles multiline.
 */
function parseAskContext(content) {
    // Case-insensitive, anchored to line start (with optional whitespace)
    const askMatch = content.match(/^\s*ASK_CONTEXT:\s*(.+?)(?:\n|$)/im);
    if (!askMatch) {
        return { isAskContext: false };
    }
    const question = askMatch[1].trim();
    const suggestionsMatch = content.match(/^\s*SUGGESTIONS:\s*(.+?)(?:\n|$)/im);
    const suggestions = suggestionsMatch
        ? suggestionsMatch[1].split(',').map((s) => s.trim())
        : undefined;
    return { isAskContext: true, question, suggestions };
}
/**
 * Create the interaction tree MCP server for the agent.
 * Takes context with optional VMClient, SessionManager, FlutterManager.
 */
function createInteractionTreeMcpServer(ctx) {
    const { vmClient, sessionManager, flutterManager, sessionId } = ctx;
    const notConnectedError = {
        content: [{ type: 'text', text: 'Error: No Flutter app connected. Use run_app to start the app first.' }],
    };
    const noSessionError = {
        content: [{ type: 'text', text: 'Error: No session context available.' }],
    };
    const getStatusTool = tool('getStatus', 'Get the current connection status.', {}, async () => {
        if (!vmClient) {
            return { content: [{ type: 'text', text: JSON.stringify({ connected: false, message: 'No Flutter app connected' }, null, 2) }] };
        }
        const status = await vmClient.getStatus();
        return {
            content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
    });
    const getTreeTool = tool('getTree', 'Get the interaction tree showing all interactable widgets in the app.', {
        includeBounds: z.boolean().optional(),
        includeState: z.boolean().optional(),
    }, async (args) => {
        if (!vmClient || !vmClient.isConnected) {
            return notConnectedError;
        }
        try {
            const tree = await vmClient.getTree({
                includeBounds: args.includeBounds,
                includeWidgetType: true,
                includeState: args.includeState,
            });
            return {
                content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error getting tree: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    const executeTool = tool('execute', 'Execute an interaction on a widget (tap, doubleTap, longPress, enterText, etc.)', {
        id: z.string(),
        interaction: z.string(),
        args: z.record(z.unknown()).optional(),
    }, async (args) => {
        if (!vmClient || !vmClient.isConnected) {
            return notConnectedError;
        }
        try {
            const result = await vmClient.execute(args.id, args.interaction, args.args);
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error executing ${args.interaction} on ${args.id}: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    const getStateTool = tool('getState', 'Get the current state of a widget.', { id: z.string() }, async (args) => {
        if (!vmClient || !vmClient.isConnected) {
            return notConnectedError;
        }
        try {
            const state = await vmClient.getState(args.id);
            return {
                content: [{ type: 'text', text: JSON.stringify(state, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error getting state for ${args.id}: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    const batchTool = tool('batch', 'Execute multiple interactions in sequence.', {
        steps: z.array(z.object({
            action: z.string(),
            id: z.string(),
            text: z.string().optional(),
            dx: z.number().optional(),
            dy: z.number().optional(),
            alignment: z.number().optional(),
            actionName: z.string().optional(),
            args: z.record(z.unknown()).optional(),
            condition: z.string().optional(),
            timeoutMs: z.number().optional(),
        })),
    }, async (args) => {
        if (!vmClient || !vmClient.isConnected) {
            return notConnectedError;
        }
        try {
            const result = await vmClient.batch(args.steps);
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error executing batch: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    const hotReloadTool = tool('hotReload', 'Hot reload the app to apply code changes.', {}, async () => {
        if (!vmClient || !vmClient.isConnected) {
            return notConnectedError;
        }
        try {
            const result = await vmClient.hotReload();
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error during hot reload: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    const hotRestartTool = tool('hotRestart', 'Hot restart the app (full restart, loses state).', {}, async () => {
        if (!vmClient || !vmClient.isConnected) {
            return notConnectedError;
        }
        try {
            const result = await vmClient.hotRestart();
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error during hot restart: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    const getLogsTool = tool('getLogs', 'Get recent logs from the Flutter app.', { since: z.string().optional() }, async (args) => {
        if (!vmClient || !vmClient.isConnected) {
            return notConnectedError;
        }
        try {
            const logs = await vmClient.getLogs(args.since);
            return {
                content: [{ type: 'text', text: JSON.stringify({ logs }, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error getting logs: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    const getErrorsTool = tool('getErrors', 'Get runtime errors from the app.', {}, async () => {
        if (!vmClient || !vmClient.isConnected) {
            return notConnectedError;
        }
        try {
            const errors = await vmClient.getRuntimeErrors();
            return {
                content: [{ type: 'text', text: JSON.stringify({ errors }, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error getting errors: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    // Session management tools
    const createSessionTool = tool('createSession', 'Create a new Flutter session.', {
        name: z.string().describe('Session name'),
        projectPath: z.string().describe('Path to Flutter project'),
    }, async (args) => {
        if (!sessionManager) {
            return noSessionError;
        }
        try {
            const session = sessionManager.create({ name: args.name, projectPath: args.projectPath });
            return {
                content: [{ type: 'text', text: JSON.stringify(session, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error creating session: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    const listSessionsTool = tool('listSessions', 'List all Flutter sessions.', {}, async () => {
        if (!sessionManager) {
            return noSessionError;
        }
        const sessions = sessionManager.list();
        return {
            content: [{ type: 'text', text: JSON.stringify(sessions, null, 2) }],
        };
    });
    const connectSessionTool = tool('connectSession', 'Connect to an existing session by name or ID.', {
        sessionId: z.string().describe('Session ID or name'),
    }, async (args) => {
        if (!sessionManager) {
            return noSessionError;
        }
        const session = sessionManager.get(args.sessionId);
        if (!session) {
            return {
                content: [{ type: 'text', text: `Error: Session not found: ${args.sessionId}` }],
            };
        }
        return {
            content: [{ type: 'text', text: JSON.stringify({ connected: true, session: sessionManager.toInfo(session) }, null, 2) }],
        };
    });
    const destroySessionTool = tool('destroySession', 'Destroy a session by name or ID.', {
        sessionId: z.string().describe('Session ID or name'),
    }, async (args) => {
        if (!sessionManager) {
            return noSessionError;
        }
        try {
            await sessionManager.destroy(args.sessionId);
            return {
                content: [{ type: 'text', text: JSON.stringify({ destroyed: true }, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error destroying session: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    // App lifecycle tools
    const runAppTool = tool('runApp', 'Run the Flutter app in the current session.', {
        device: z.string().optional().describe('Target device'),
        flavor: z.string().optional().describe('Build flavor'),
        target: z.string().optional().describe('Target file (e.g., lib/main.dart)'),
    }, async (args) => {
        if (!sessionManager || !flutterManager || !sessionId) {
            return noSessionError;
        }
        const session = sessionManager.get(sessionId);
        if (!session) {
            return {
                content: [{ type: 'text', text: `Error: Session not found: ${sessionId}` }],
            };
        }
        try {
            sessionManager.updateStatus(sessionId, 'starting');
            const flutterProcess = await flutterManager.runApp(sessionId, session.projectPath, {
                device: args.device,
                flavor: args.flavor,
                target: args.target,
            });
            sessionManager.updateStatus(sessionId, 'running', { pid: flutterProcess.pid });
            return {
                content: [{ type: 'text', text: JSON.stringify({ success: true, pid: flutterProcess.pid }, null, 2) }],
            };
        }
        catch (err) {
            sessionManager.updateStatus(sessionId, 'not_running');
            return {
                content: [{ type: 'text', text: `Error running app: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    const stopAppTool = tool('stopApp', 'Stop the Flutter app in the current session.', {}, async () => {
        if (!flutterManager || !sessionId) {
            return noSessionError;
        }
        try {
            await flutterManager.stopApp(sessionId);
            if (sessionManager) {
                sessionManager.updateStatus(sessionId, 'not_running');
            }
            return {
                content: [{ type: 'text', text: JSON.stringify({ success: true }, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: 'text', text: `Error stopping app: ${err instanceof Error ? err.message : String(err)}` }],
            };
        }
    });
    return createSdkMcpServer({
        name: 'interaction-tree',
        version: '0.1.0',
        tools: [
            // Status & tree
            getStatusTool,
            getTreeTool,
            // Interactions
            executeTool,
            getStateTool,
            batchTool,
            // Hot reload/restart
            hotReloadTool,
            hotRestartTool,
            // Logs & errors
            getLogsTool,
            getErrorsTool,
            // Session management
            createSessionTool,
            listSessionsTool,
            connectSessionTool,
            destroySessionTool,
            // App lifecycle
            runAppTool,
            stopAppTool,
        ],
    });
}
/**
 * Execute an agent with the interaction tree tools bound to a context.
 * Context includes VMClient, SessionManager, FlutterManager - all optional.
 */
export async function executeAgent(systemPrompt, userMessage, config, ctx, onEvent) {
    const mcpServer = createInteractionTreeMcpServer(ctx);
    const options = {
        cwd: config.cwd,
        maxTurns: config.maxTurns,
        systemPrompt,
        mcpServers: {
            'interaction-tree': mcpServer,
        },
        allowedTools: [
            // Status & tree
            'mcp__interaction-tree__getStatus',
            'mcp__interaction-tree__getTree',
            // Interactions
            'mcp__interaction-tree__execute',
            'mcp__interaction-tree__getState',
            'mcp__interaction-tree__batch',
            // Hot reload/restart
            'mcp__interaction-tree__hotReload',
            'mcp__interaction-tree__hotRestart',
            // Logs & errors
            'mcp__interaction-tree__getLogs',
            'mcp__interaction-tree__getErrors',
            // Session management
            'mcp__interaction-tree__createSession',
            'mcp__interaction-tree__listSessions',
            'mcp__interaction-tree__connectSession',
            'mcp__interaction-tree__destroySession',
            // App lifecycle
            'mcp__interaction-tree__runApp',
            'mcp__interaction-tree__stopApp',
        ],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true, // Enable streaming
    };
    options.model = config.model ?? DEFAULT_MODEL;
    console.log(`[agent] Using model: ${options.model}`);
    if (config.resume) {
        options.resume = config.resume;
    }
    try {
        const textBlocks = [];
        let sessionId;
        for await (const message of query({ prompt: userMessage, options })) {
            // Capture session ID from the init message
            if (message.type === 'system' && message.subtype === 'init') {
                sessionId = message.session_id;
            }
            // Handle streaming partial messages (text deltas)
            if (message.type === 'stream_event') {
                const evt = message.event;
                if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
                    onEvent?.({ event: { kind: 'text_delta', text: evt.delta.text } });
                }
            }
            if (message.type === 'assistant') {
                for (const block of message.message.content) {
                    if (block.type === 'text') {
                        textBlocks.push(block.text);
                        // Don't emit text_delta here since we already streamed it via stream_event
                    }
                    else if (block.type === 'tool_use') {
                        onEvent?.({ event: { kind: 'tool_call_start', toolName: block.name, toolCallId: block.id } });
                    }
                }
            }
            if (message.type === 'user') {
                for (const block of message.message.content) {
                    if (block.type === 'tool_result') {
                        const resultText = Array.isArray(block.content)
                            ? block.content.map((c) => c.type === 'text' ? c.text : '').join('')
                            : typeof block.content === 'string' ? block.content : undefined;
                        onEvent?.({ event: { kind: 'tool_call_end', toolName: '', toolCallId: block.tool_use_id, result: resultText } });
                    }
                }
            }
            if (message.type === 'result') {
                if (message.subtype !== 'success') {
                    const errorMsg = 'errors' in message ? message.errors.join(', ') : 'Unknown error';
                    onEvent?.({ event: { kind: 'error', message: errorMsg } });
                    return {
                        status: 'error',
                        error: errorMsg,
                        sessionId,
                    };
                }
            }
        }
        const allContent = textBlocks.join('\n');
        const finalContent = textBlocks.filter(t => t.trim()).pop() ?? '';
        const askContext = parseAskContext(allContent);
        if (askContext.isAskContext) {
            return {
                status: 'needs_context',
                question: askContext.question,
                suggestions: askContext.suggestions,
                sessionId,
            };
        }
        onEvent?.({ event: { kind: 'task_complete', summary: finalContent } });
        return {
            status: 'success',
            summary: finalContent,
            sessionId,
        };
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        onEvent?.({ event: { kind: 'error', message: errorMsg } });
        return {
            status: 'error',
            error: errorMsg,
        };
    }
}
/**
 * Get the default agent config.
 */
export function getDefaultAgentConfig(cwd, overrides) {
    return {
        maxTurns: overrides?.maxTurns ?? 10,
        cwd,
        model: overrides?.model,
    };
}
/**
 * AgentExecutor class that wraps agent execution for a session.
 * Maintains a single Claude SDK session per fleeter session for conversation continuity.
 */
export class AgentExecutor {
    config;
    /** Claude SDK session ID for resuming conversations */
    sdkSessionId;
    constructor(config) {
        this.config = config ?? {};
    }
    /** Get the current Claude SDK session ID */
    getSessionId() {
        return this.sdkSessionId;
    }
    /** Clear the session (start fresh conversation) */
    clearSession() {
        this.sdkSessionId = undefined;
    }
    async execute(options) {
        const { intent, vmClient, sessionManager, flutterManager, sessionId, cwd, onEvent } = options;
        const { AGENT_SYSTEM_PROMPT } = await import('./prompts.js');
        const config = getDefaultAgentConfig(cwd, this.config);
        // Resume existing session if we have one
        if (this.sdkSessionId) {
            config.resume = this.sdkSessionId;
        }
        const ctx = {
            vmClient,
            sessionManager,
            flutterManager,
            sessionId,
        };
        const result = await executeAgent(AGENT_SYSTEM_PROMPT, intent, config, ctx, onEvent);
        // Store the session ID for future resumption
        if (result.sessionId) {
            this.sdkSessionId = result.sessionId;
        }
        return result;
    }
}
//# sourceMappingURL=executor.js.map