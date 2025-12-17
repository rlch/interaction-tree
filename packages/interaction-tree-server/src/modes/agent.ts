/**
 * Agent mode - AI-powered intent interpretation.
 *
 * Uses Claude Agent SDK with Claude Code as runtime to interpret
 * natural language intents and execute them via native functions.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import * as schemas from '../tools/schemas.js';
import * as handlers from '../tools/handlers.js';
import { executeAgent, getDefaultAgentConfig, AGENT_SYSTEM_PROMPT } from '../agent/index.js';
import { getSessionManager } from '../session/index.js';
import type { IntentResult, ExecuteIntentInput, AgentSession, AgentConfig } from '../types/agent.js';
import { getMonitor } from '../monitoring/index.js';

async function withMonitoring<T>(
  toolName: string,
  args: unknown,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const monitor = getMonitor();
  monitor.mcp.request('tools/call', toolName, args as Record<string, unknown>);

  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    const isError =
      typeof result === 'object' &&
      result !== null &&
      'content' in result &&
      Array.isArray((result as { content: unknown[] }).content) &&
      (result as { content: Array<{ text?: string }> }).content[0]?.text?.startsWith('Error:');
    monitor.mcp.response('tools/call', durationMs, !isError, {
      toolName,
      error: isError
        ? (result as { content: Array<{ text: string }> }).content[0]?.text
        : undefined,
    });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    monitor.mcp.response('tools/call', durationMs, false, {
      toolName,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// Session management for multi-turn agent conversations
const agentSessions = new Map<string, AgentSession>();

const DEFAULT_CONFIG: AgentConfig = {
  maxTurns: 10,
  sessionTimeoutMs: 5 * 60 * 1000, // 5 minutes
};

// Clean up expired agent sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of agentSessions) {
    if (now - session.lastActiveAt.getTime() > DEFAULT_CONFIG.sessionTimeoutMs!) {
      agentSessions.delete(id);
    }
  }
}, 60000);

/**
 * Execute an intent using the Claude Agent SDK.
 */
