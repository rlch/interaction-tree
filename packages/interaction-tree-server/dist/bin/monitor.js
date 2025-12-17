#!/usr/bin/env node
/**
 * CLI tool for monitoring interaction-tree-server events.
 *
 * Usage:
 *   it-monitor                    # Connect to default port 9000
 *   it-monitor 9001               # Connect to specific port
 *   it-monitor 9000 flutter       # Filter by source or type
 *   it-monitor 9000 agent.tool    # Filter by type prefix
 */
import WebSocket from 'ws';
const port = process.argv[2] ?? '9000';
const filter = process.argv[3];
const COLORS = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};
const SOURCE_COLORS = {
    flutter: COLORS.green,
    agent: COLORS.blue,
    vm: COLORS.yellow,
    mcp: COLORS.cyan,
    interaction_tree: COLORS.magenta,
};
const LEVEL_ICONS = {
    error: '✗',
    warn: '!',
    info: '•',
    debug: '·',
};
function formatEvent(event) {
    const time = event.ts.split('T')[1]?.slice(0, 12) ?? event.ts;
    const color = SOURCE_COLORS[event.source] ?? COLORS.white;
    const icon = LEVEL_ICONS[event.level ?? 'info'] ?? '•';
    const payload = typeof event.payload === 'object'
        ? JSON.stringify(event.payload)
        : String(event.payload);
    return `${COLORS.dim}${time}${COLORS.reset} ${icon} ${color}[${event.source}]${COLORS.reset} ${COLORS.bold}${event.type}${COLORS.reset} ${payload}`;
}
function shouldInclude(event) {
    if (!filter)
        return true;
    return event.type.includes(filter) || event.source === filter;
}
const ws = new WebSocket(`ws://127.0.0.1:${port}`);
ws.on('open', () => {
    console.error(`${COLORS.dim}Connected to ws://127.0.0.1:${port}${COLORS.reset}`);
    if (filter) {
        console.error(`${COLORS.dim}Filter: ${filter}${COLORS.reset}`);
    }
    console.error('');
});
ws.on('message', (data) => {
    try {
        const event = JSON.parse(data.toString());
        if (shouldInclude(event)) {
            console.log(formatEvent(event));
        }
    }
    catch {
        console.error(`${COLORS.red}Invalid event: ${data.toString()}${COLORS.reset}`);
    }
});
ws.on('error', (err) => {
    console.error(`${COLORS.red}Connection error: ${err.message}${COLORS.reset}`);
    process.exit(1);
});
ws.on('close', () => {
    console.error(`${COLORS.dim}Connection closed${COLORS.reset}`);
    process.exit(0);
});
process.on('SIGINT', () => {
    ws.close();
});
//# sourceMappingURL=monitor.js.map