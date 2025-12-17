/**
 * Raw mode - direct tool access without AI agent.
 * Registers all interaction tree and dart tooling tools directly.
 */
import { ListToolsRequestSchema, CallToolRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import * as schemas from '../tools/schemas.js';
import * as handlers from '../tools/handlers.js';
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
export function registerRawTools(server) {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            // ───────────────────────────────────────────────────────────────────────
            // Lifecycle Management
            // ───────────────────────────────────────────────────────────────────────
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
                name: 'list',
                description: 'List all running Flutter app instances.',
                inputSchema: schemas.listSchema,
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
                name: 'hot_reload',
                description: 'Hot reload - apply code changes while preserving app state.',
                inputSchema: schemas.hotReloadSchema,
            },
            {
                name: 'hot_restart',
                description: 'Hot restart - apply code changes and reset app state (same process).',
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
                description: 'Get all InteractionKey-marked widgets from the running Flutter app.',
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
                description: 'Execute a custom action defined on a widget via InteractableMixin.',
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
                return withMonitoring(name, args, () => handlers.handleRun(args));
            case 'stop':
                return withMonitoring(name, args, () => handlers.handleStop(args));
            case 'list':
                return withMonitoring(name, args, () => handlers.handleList());
            case 'rebuild':
                return withMonitoring(name, args, () => handlers.handleRebuild(args));
            case 'get_status':
                return withMonitoring(name, args, () => handlers.handleGetStatus(args));
            case 'hot_reload':
                return withMonitoring(name, args, () => handlers.handleHotReload(args));
            case 'hot_restart':
                return withMonitoring(name, args, () => handlers.handleHotRestart(args));
            case 'get_logs':
                return withMonitoring(name, args, () => handlers.handleGetLogs(args));
            case 'get_errors':
                return withMonitoring(name, args, () => handlers.handleGetErrors(args));
            // Interaction Tree
            case 'get_tree':
                return withMonitoring(name, args, () => handlers.handleGetTree(args));
            case 'tap':
                return withMonitoring(name, args, () => handlers.handleTap(args));
            case 'double_tap':
                return withMonitoring(name, args, () => handlers.handleDoubleTap(args));
            case 'long_press':
                return withMonitoring(name, args, () => handlers.handleLongPress(args));
            case 'enter_text':
                return withMonitoring(name, args, () => handlers.handleEnterText(args));
            case 'clear_text':
                return withMonitoring(name, args, () => handlers.handleClearText(args));
            case 'scroll':
                return withMonitoring(name, args, () => handlers.handleScroll(args));
            case 'drag':
                return withMonitoring(name, args, () => handlers.handleDrag(args));
            case 'scroll_into_view':
                return withMonitoring(name, args, () => handlers.handleScrollIntoView(args));
            case 'wait_for':
                return withMonitoring(name, args, () => handlers.handleWaitFor(args));
            case 'get_state':
                return withMonitoring(name, args, () => handlers.handleGetState(args));
            case 'execute_action':
                return withMonitoring(name, args, () => handlers.handleExecuteAction(args));
            case 'batch':
                return withMonitoring(name, args, () => handlers.handleBatch(args));
            default:
                return {
                    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                };
        }
    });
}
//# sourceMappingURL=raw.js.map