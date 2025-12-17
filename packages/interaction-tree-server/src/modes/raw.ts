/**
 * Raw mode - direct tool access without AI agent.
 * Registers all interaction tree and dart tooling tools directly.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as schemas from '../tools/schemas.js';
import * as handlers from '../tools/handlers.js';
import type { RunOptions, RebuildOptions } from '../flutter/app-manager.js';
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
    const isError = typeof result === 'object' && result !== null &&
      'content' in result &&
      Array.isArray((result as { content: unknown[] }).content) &&
      (result as { content: Array<{ text?: string }> }).content[0]?.text?.startsWith('Error:');
    monitor.mcp.response('tools/call', durationMs, !isError, {
      toolName,
      error: isError ? (result as { content: Array<{ text: string }> }).content[0]?.text : undefined,
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

export function registerRawTools(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // ───────────────────────────────────────────────────────────────────────
      // Lifecycle Management
      // ───────────────────────────────────────────────────────────────────────
      {
        name: 'run',
        description:
          'Run a Flutter app. Spawns flutter run, captures VM service URI, and auto-connects.',
        inputSchema: schemas.runSchema,
      },
      {
        name: 'stop',
        description: 'Stop the running Flutter app.',
        inputSchema: schemas.stopSchema,
      },
      {
        name: 'list',
        description: 'List all running Flutter app instances.',
        inputSchema: schemas.listSchema,
      },
      {
        name: 'rebuild',
        description:
          'Full rebuild - stops the app, optionally runs flutter clean, then runs again.',
        inputSchema: schemas.rebuildSchema,
      },
      {
        name: 'get_status',
        description: 'Get the current app status (process state and VM connection).',
        inputSchema: schemas.getStatusSchema,
      },
      {
        name: 'hot_reload',
        description:
          'Hot reload - apply code changes while preserving app state.',
        inputSchema: schemas.hotReloadSchema,
      },
      {
        name: 'hot_restart',
        description:
          'Hot restart - apply code changes and reset app state (same process).',
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

      // ───────────────────────────────────────────────────────────────────────
      // Interaction Tree
      // ───────────────────────────────────────────────────────────────────────
      {
        name: 'get_tree',
        description:
          'Get all InteractionKey-marked widgets from the running Flutter app.',
        inputSchema: schemas.getTreeSchema,
      },
      {
        name: 'tap',
        description: 'Tap on a widget by its InteractionKey id.',
        inputSchema: schemas.targetIdSchema,
      },
      {
        name: 'double_tap',
        description: 'Double-tap on a widget by its InteractionKey id.',
        inputSchema: schemas.targetIdSchema,
      },
      {
        name: 'long_press',
        description: 'Long-press on a widget by its InteractionKey id.',
        inputSchema: schemas.targetIdSchema,
      },
      {
        name: 'enter_text',
        description: 'Enter text into a text field by its InteractionKey id.',
        inputSchema: schemas.enterTextSchema,
      },
      {
        name: 'clear_text',
        description: 'Clear text from a text field by its InteractionKey id.',
        inputSchema: schemas.targetIdSchema,
      },
      {
        name: 'scroll',
        description: 'Scroll a scrollable widget by its InteractionKey id.',
        inputSchema: schemas.scrollSchema,
      },
      {
        name: 'drag',
        description: 'Drag a widget by its InteractionKey id.',
        inputSchema: schemas.scrollSchema,
      },
      {
        name: 'scroll_into_view',
        description: 'Scroll to make a widget visible.',
        inputSchema: schemas.scrollIntoViewSchema,
      },
      {
        name: 'wait_for',
        description: 'Wait for a widget to reach a certain state.',
        inputSchema: schemas.waitForSchema,
      },
      {
        name: 'get_state',
        description: 'Get the current state of a widget.',
        inputSchema: schemas.targetIdSchema,
      },
      {
        name: 'execute_action',
        description:
          'Execute a custom action defined on a widget via InteractableMixin.',
        inputSchema: schemas.executeActionSchema,
      },
      {
        name: 'batch',
        description: 'Execute multiple interactions in sequence.',
        inputSchema: schemas.batchSchema,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      // Lifecycle Management
      case 'run':
        return withMonitoring(name, args, () =>
          handlers.handleRun(args as unknown as RunOptions));
      case 'stop':
        return withMonitoring(name, args, () =>
          handlers.handleStop(args as { instanceId?: string }));
      case 'list':
        return withMonitoring(name, args, () => handlers.handleList());
      case 'rebuild':
        return withMonitoring(name, args, () =>
          handlers.handleRebuild(args as unknown as RebuildOptions & { instanceId?: string }));
      case 'get_status':
        return withMonitoring(name, args, () =>
          handlers.handleGetStatus(args as { instanceId?: string }));
      case 'hot_reload':
        return withMonitoring(name, args, () =>
          handlers.handleHotReload(args as { instanceId?: string }));
      case 'hot_restart':
        return withMonitoring(name, args, () =>
          handlers.handleHotRestart(args as { instanceId?: string }));
      case 'get_logs':
        return withMonitoring(name, args, () =>
          handlers.handleGetLogs(args as { maxLines?: number; instanceId?: string }));
      case 'get_errors':
        return withMonitoring(name, args, () =>
          handlers.handleGetErrors(args as { instanceId?: string }));

      // Interaction Tree
      case 'get_tree':
        return withMonitoring(name, args, () =>
          handlers.handleGetTree(args as Parameters<typeof handlers.handleGetTree>[0]));
      case 'tap':
        return withMonitoring(name, args, () =>
          handlers.handleTap(args as { id: string; instanceId?: string }));
      case 'double_tap':
        return withMonitoring(name, args, () =>
          handlers.handleDoubleTap(args as { id: string; instanceId?: string }));
      case 'long_press':
        return withMonitoring(name, args, () =>
          handlers.handleLongPress(args as { id: string; instanceId?: string }));
      case 'enter_text':
        return withMonitoring(name, args, () =>
          handlers.handleEnterText(args as { id: string; text: string; instanceId?: string }));
      case 'clear_text':
        return withMonitoring(name, args, () =>
          handlers.handleClearText(args as { id: string; instanceId?: string }));
      case 'scroll':
        return withMonitoring(name, args, () =>
          handlers.handleScroll(args as { id: string; dx?: number; dy?: number; instanceId?: string }));
      case 'drag':
        return withMonitoring(name, args, () =>
          handlers.handleDrag(args as { id: string; dx?: number; dy?: number; instanceId?: string }));
      case 'scroll_into_view':
        return withMonitoring(name, args, () =>
          handlers.handleScrollIntoView(args as { id: string; alignment?: number; instanceId?: string }));
      case 'wait_for':
        return withMonitoring(name, args, () =>
          handlers.handleWaitFor(args as Parameters<typeof handlers.handleWaitFor>[0]));
      case 'get_state':
        return withMonitoring(name, args, () =>
          handlers.handleGetState(args as { id: string; instanceId?: string }));
      case 'execute_action':
        return withMonitoring(name, args, () =>
          handlers.handleExecuteAction(args as Parameters<typeof handlers.handleExecuteAction>[0]));
      case 'batch':
        return withMonitoring(name, args, () =>
          handlers.handleBatch(args as Parameters<typeof handlers.handleBatch>[0]));

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        };
    }
  });
}
