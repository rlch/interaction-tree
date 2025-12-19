/**
 * Main Fleeter Daemon class.
 */
import { SessionManager } from './session/index.js';
import { DaemonServer } from './ws/index.js';
import { FlutterProcessManager } from './flutter/index.js';
import { VMServiceClient } from './vm/index.js';
import { log } from './logger.js';
export class Daemon {
    config;
    sessionManager;
    server;
    flutterManager;
    vmClients = new Map();
    running = false;
    constructor(config) {
        this.config = config;
        this.sessionManager = new SessionManager();
        this.flutterManager = new FlutterProcessManager();
        this.server = new DaemonServer(this.sessionManager, this.flutterManager, this.vmClients);
        this.setupFlutterEvents();
    }
    setupFlutterEvents() {
        this.flutterManager.on('started', async (sessionId, vmServiceUri) => {
            log.daemon.info({ sessionId, vmServiceUri }, 'Flutter app started');
            this.sessionManager.updateStatus(sessionId, 'running', { vmServiceUri });
            // Connect VM client
            const vmClient = new VMServiceClient();
            try {
                await vmClient.connect(vmServiceUri);
                this.vmClients.set(sessionId, vmClient);
                log.daemon.info({ sessionId }, 'VM client connected');
                // Listen for real-time tree change events (like DevTools)
                vmClient.on('treeChanged', async () => {
                    log.tree.debug({ sessionId }, 'treeChanged event received');
                    try {
                        // Fetch updated tree and broadcast to clients
                        log.tree.debug({ sessionId }, 'Fetching tree...');
                        const tree = await vmClient.getTree({ summaryOnly: true });
                        log.tree.info({ sessionId, nodeCount: Array.isArray(tree) ? tree.length : 0 }, 'Tree fetched, broadcasting');
                        this.server.broadcastEvent('tree', 'tree.updated', { tree }, sessionId);
                    }
                    catch (err) {
                        log.tree.error({ sessionId, err }, 'Failed to fetch tree on change');
                    }
                });
                vmClient.on('navigation', (route) => {
                    log.tree.info({ sessionId, route }, 'Navigation event');
                    this.server.broadcastEvent('tree', 'tree.navigation', { route }, sessionId);
                });
                vmClient.on('reload', () => {
                    log.tree.info({ sessionId }, 'Reload event');
                    this.server.broadcastEvent('tree', 'tree.reloaded', {}, sessionId);
                });
                vmClient.on('interaction', (event) => {
                    log.daemon.info({ sessionId, ...event }, 'Interaction executed');
                    this.server.broadcastEvent('interaction', 'interaction.executed', event, sessionId);
                });
                // Fetch initial tree after connection
                log.tree.debug({ sessionId }, 'Fetching initial tree...');
                try {
                    const tree = await vmClient.getTree({ summaryOnly: true });
                    log.tree.info({ sessionId, nodeCount: Array.isArray(tree) ? tree.length : 0 }, 'Initial tree fetched');
                    // Debug: log first few nodes with their capabilities
                    if (Array.isArray(tree)) {
                        tree.slice(0, 3).forEach((node, i) => {
                            log.tree.debug({
                                idx: i,
                                id: node.id,
                                widgetType: node.widgetType,
                                capabilities: node.capabilities,
                                actions: node.actions,
                                childCount: node.children?.length ?? 0,
                            }, 'Tree node sample');
                        });
                    }
                    this.server.broadcastEvent('tree', 'tree.updated', { tree }, sessionId);
                }
                catch (err) {
                    log.tree.warn({ sessionId, err }, 'Initial tree fetch failed (extension may not be loaded)');
                }
            }
            catch (err) {
                log.daemon.error({ sessionId, err }, 'Failed to connect VM client');
            }
        });
        this.flutterManager.on('launching', (sessionId, info) => {
            log.daemon.info({ sessionId, ...info }, 'Flutter app launching');
            // Broadcast launching event with device info
            this.server.broadcastEvent('flutter', 'flutter.launching', info, sessionId);
        });
        this.flutterManager.on('exit', (sessionId) => {
            this.sessionManager.updateStatus(sessionId, 'stopped');
            const vmClient = this.vmClients.get(sessionId);
            if (vmClient) {
                vmClient.disconnect();
                this.vmClients.delete(sessionId);
            }
        });
        this.flutterManager.on('log', (sessionId, line) => {
            // Store log in session for persistence across reconnects
            this.sessionManager.addLog(sessionId, line);
            this.server.broadcastEvent('flutter', 'flutter.log', { line }, sessionId);
        });
        this.flutterManager.on('error', (sessionId, err) => {
            console.error(`[daemon] Flutter error for session ${sessionId}: ${err.message}`);
            this.sessionManager.updateStatus(sessionId, 'error', { error: err.message });
            this.server.broadcastEvent('flutter', 'flutter.error', { error: err.message }, sessionId);
        });
        // Broadcast session status changes to connected clients
        this.sessionManager.on('session:status_changed', (session) => {
            this.server.broadcastEvent('session', 'session.status_changed', {
                sessionId: session.id,
                status: session.appStatus,
                pid: session.pid,
                vmServiceUri: session.vmServiceUri,
            }, session.id);
        });
    }
    async start() {
        if (this.running) {
            console.error('[daemon] Already running');
            return;
        }
        this.server.start({ port: this.config.port, host: this.config.host });
        this.running = true;
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        console.error(`[daemon] Fleeter daemon started (PID: ${process.pid})`);
    }
    async shutdown(signal) {
        if (!this.running)
            return;
        console.error(`[daemon] Shutting down${signal ? ` (${signal})` : ''}...`);
        // Stop all Flutter processes
        await this.flutterManager.stopAll();
        // Disconnect all VM clients
        for (const vmClient of this.vmClients.values()) {
            await vmClient.disconnect();
        }
        this.server.stop();
        this.running = false;
        console.error('[daemon] Shutdown complete');
        process.exit(0);
    }
    getSessionManager() {
        return this.sessionManager;
    }
    getFlutterManager() {
        return this.flutterManager;
    }
    getServer() {
        return this.server;
    }
    isRunning() {
        return this.running;
    }
}
//# sourceMappingURL=daemon.js.map