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
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types/agent.js';
import { getVMClient } from '../vm/client.js';
import type { BatchStep } from '../types/interaction-tree.js';

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
 */
function createInteractionTreeMcpServer() {
  const connectTool = tool(
    'connect',
    'Connect to a Flutter app via its VM service WebSocket URI.',
    { uri: z.string().describe('The VM service WebSocket URI (e.g., ws://127.0.0.1:12345/xxx=/ws)') },
    async (args) => {
      const client = getVMClient();
      try {
        await client.connect(args.uri);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ connected: true, uri: args.uri }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error connecting: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    }
  );

  const getStatusTool = tool(
    'getStatus',
    'Get the current connection status.',
    {},
    async () => {
      const client = getVMClient();
      const status = await client.getStatus();
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
      const client = getVMClient();
      if (!client.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app. Use connect tool first.' }],
        };
      }
      try {
        const tree = await client.getTree({
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
      const client = getVMClient();
      if (!client.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app. Use connect tool first.' }],
        };
      }
      try {
        const result = await client.execute(args.id, args.interaction, args.args);
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
      const client = getVMClient();
      if (!client.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app. Use connect tool first.' }],
        };
      }
      try {
        const state = await client.getState(args.id);
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
      const client = getVMClient();
      if (!client.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app. Use connect tool first.' }],
        };
      }
      try {
        const result = await client.batch(args.steps as BatchStep[]);
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
    const client = getVMClient();
    if (!client.isConnected) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app. Use connect tool first.' }],
      };
    }
    try {
      const result = await client.hotReload();
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
    const client = getVMClient();
    if (!client.isConnected) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app. Use connect tool first.' }],
      };
    }
    try {
      const result = await client.hotRestart();
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
    'Get recent logs from the Flutter app (note: may return empty if log collection not implemented).',
    { since: z.string().optional() },
    async (args) => {
      const client = getVMClient();
      if (!client.isConnected) {
        return {
          content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app. Use connect tool first.' }],
        };
      }
      try {
        const logs = await client.getLogs(args.since);
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

  const getErrorsTool = tool('getErrors', 'Get runtime errors (note: may return empty if error collection not implemented).', {}, async () => {
    const client = getVMClient();
    if (!client.isConnected) {
      return {
        content: [{ type: 'text' as const, text: 'Error: Not connected to Flutter app. Use connect tool first.' }],
      };
    }
    try {
      const errors = await client.getRuntimeErrors();
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
      connectTool,
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
 * Execute an agent with the interaction tree tools.
 */
export async function executeAgent(
  systemPrompt: string,
  userMessage: string,
  config: AgentExecutorConfig
): Promise<AgentExecutionResult> {
  const mcpServer = createInteractionTreeMcpServer();

  const options: Options = {
    cwd: config.cwd,
    maxTurns: config.maxTurns,
    systemPrompt,
    mcpServers: {
      'interaction-tree': mcpServer,
    },
    allowedTools: [
      'mcp__interaction-tree__connect',
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
  overrides?: Partial<AgentConfig>
): AgentExecutorConfig {
  return {
    maxTurns: overrides?.maxTurns ?? 10,
    cwd: process.cwd(),
    model: overrides?.model,
  };
}
