#!/usr/bin/env node
/**
 * Fleeter MCP Proxy
 */
import { v4 as uuidv4 } from 'uuid';
import { DaemonClient } from '../daemon-client.js';
import { McpProxy } from '../proxy.js';
const DAEMON_URL = process.env.FLEETER_DAEMON_URL ?? 'ws://127.0.0.1:9877';
const CLIENT_ID = process.env.FLEETER_CLIENT_ID ?? uuidv4();
async function main() {
    console.error('[mcp-proxy] Starting Fleeter MCP proxy...');
    console.error(`[mcp-proxy] Daemon URL: ${DAEMON_URL}`);
    console.error(`[mcp-proxy] Client ID: ${CLIENT_ID}`);
    const daemonClient = new DaemonClient({
        daemonUrl: DAEMON_URL,
        clientId: CLIENT_ID,
    });
    try {
        await daemonClient.connect();
    }
    catch (err) {
        console.error(`[mcp-proxy] Failed to connect to daemon: ${err}`);
        console.error('[mcp-proxy] Make sure fleeter-daemon is running');
        process.exit(1);
    }
    const proxy = new McpProxy(daemonClient);
    await proxy.start();
}
main().catch((err) => {
    console.error('Failed to start MCP proxy:', err);
    process.exit(1);
});
//# sourceMappingURL=proxy.js.map