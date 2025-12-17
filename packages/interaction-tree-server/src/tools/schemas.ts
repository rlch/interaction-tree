/**
 * JSON Schema definitions for MCP tools.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Session Management
// ─────────────────────────────────────────────────────────────────────────────

export const createSessionSchema = {
  type: 'object' as const,
  properties: {
    name: {
      type: 'string',
      description: 'Human-readable name for the session',
    },
    projectPath: {
      type: 'string',
      description: 'Absolute path to the Flutter project directory',
    },
  },
  required: ['name', 'projectPath'],
};

export const destroySessionSchema = {
  type: 'object' as const,
  properties: {
    session: {
      type: 'string',
      description: 'Session name or ID to destroy',
    },
  },
  required: ['session'],
};

export const listSessionsSchema = {
  type: 'object' as const,
  properties: {},
};

export const connectSchema = {
  type: 'object' as const,
  properties: {
    session: {
      type: 'string',
      description: 'Session name or ID to connect to',
    },
  },
  required: ['session'],
};

export const disconnectSchema = {
  type: 'object' as const,
  properties: {},
};

// ─────────────────────────────────────────────────────────────────────────────
// App Lifecycle (requires connected session)
// ─────────────────────────────────────────────────────────────────────────────

export const runSchema = {
  type: 'object' as const,
  properties: {
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
};

export const stopSchema = {
  type: 'object' as const,
  properties: {},
};

export const rebuildSchema = {
  type: 'object' as const,
  properties: {
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
};

export const getStatusSchema = {
  type: 'object' as const,
  properties: {},
};

export const hotReloadSchema = {
  type: 'object' as const,
  properties: {},
};

export const hotRestartSchema = {
  type: 'object' as const,
  properties: {},
};

export const getLogsSchema = {
  type: 'object' as const,
  properties: {
    maxLines: {
      type: 'number',
      description: 'Maximum number of log lines to return (default: 100)',
    },
  },
};

export const getErrorsSchema = {
  type: 'object' as const,
  properties: {
    clear: {
      type: 'boolean',
      description: 'Clear errors after retrieving',
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Interaction Tree (requires connected session with running app)
// ─────────────────────────────────────────────────────────────────────────────

export const getTreeSchema = {
  type: 'object' as const,
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
  type: 'object' as const,
  properties: {
    id: {
      type: 'string',
      description: 'The InteractionKey id of the target',
    },
  },
  required: ['id'],
};

export const enterTextSchema = {
  type: 'object' as const,
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
  type: 'object' as const,
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
  type: 'object' as const,
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
  type: 'object' as const,
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
  type: 'object' as const,
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
  type: 'object' as const,
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

// ─────────────────────────────────────────────────────────────────────────────
// Agent Mode
// ─────────────────────────────────────────────────────────────────────────────

export const executeIntentSchema = {
  type: 'object' as const,
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