async function executeIntentWithAgent(
  input: ExecuteIntentInput,
  config: AgentConfig
): Promise<IntentResult> {
  const manager = getSessionManager();

  // Require active session with running app
  const session = manager.getActive();
  if (!session) {
    return {
      status: 'failed',
      error: 'No active session. Use connect tool first.',
    };
  }

  if (!session.app?.vmClient?.isConnected) {
    return {
      status: 'failed',
      error: 'App not running or not connected. Use run tool first.',
    };
  }

  // Check if this is a continuation of a previous conversation
  if (input.conversationId && input.answer) {
    const agentSession = agentSessions.get(input.conversationId);
    if (!agentSession) {
      return {
        status: 'failed',
        error: `Conversation ${input.conversationId} not found or expired`,
      };
    }

    agentSession.lastActiveAt = new Date();
    agentSession.turnCount++;

    if (agentSession.turnCount > DEFAULT_CONFIG.maxTurns!) {
      agentSessions.delete(input.conversationId);
      return {
        status: 'failed',
        error: 'Max conversation turns exceeded',
      };
    }

    // Build context-aware continuation prompt
    let continuedIntent = `Original intent: ${agentSession.originalIntent}\n`;
    if (agentSession.originalContext && agentSession.originalContext.length > 0) {
      continuedIntent += `Original context:\n${agentSession.originalContext.join('\n---\n')}\n\n`;
    }
    continuedIntent += `You previously asked: ${agentSession.lastQuestion}\nThe answer is: ${input.answer}\n\nPlease continue with the original intent.`;

    const result = await executeAgent(
      AGENT_SYSTEM_PROMPT,
      continuedIntent,
      getDefaultAgentConfig(session.projectPath, config),
      session.app.vmClient
    );

    if (result.status === 'needs_context') {
      agentSession.lastQuestion = result.question;
      return {
        status: 'needs_context',
        question: result.question!,
        suggestions: result.suggestions,
        conversationId: input.conversationId,
      };
    }

    agentSessions.delete(input.conversationId);

    if (result.status === 'failed') {
      return {
        status: 'failed',
        error: result.error!,
      };
    }

    return {
      status: 'success',
      summary: result.summary!,
    };
  }

  // Build prompt with context
  let prompt = input.intent;
  if (input.context && input.context.length > 0) {
    prompt = `Context:\n${input.context.join('\n---\n')}\n\nIntent: ${input.intent}`;
  }

  // Execute the agent
  const result = await executeAgent(
    AGENT_SYSTEM_PROMPT,
    prompt,
    getDefaultAgentConfig(session.projectPath, config),
    session.app.vmClient
  );

  // Handle needs_context - create an agent session
  if (result.status === 'needs_context') {
    const sessionId = uuidv4();
    agentSessions.set(sessionId, {
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
      question: result.question!,
      suggestions: result.suggestions,
      conversationId: sessionId,
    };
  }

  if (result.status === 'failed') {
    return {
      status: 'failed',
      error: result.error!,
    };
  }

  return {
    status: 'success',
    summary: result.summary!,
  };
}

export function registerAgentTools(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // Session management
      {
        name: 'create_session',
        description: 'Create a new session for a Flutter project.',
        inputSchema: schemas.createSessionSchema,
      },
      {
        name: 'destroy_session',
        description: 'Destroy a session (stops app if running).',
        inputSchema: schemas.destroySessionSchema,
      },
      {
        name: 'list_sessions',
        description: 'List all sessions.',
        inputSchema: schemas.listSessionsSchema,
      },
      {
        name: 'connect',
        description: 'Connect to a session. Required before using most other tools.',
        inputSchema: schemas.connectSchema,
      },
      {
        name: 'disconnect',
        description: 'Disconnect from the current session.',
        inputSchema: schemas.disconnectSchema,
      },

      // App lifecycle (requires connected session)
      {
        name: 'run',
        description: 'Run the Flutter app in the connected session.',
        inputSchema: schemas.runSchema,
      },
      {
        name: 'stop',
        description: 'Stop the Flutter app in the connected session.',
        inputSchema: schemas.stopSchema,
      },
      {
        name: 'rebuild',
        description: 'Full rebuild - stop, optionally clean, then run again.',
        inputSchema: schemas.rebuildSchema,
      },
      {
        name: 'get_status',
        description: 'Get the current session and app status.',
        inputSchema: schemas.getStatusSchema,
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

      // Interaction tree (requires running app)
      {
        name: 'get_tree',
        description: 'Get all InteractionKey-marked widgets from the running Flutter app.',
        inputSchema: schemas.getTreeSchema,
      },

      // Agent mode
      {
        name: 'execute_intent',
        description:
          'Execute a natural language intent against the Flutter app. ' +
          'The AI agent will interpret the intent and perform interactions. ' +
          'Requires connected session with running app.',
        inputSchema: schemas.executeIntentSchema,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      // Session management
      case 'create_session':
        return withMonitoring(name, args, () =>
          handlers.handleCreateSession(args as { name: string; projectPath: string })
        );
      case 'destroy_session':
        return withMonitoring(name, args, () =>
          handlers.handleDestroySession(args as { session: string })
        );
      case 'list_sessions':
        return withMonitoring(name, args, () => handlers.handleListSessions());
      case 'connect':
        return withMonitoring(name, args, () =>
          handlers.handleConnect(args as { session: string })
        );
      case 'disconnect':
        return withMonitoring(name, args, () => handlers.handleDisconnect());

      // App lifecycle
      case 'run':
        return withMonitoring(name, args, () =>
          handlers.handleRun(args as Parameters<typeof handlers.handleRun>[0])
        );
      case 'stop':
        return withMonitoring(name, args, () => handlers.handleStop());
      case 'rebuild':
        return withMonitoring(name, args, () =>
          handlers.handleRebuild(args as Parameters<typeof handlers.handleRebuild>[0])
        );
      case 'get_status':
        return withMonitoring(name, args, () => handlers.handleGetStatus());
      case 'hot_reload':
        return withMonitoring(name, args, () => handlers.handleHotReload());
      case 'hot_restart':
        return withMonitoring(name, args, () => handlers.handleHotRestart());
      case 'get_logs':
        return withMonitoring(name, args, () =>
          handlers.handleGetLogs(args as { maxLines?: number })
        );
      case 'get_errors':
        return withMonitoring(name, args, () => handlers.handleGetErrors());

      // Interaction tree
      case 'get_tree':
        return withMonitoring(name, args, () =>
          handlers.handleGetTree(args as Parameters<typeof handlers.handleGetTree>[0])
        );

      // Agent
      case 'execute_intent': {
        return withMonitoring(name, args, async () => {
          const result = await executeIntentWithAgent(
            args as unknown as ExecuteIntentInput,
            DEFAULT_CONFIG
          );
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        });
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }
  });
}

// Export for testing
export { executeIntentWithAgent };
