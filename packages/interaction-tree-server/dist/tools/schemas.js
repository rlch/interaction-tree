/**
 * JSON Schema definitions for MCP tools.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Management
// ─────────────────────────────────────────────────────────────────────────────
export const runSchema = {
    type: 'object',
    properties: {
        projectPath: {
            type: 'string',
            description: 'Absolute path to the Flutter project directory',
        },
        name: {
            type: 'string',
            description: 'Human-readable name for this instance (optional)',
        },
        device: {
            type: 'string',
            description: 'Device ID to run on (e.g., "macos", "chrome", "emulator-5554")',
        },
        flavor: {
            type: 'string',
            description: 'Build flavor to use',
        },
        target: {
            type: 'string',
            description: 'Target file to run (default: lib/main.dart)',
        },
        dartDefines: {
            type: 'object',
            description: 'Dart define flags as key-value pairs',
        },
        additionalArgs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional arguments to pass to flutter run',
        },
    },
    required: ['projectPath'],
};
export const stopSchema = {
    type: 'object',
    properties: {
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
    },
};
export const listSchema = {
    type: 'object',
    properties: {},
};
export const rebuildSchema = {
    type: 'object',
    properties: {
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
        projectPath: {
            type: 'string',
            description: 'Absolute path to the Flutter project directory',
        },
        device: {
            type: 'string',
            description: 'Device ID to run on',
        },
        flavor: {
            type: 'string',
            description: 'Build flavor to use',
        },
        target: {
            type: 'string',
            description: 'Target file to run (default: lib/main.dart)',
        },
        clean: {
            type: 'boolean',
            description: 'Run flutter clean before rebuilding',
        },
        dartDefines: {
            type: 'object',
            description: 'Dart define flags as key-value pairs',
        },
        additionalArgs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional arguments to pass to flutter run',
        },
    },
    required: ['projectPath'],
};
export const getTreeSchema = {
    type: 'object',
    properties: {
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
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
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
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
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
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
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
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
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
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
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
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
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
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
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
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
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
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
    properties: {
        instanceId: {
            type: 'string',
            description: 'Instance ID or name. If not provided, returns list of all instances.',
        },
    },
};
export const hotReloadSchema = {
    type: 'object',
    properties: {
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
    },
};
export const hotRestartSchema = {
    type: 'object',
    properties: {
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
    },
};
export const getLogsSchema = {
    type: 'object',
    properties: {
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
        maxLines: {
            type: 'number',
            description: 'Maximum number of log lines to return (default: 100)',
        },
    },
};
export const getErrorsSchema = {
    type: 'object',
    properties: {
        instanceId: {
            type: 'string',
            description: 'Instance ID or name (optional if only one instance running)',
        },
        clear: {
            type: 'boolean',
            description: 'Clear errors after retrieving',
        },
    },
};
//# sourceMappingURL=schemas.js.map