/**
 * Raw mode - direct tool access without AI agent.
 * Registers all interaction tree and dart tooling tools directly.
 */
import { ListToolsRequestSchema, CallToolRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import * as schemas from '../tools/schemas.js';
import * as handlers from '../tools/handlers.js';
export function registerRawTools(server) {
    // Connection tools
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
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
            // Interaction Tree tools
            {
                name: 'get_tree',
                description: 'Get all InteractionKey-marked widgets from the connected Flutter app.',
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
            // Dart Tooling tools
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
            // Connection
            case 'connect':
                return handlers.handleConnect(args);
            case 'disconnect':
                return handlers.handleDisconnect();
            case 'get_status':
                return handlers.handleGetStatus();
            // Interaction Tree
            case 'get_tree':
                return handlers.handleGetTree(args);
            case 'tap':
                return handlers.handleTap(args);
            case 'double_tap':
                return handlers.handleDoubleTap(args);
            case 'long_press':
                return handlers.handleLongPress(args);
            case 'enter_text':
                return handlers.handleEnterText(args);
            case 'clear_text':
                return handlers.handleClearText(args);
            case 'scroll':
                return handlers.handleScroll(args);
            case 'drag':
                return handlers.handleDrag(args);
            case 'scroll_into_view':
                return handlers.handleScrollIntoView(args);
            case 'wait_for':
                return handlers.handleWaitFor(args);
            case 'get_state':
                return handlers.handleGetState(args);
            case 'execute_action':
                return handlers.handleExecuteAction(args);
            case 'batch':
                return handlers.handleBatch(args);
            // Dart Tooling
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
                    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                };
        }
    });
}
//# sourceMappingURL=raw.js.map