/**
 * JSON Schema definitions for MCP tools.
 */
export const connectSchema = {
    type: 'object',
    properties: {
        uri: {
            type: 'string',
            description: 'The VM service WebSocket URI (e.g., ws://127.0.0.1:12345/xxx=/ws)',
        },
    },
    required: ['uri'],
};
export const disconnectSchema = {
    type: 'object',
    properties: {},
};
export const getTreeSchema = {
    type: 'object',
    properties: {
        includeBounds: {
            type: 'boolean',
            description: 'Include global x/y/width/height for each target',
        },
        includeWidgetType: {
            type: 'boolean',
            description: 'Include the Flutter widget type name',
        },
        includeState: {
            type: 'boolean',
            description: 'Include current state (text value, enabled, visible) for each target',
        },
    },
};
export const targetIdSchema = {
    type: 'object',
    properties: {
        id: {
            type: 'string',
            description: 'The InteractionKey id of the target',
        },
    },
    required: ['id'],
};
export const enterTextSchema = {
    type: 'object',
    properties: {
        id: {
            type: 'string',
            description: 'The InteractionKey id of the target',
        },
        text: {
            type: 'string',
            description: 'The text to enter',
        },
    },
    required: ['id', 'text'],
};
export const scrollSchema = {
    type: 'object',
    properties: {
        id: {
            type: 'string',
            description: 'The InteractionKey id of the target',
        },
        dx: {
            type: 'number',
            description: 'Horizontal scroll delta',
        },
        dy: {
            type: 'number',
            description: 'Vertical scroll delta',
        },
    },
    required: ['id'],
};
export const scrollIntoViewSchema = {
    type: 'object',
    properties: {
        id: {
            type: 'string',
            description: 'The InteractionKey id of the target',
        },
        alignment: {
            type: 'number',
            description: 'Where to position the widget: 0.0 = top/start, 0.5 = center, 1.0 = bottom/end',
        },
    },
    required: ['id'],
};
export const waitForSchema = {
    type: 'object',
    properties: {
        id: {
            type: 'string',
            description: 'The InteractionKey id of the target',
        },
        condition: {
            type: 'string',
            enum: ['exists', 'notExists', 'visible', 'notVisible'],
            description: 'The condition to wait for',
        },
        timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 10000)',
        },
    },
    required: ['id'],
};
export const executeActionSchema = {
    type: 'object',
    properties: {
        id: {
            type: 'string',
            description: 'The InteractionKey id of the target',
        },
        actionName: {
            type: 'string',
            description: 'The name of the action to execute',
        },
        args: {
            type: 'object',
            description: 'Arguments to pass to the action',
        },
    },
    required: ['id', 'actionName'],
};
export const batchSchema = {
    type: 'object',
    properties: {
        steps: {
            type: 'array',
            description: 'Array of step objects',
            items: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: [
                            'tap',
                            'doubleTap',
                            'longPress',
                            'enterText',
                            'clearText',
                            'drag',
                            'scroll',
                            'scrollIntoView',
                            'waitFor',
                            'executeAction',
                        ],
                    },
                    id: { type: 'string' },
                    text: { type: 'string' },
                    dx: { type: 'number' },
                    dy: { type: 'number' },
                    alignment: { type: 'number' },
                    actionName: { type: 'string' },
                    args: { type: 'object' },
                    condition: { type: 'string' },
                    timeoutMs: { type: 'number' },
                    settle: { type: 'boolean' },
                },
                required: ['action', 'id'],
            },
        },
    },
    required: ['steps'],
};
export const executeIntentSchema = {
    type: 'object',
    properties: {
        intent: {
            type: 'string',
            description: 'The natural language intent to execute',
        },
        context: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional file contents or other context',
        },
        conversationId: {
            type: 'string',
            description: 'Continue a previous conversation',
        },
        answer: {
            type: 'string',
            description: 'Answer to a previous needs_context question',
        },
    },
    required: ['intent'],
};
export const getStatusSchema = {
    type: 'object',
    properties: {},
};
export const hotReloadSchema = {
    type: 'object',
    properties: {},
};
export const hotRestartSchema = {
    type: 'object',
    properties: {},
};
export const getLogsSchema = {
    type: 'object',
    properties: {
        since: {
            type: 'string',
            description: 'ISO timestamp to get logs since',
        },
    },
};
export const getErrorsSchema = {
    type: 'object',
    properties: {
        clear: {
            type: 'boolean',
            description: 'Clear errors after retrieving',
        },
    },
};
//# sourceMappingURL=schemas.js.map