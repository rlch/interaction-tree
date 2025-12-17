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
 * Takes VMClient as parameter so it's bound to a specific session.
 */
function createInteractionTreeMcpServer(vmClient: VMServiceClient) {
  const getStatusTool = tool(
    'getStatus',
    'Get the current connection status.',
    {},
    async () => {
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
      if (!vmClient.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app.' }],
        };
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
      if (!vmClient.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app.' }],
        };
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
      if (!vmClient.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app.' }],
        };
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
      if (!vmClient.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app.' }],
        };
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
    if (!vmClient.isConnected) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app.' }],
      };
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
    if (!vmClient.isConnected) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app.' }],
      };
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
      if (!vmClient.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app.' }],
        };
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
    if (!vmClient.isConnected) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app.' }],
      };
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

/**
 * Execute an agent with the interaction tree tools bound to a specific VMClient.
 */
export async function executeAgent(
  systemPrompt: string,
  userMessage: string,
  config: AgentExecutorConfig,
  vmClient: VMServiceClient
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
  };

  if (config.model) {
    options.model = config.model;
  }

  try {
    // Accumulate all text content from assistant messages
    const textBlocks: string[] = [];

    for await (const message of query({ prompt: userMessage, options })) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            textBlocks.push(block.text);
          }
        }
      }

      if (message.type === 'result') {
        if (message.subtype !== 'success') {
          const errorMsg =
            'errors' in message ? message.errors.join(', ') : 'Unknown error';
          return {
            status: 'failed',
            error: errorMsg,
          };
        }
      }
    }

    // Use the last non-empty text block as final content, but check all for ASK_CONTEXT
    const allContent = textBlocks.join('\n');
    const finalContent = textBlocks.filter(t => t.trim()).pop() ?? '';

    // Check all content for ASK_CONTEXT pattern (might not be in last block)
    const askContext = parseAskContext(allContent);
    if (askContext.isAskContext) {
      return {
        status: 'needs_context',
        question: askContext.question,
        suggestions: askContext.suggestions,
      };
    }

    return {
      status: 'success',
      summary: finalContent,
    };
  } catch (err) {
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
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
 */
export class AgentExecutor {
  private config: Partial<AgentConfig>;

  constructor(config?: Partial<AgentConfig>) {
    this.config = config ?? {};
  }

  async execute(options: {
    intent: string;
    conversationId?: string;
    vmClient?: VMServiceClient;
    sessionId: string;
    cwd: string;
  }): Promise<AgentExecutionResult> {
    const { intent, vmClient, cwd } = options;

    if (!vmClient) {
      return {
        status: 'failed',
        error: 'No VM client available for this session',
      };
    }

    const { AGENT_SYSTEM_PROMPT } = await import('./prompts.js');
    const config = getDefaultAgentConfig(cwd, this.config);

    return executeAgent(AGENT_SYSTEM_PROMPT, intent, config, vmClient);
  }
}
