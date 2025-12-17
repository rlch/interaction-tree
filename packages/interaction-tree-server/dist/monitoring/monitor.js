/**
 * Monitoring event bus singleton.
 * Emits structured events that can be consumed by WebSocket clients, CLI tools, etc.
 */
import { EventEmitter } from 'events';
const LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
class Monitor extends EventEmitter {
    instanceId;
    minLevel;
    filter;
    logToStderr;
    constructor(config = {}) {
        super();
        this.instanceId =
            config.instanceId ??
                process.env.INTERACTION_TREE_INSTANCE_ID ??
                `it-${Date.now().toString(36)}`;
        this.minLevel =
            config.minLevel ??
                process.env.INTERACTION_TREE_MONITOR_LEVEL ??
                'info';
        this.filter = config.filter
            ? new Set(config.filter)
            : process.env.INTERACTION_TREE_MONITOR_FILTER
                ? new Set(process.env.INTERACTION_TREE_MONITOR_FILTER.split(','))
                : null;
        this.logToStderr = config.logToStderr ?? true;
    }
    emitEvent(source, type, payload, level = 'info') {
        if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
            return false;
        }
        if (this.filter && !this.filter.has(type) && !this.filter.has(source)) {
            return false;
        }
        const event = {
            ts: new Date().toISOString(),
            instanceId: this.instanceId,
            source,
            type,
            level,
            payload,
        };
        if (this.logToStderr) {
            const levelIcon = { error: '❌', warn: '⚠️', info: 'ℹ️', debug: '🔍' }[level] ?? '•';
            console.error(`${levelIcon} [${source}] ${type}: ${JSON.stringify(payload)}`);
        }
        return super.emit('event', event);
    }
    flutter = {
        log: (line, stderr = false) => {
            this.emitEvent('flutter', 'flutter.log', { line, stderr }, stderr ? 'warn' : 'debug');
        },
        lifecycle: (status, details) => {
            this.emitEvent('flutter', 'flutter.lifecycle', { status, ...details }, status === 'error' ? 'error' : 'info');
        },
    };
    vm = {
        connected: (uri) => {
            this.emitEvent('vm', 'vm.connected', { uri }, 'info');
        },
        disconnected: (uri) => {
            this.emitEvent('vm', 'vm.disconnected', { uri }, 'info');
        },
        error: (message, stack) => {
            this.emitEvent('vm', 'vm.error', { message, stack }, 'error');
        },
    };
    agent = {
        toolCall: (toolName, args, conversationId) => {
            this.emitEvent('agent', 'agent.tool_call', { toolName, args, conversationId }, 'info');
        },
        toolResult: (toolName, durationMs, status, details) => {
            this.emitEvent('agent', 'agent.tool_result', { toolName, durationMs, status, ...details }, status === 'error' ? 'error' : 'info');
        },
    };
    mcp = {
        request: (method, toolName, args) => {
            this.emitEvent('mcp', 'mcp.request', { method, toolName, args }, 'debug');
        },
        response: (method, durationMs, success, details) => {
            this.emitEvent('mcp', 'mcp.response', { method, durationMs, success, ...details }, success ? 'debug' : 'error');
        },
    };
    tree = {
        snapshot: (nodeCount, rootIds, tree) => {
            this.emitEvent('interaction_tree', 'interaction_tree.snapshot', { nodeCount, rootIds, tree }, 'debug');
        },
        diff: (added, removed, changed) => {
            this.emitEvent('interaction_tree', 'interaction_tree.diff', { added, removed, changed }, 'info');
        },
    };
    subscribe(listener) {
        this.on('event', listener);
        return () => this.off('event', listener);
    }
    getInstanceId() {
        return this.instanceId;
    }
}
let monitor = null;
export function getMonitor(config) {
    if (!monitor) {
        monitor = new Monitor(config);
    }
    return monitor;
}
export function resetMonitor() {
    monitor = null;
}
//# sourceMappingURL=monitor.js.map