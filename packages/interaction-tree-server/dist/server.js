/**
 * MCP Server for interaction tree.
 * Supports two modes:
 * - agent (default): AI-powered intent interpretation
 * - raw: Direct tool access
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerRawTools, registerAgentTools } from './modes/index.js';
import { getVMClient } from './vm/client.js';
import { startMonitoringServer, getMonitor } from './monitoring/index.js';
export function createServer(config) {
    const server = new Server({
        name: 'interaction-tree-server',
        version: '0.1.0',
    }, {
        capabilities: {
            tools: {},
        },
    });
    // Register tools based on mode
    if (config.mode === 'raw') {
        console.error('[interaction-tree-server] Starting in RAW mode');
        registerRawTools(server);
    }
    else {
        console.error('[interaction-tree-server] Starting in AGENT mode');
        registerAgentTools(server);
    }
    // Set up VM client close handler
    const vmClient = getVMClient();
    vmClient.onClose(() => {
        console.error('[interaction-tree-server] VM connection closed');
        // Could notify the client here if needed
    });
    return server;
}
export async function startServer(config) {
    const server = createServer(config);
    const transport = new StdioServerTransport();
    // Start monitoring WebSocket server unless disabled
    if (!config.disableMonitoring) {
        const monitorPort = config.monitorPort ??
            parseInt(process.env.INTERACTION_TREE_MONITOR_PORT ?? '9000', 10);
        startMonitoringServer({ port: monitorPort });
        const monitor = getMonitor();
        console.error(`[interaction-tree-server] Monitoring instance: ${monitor.getInstanceId()}`);
    }
    await server.connect(transport);
    console.error('[interaction-tree-server] Server started');
}
//# sourceMappingURL=server.js.map