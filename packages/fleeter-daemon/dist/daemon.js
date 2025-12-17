/**
 * Main Fleeter Daemon class.
 */
import { SessionManager } from './session/index.js';
import { DaemonServer } from './ws/index.js';
import { FlutterProcessManager } from './flutter/index.js';
import { VMServiceClient } from './vm/index.js';
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
            this.sessionManager.updateStatus(sessionId, 'running', { vmServiceUri });
            // Connect VM client
            const vmClient = new VMServiceClient();
            try {
                await vmClient.connect(vmServiceUri);
                this.vmClients.set(sessionId, vmClient);
                console.error(`[daemon] VM client connected for session ${sessionId}`);
            }
            catch (err) {
                console.error(`[daemon] Failed to connect VM client: ${err}`);
            }
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
            this.server.broadcastEvent('flutter', 'flutter.log', { line }, sessionId);
        });
        this.flutterManager.on('error', (sessionId, err) => {
            console.error(`[daemon] Flutter error for session ${sessionId}: ${err.message}`);
            this.sessionManager.updateStatus(sessionId, 'error', { error: err.message });
            this.server.broadcastEvent('flutter', 'flutter.error', { error: err.message }, sessionId);
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