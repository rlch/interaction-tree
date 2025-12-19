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
import type { VMServiceClient } from '../vm/client.js';
import type { BatchStep } from '../vm/types.js';
import type { AgentStreamEvent } from '../ws/protocol.js';

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
 * Takes VMClient as optional parameter - tools will return helpful errors if not connected.
 */
function createInteractionTreeMcpServer(vmClient?: VMServiceClient) {
  const notConnectedError = {
    content: [{ type: 'text' as const, text: 'Error: No Flutter app connected. Start an app first with run_app or wait for it to connect.' }],
  };

  const getStatusTool = tool(
    'getStatus',
    'Get the current connection status.',
    {},
    async () => {
      if (!vmClient) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ connected: false, message: 'No Flutter app connected' }, null, 2) }] };
      }
      const status = await vmClient.getStatus();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }],
      };
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
          content: [{ type: 'text' as const, text: JSON.stringify(tree, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error getting tree: ${err instanceof Error ? err.message : String(err)}` }],
        };
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
      if (!vmClient || !vmClient.isConnected) {
        return notConnectedError;
      }
      try {
        const result = await vmClient.execute(args.id, args.interaction, args.args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error executing ${args.interaction} on ${args.id}: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  const getStateTool = tool(
    'getState',
    'Get the current state of a widget.',
    { id: z.string() },
    async (args) => {
      if (!vmClient || !vmClient.isConnected) {
        return notConnectedError;
      }
      try {
        const state = await vmClient.getState(args.id);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error getting state for ${args.id}: ${err instanceof Error ? err.message : String(err)}` }],
        };
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
      if (!vmClient || !vmClient.isConnected) {
        return notConnectedError;
      }
      try {
        const result = await vmClient.batch(args.steps as BatchStep[]);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error executing batch: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  const hotReloadTool = tool('hotReload', 'Hot reload the app to apply code changes.', {}, async () => {
    if (!vmClient || !vmClient.isConnected) {
      return notConnectedError;
    }
    try {
      const result = await vmClient.hotReload();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error during hot reload: ${err instanceof Error ? err.message : String(err)}` }],
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
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error during hot restart: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  });

  const getLogsTool = tool(
    'getLogs',
    'Get recent logs from the Flutter app.',
    { since: z.string().optional() },
    async (args) => {
      if (!vmClient || !vmClient.isConnected) {
        return notConnectedError;
      }
      try {
        const logs = await vmClient.getLogs(args.since);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ logs }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error getting logs: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  const getErrorsTool = tool('getErrors', 'Get runtime errors from the app.', {}, async () => {
    if (!vmClient || !vmClient.isConnected) {
      return notConnectedError;
    }
    try {
      const errors = await vmClient.getRuntimeErrors();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ errors }, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error getting errors: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  });

  return createSdkMcpServer({
    name: 'interaction-tree',
    version: '0.1.0',
    tools: [
      getStatusTool,
      getTreeTool,
      executeTool,
      getStateTool,
      batchTool,
      hotReloadTool,
      hotRestartTool,
      getLogsTool,
      getErrorsTool,
    ],
  });
}

export type AgentStreamCallback = (event: Omit<AgentStreamEvent, 'type' | 'id' | 'sessionId'>) => void;

/**
 * Execute an agent with the interaction tree tools bound to a specific VMClient.
 * VMClient is optional - the agent can still respond but app-specific tools will fail gracefully.
 */
export async function executeAgent(
  systemPrompt: string,
  userMessage: string,
  config: AgentExecutorConfig,
  vmClient?: VMServiceClient,
  onEvent?: AgentStreamCallback
): Promise<AgentExecutionResult> {
  const mcpServer = createInteractionTreeMcpServer(vmClient);

  const options: Options = {
    cwd: config.cwd,
    maxTurns: config.maxTurns,
    systemPrompt,
    mcpServers: {
      'interaction-tree': mcpServer,
    },
    allowedTools: [
      'mcp__interaction-tree__getStatus',
      'mcp__interaction-tree__getTree',
      'mcp__interaction-tree__execute',
      'mcp__interaction-tree__getState',
      'mcp__interaction-tree__batch',
      'mcp__interaction-tree__hotReload',
      'mcp__interaction-tree__hotRestart',
      'mcp__interaction-tree__getLogs',
      'mcp__interaction-tree__getErrors',
    ],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,  // Enable streaming
  };

  options.model = config.model ?? DEFAULT_MODEL;

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
          } else if (block.type === 'tool_use') {
            onEvent?.({ event: { kind: 'tool_call_start', toolName: block.name, toolCallId: block.id } });
          }
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
    vmClient?: VMServiceClient;
    sessionId: string;
    cwd: string;
    onEvent?: AgentStreamCallback;
  }): Promise<AgentExecutionResult> {
    const { intent, vmClient, cwd, onEvent } = options;

    const { AGENT_SYSTEM_PROMPT } = await import('./prompts.js');
    const config = getDefaultAgentConfig(cwd, this.config);

    // Resume existing session if we have one
    if (this.sdkSessionId) {
      config.resume = this.sdkSessionId;
    }

    // vmClient may be undefined - the MCP tools handle this gracefully
    const result = await executeAgent(AGENT_SYSTEM_PROMPT, intent, config, vmClient, onEvent);

    // Store the session ID for future resumption
    if (result.sessionId) {
      this.sdkSessionId = result.sessionId;
    }

    return result;
  }
}
