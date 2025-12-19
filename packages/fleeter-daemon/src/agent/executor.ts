/**
 * Agent executor using Claude Agent SDK.
 *
 * Uses the Claude Agent SDK which runs Claude Code as its runtime.
 * Authentication is handled by the Claude Code CLI in PATH.
 */

import {
  query,
  createSdkMcpServer,
  tool,
  type Options,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { BatchStep } from '../vm/types.js';
import type { AgentStreamEvent } from '../ws/protocol.js';
import type { SessionManager } from '../session/manager.js';
import type { SessionService } from '../session/service.js';

/** Context passed to the agent's MCP tools */
export interface AgentContext {
  sessionService?: SessionService;  // Per-session operations (getTree, execute, hotReload, etc.)
  sessionManager?: SessionManager;  // Global session operations (create, list, destroy)
}

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

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

/**
 * Parse ASK_CONTEXT pattern from assistant response.
 * More robust parsing: case-insensitive, handles multiline.
 */
function parseAskContext(content: string): {
  isAskContext: boolean;
  question?: string;
  suggestions?: string[];
} {
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
 * Takes context with SessionService (per-session) and SessionManager (global operations).
 */
function createInteractionTreeMcpServer(ctx: AgentContext) {
  const { sessionService, sessionManager } = ctx;
  
  const noSessionServiceError = {
    content: [{ type: 'text' as const, text: 'Error: No session service available. Connect to a session first.' }],
  };
  
  const noSessionManagerError = {
    content: [{ type: 'text' as const, text: 'Error: No session manager available.' }],
  };

  const wrapError = (err: unknown, context: string) => ({
    content: [{ type: 'text' as const, text: `Error ${context}: ${err instanceof Error ? err.message : String(err)}` }],
  });

  const getStatusTool = tool(
    'getStatus',
    'Get the current connection status.',
    {},
    async () => {
      if (!sessionService) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ connected: false, message: 'No session service available' }, null, 2) }] };
      }
      try {
        const status = sessionService.getStatus();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }],
        };
      } catch (err) {
        return wrapError(err, 'getting status');
      }
    }
  );

  const getTreeTool = tool(
    'getTree',
    'Get the interaction tree showing all interactable widgets in the app.',
    {
      includeBounds: z.boolean().optional(),
      includeState: z.boolean().optional(),
    },
    async (args) => {
      if (!sessionService) {
        return noSessionServiceError;
      }
      try {
        const tree = await sessionService.getTree({
          includeBounds: args.includeBounds,
          includeWidgetType: true,
          includeState: args.includeState,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(tree, null, 2) }],
        };
      } catch (err) {
        return wrapError(err, 'getting tree');
      }
    }
  );

  const executeTool = tool(
    'execute',
    'Execute an interaction on a widget (tap, doubleTap, longPress, enterText, etc.)',
    {
      id: z.string(),
      interaction: z.string(),
      args: z.record(z.unknown()).optional(),
    },
    async (args) => {
      if (!sessionService) {
        return noSessionServiceError;
      }
      try {
        const result = await sessionService.execute(args.id, args.interaction, args.args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return wrapError(err, `executing ${args.interaction} on ${args.id}`);
      }
    }
  );

  const getStateTool = tool(
    'getState',
    'Get the current state of a widget.',
    { id: z.string() },
    async (args) => {
      if (!sessionService) {
        return noSessionServiceError;
      }
      try {
        const state = await sessionService.getState(args.id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }],
        };
      } catch (err) {
        return wrapError(err, `getting state for ${args.id}`);
      }
    }
  );

  const batchTool = tool(
    'batch',
    'Execute multiple interactions in sequence.',
    {
      steps: z.array(
        z.object({
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
        })
      ),
    },
    async (args) => {
      if (!sessionService) {
        return noSessionServiceError;
      }
      try {
        const result = await sessionService.batch(args.steps as BatchStep[]);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return wrapError(err, 'executing batch');
      }
    }
  );

  const hotReloadTool = tool('hotReload', 'Hot reload the app to apply code changes.', {}, async () => {
    if (!sessionService) {
      return noSessionServiceError;
    }
    try {
      const result = await sessionService.hotReload();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return wrapError(err, 'during hot reload');
    }
  });

  const hotRestartTool = tool('hotRestart', 'Hot restart the app (full restart, loses state).', {}, async () => {
    if (!sessionService) {
      return noSessionServiceError;
    }
    try {
      const result = await sessionService.hotRestart();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return wrapError(err, 'during hot restart');
    }
  });

  const getLogsTool = tool(
    'getLogs',
    'Get recent logs from the Flutter app.',
    { maxLines: z.number().optional() },
    async (args) => {
      if (!sessionService) {
        return noSessionServiceError;
      }
      try {
        const logs = sessionService.getLogs(args.maxLines);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ logs }, null, 2) }],
        };
      } catch (err) {
        return wrapError(err, 'getting logs');
      }
    }
  );

  const getErrorsTool = tool('getErrors', 'Get runtime errors from the app.', {}, async () => {
    if (!sessionService) {
      return noSessionServiceError;
    }
    try {
      const errors = await sessionService.getRuntimeErrors();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ errors }, null, 2) }],
      };
    } catch (err) {
      return wrapError(err, 'getting errors');
    }
  });

  // Session management tools (use sessionManager for global operations)
  const createSessionTool = tool(
    'createSession',
    'Create a new Flutter session.',
    {
      name: z.string().describe('Session name'),
      projectPath: z.string().describe('Path to Flutter project'),
    },
    async (args) => {
      if (!sessionManager) {
        return noSessionManagerError;
      }
      try {
        const session = sessionManager.create({ name: args.name, projectPath: args.projectPath });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(session, null, 2) }],
        };
      } catch (err) {
        return wrapError(err, 'creating session');
      }
    }
  );

  const listSessionsTool = tool('listSessions', 'List all Flutter sessions.', {}, async () => {
    if (!sessionManager) {
      return noSessionManagerError;
    }
    const sessions = sessionManager.list();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(sessions, null, 2) }],
    };
  });

  const connectSessionTool = tool(
    'connectSession',
    'Connect to an existing session by name or ID.',
    {
      sessionId: z.string().describe('Session ID or name'),
    },
    async (args) => {
      if (!sessionManager) {
        return noSessionManagerError;
      }
      const session = sessionManager.get(args.sessionId);
      if (!session) {
        return {
          content: [{ type: 'text' as const, text: `Error: Session not found: ${args.sessionId}` }],
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ connected: true, session: sessionManager.toInfo(session) }, null, 2) }],
      };
    }
  );

  const destroySessionTool = tool(
    'destroySession',
    'Destroy a session by name or ID.',
    {
      sessionId: z.string().describe('Session ID or name'),
    },
    async (args) => {
      if (!sessionManager) {
        return noSessionManagerError;
      }
      try {
        await sessionManager.destroy(args.sessionId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ destroyed: true }, null, 2) }],
        };
      } catch (err) {
        return wrapError(err, 'destroying session');
      }
    }
  );

  // App lifecycle tools (use sessionService)
  const runAppTool = tool(
    'runApp',
    'Run the Flutter app in the current session.',
    {
      device: z.string().optional().describe('Target device'),
      flavor: z.string().optional().describe('Build flavor'),
      target: z.string().optional().describe('Target file (e.g., lib/main.dart)'),
    },
    async (args) => {
      if (!sessionService) {
        return noSessionServiceError;
      }
      try {
        await sessionService.runApp({
          device: args.device,
          flavor: args.flavor,
          target: args.target,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true }, null, 2) }],
        };
      } catch (err) {
        return wrapError(err, 'running app');
      }
    }
  );

  const stopAppTool = tool('stopApp', 'Stop the Flutter app in the current session.', {}, async () => {
    if (!sessionService) {
      return noSessionServiceError;
    }
    try {
      await sessionService.stopApp();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true }, null, 2) }],
      };
    } catch (err) {
      return wrapError(err, 'stopping app');
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

export type AgentStreamCallback = (event: Omit<AgentStreamEvent, 'type' | 'id' | 'sessionId'>) => void;

/**
 * Execute an agent with the interaction tree tools bound to a context.
 * Context includes VMClient, SessionManager, FlutterManager - all optional.
 */
export async function executeAgent(
  systemPrompt: string,
  userMessage: string,
  config: AgentExecutorConfig,
  ctx: AgentContext,
  onEvent?: AgentStreamCallback
): Promise<AgentExecutionResult> {
  const mcpServer = createInteractionTreeMcpServer(ctx);

  const options: Options = {
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
    includePartialMessages: true,  // Enable streaming
  };

  options.model = config.model ?? DEFAULT_MODEL;
  console.log(`[agent] Using model: ${options.model}`);

  if (config.resume) {
    options.resume = config.resume;
  }

  try {
    const textBlocks: string[] = [];
    let sessionId: string | undefined;

    for await (const message of query({ prompt: userMessage, options })) {
      // Capture session ID from the init message
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
      }

      // Handle streaming partial messages (text deltas, block boundaries)
      if (message.type === 'stream_event') {
        const evt = message.event as {
          type: string;
          index?: number;
          delta?: { type: string; text?: string };
          content_block?: { type: string; name?: string; id?: string };
        };
        
        // Text streaming
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          onEvent?.({ event: { kind: 'text_delta', text: evt.delta.text ?? '' } });
        }
        
        // Tool block starting - emit tool_call_start immediately during streaming
        // This preserves the correct ordering: text -> tool -> text
        if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
          onEvent?.({ event: { 
            kind: 'tool_call_start', 
            toolName: evt.content_block.name ?? '', 
            toolCallId: evt.content_block.id ?? '' 
          } });
        }
        
        // Message streaming complete - emit message_complete for immediate UI feedback
        // Don't wait for the full loop to finish (which includes SDK overhead)
        if (evt.type === 'message_stop') {
          onEvent?.({ event: { kind: 'message_complete' } });
        }
      }

      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            textBlocks.push(block.text);
            // Don't emit text_delta here since we already streamed it via stream_event
          }
          // Note: tool_call_start is now emitted via stream_event content_block_start
          // to ensure correct ordering during streaming
        }
      }

      if (message.type === 'user') {
        for (const block of message.message.content) {
          if (block.type === 'tool_result') {
            const resultText = Array.isArray(block.content)
              ? block.content.map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '').join('')
              : typeof block.content === 'string' ? block.content : undefined;
            onEvent?.({ event: { kind: 'tool_call_end', toolName: '', toolCallId: block.tool_use_id, result: resultText } });
          }
        }
      }

      if (message.type === 'result') {
        if (message.subtype !== 'success') {
          const errorMsg =
            'errors' in message ? message.errors.join(', ') : 'Unknown error';
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
  } catch (err) {
    console.error('[agent] executeAgent error:', err);
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
export function getDefaultAgentConfig(
  cwd: string,
  overrides?: Partial<AgentConfig>
): AgentExecutorConfig {
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
  private config: Partial<AgentConfig>;
  /** Claude SDK session ID for resuming conversations */
  private sdkSessionId?: string;

  constructor(config?: Partial<AgentConfig>) {
    this.config = config ?? {};
  }

  /** Get the current Claude SDK session ID */
  getSessionId(): string | undefined {
    return this.sdkSessionId;
  }

  /** Clear the session (start fresh conversation) */
  clearSession(): void {
    this.sdkSessionId = undefined;
  }

  async execute(options: {
    intent: string;
    sessionService?: SessionService;
    sessionManager?: SessionManager;
    cwd: string;
    onEvent?: AgentStreamCallback;
  }): Promise<AgentExecutionResult> {
    const { intent, sessionService, sessionManager, cwd, onEvent } = options;

    const { AGENT_SYSTEM_PROMPT } = await import('./prompts.js');
    const config = getDefaultAgentConfig(cwd, this.config);

    // Resume existing session if we have one
    if (this.sdkSessionId) {
      config.resume = this.sdkSessionId;
    }

    const ctx: AgentContext = {
      sessionService,
      sessionManager,
    };

    const result = await executeAgent(AGENT_SYSTEM_PROMPT, intent, config, ctx, onEvent);

    // Store the session ID for future resumption
    if (result.sessionId) {
      this.sdkSessionId = result.sessionId;
    }

    return result;
  }
}
