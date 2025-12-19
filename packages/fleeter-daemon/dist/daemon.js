/**
 * Main Fleeter Daemon class.
 */
import { SessionManager, SessionService } from './session/index.js';
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
        this.server = new DaemonServer(this.sessionManager, this.flutterManager);
        this.setupFlutterEvents();
        this.setupSessionEvents();
    }
    setupSessionEvents() {
        // Create SessionService when session is created (before VM connects)
        this.sessionManager.on('session:created', (sessionInfo) => {
            const session = this.sessionManager.get(sessionInfo.id);
            if (session) {
                const sessionService = new SessionService({
                    sessionId: sessionInfo.id,
                    // vmClient will be set later when VM connects
                    sessionManager: this.sessionManager,
                    processManager: this.flutterManager,
                    projectPath: session.projectPath,
                });
                this.server.registerSessionService(sessionInfo.id, sessionService);
                log.daemon.info({ sessionId: sessionInfo.id }, 'SessionService created for new session');
            }
        });
        // Clean up SessionService when session is destroyed
        this.sessionManager.on('session:destroying', (sessionId) => {
            this.server.unregisterSessionService(sessionId);
            log.daemon.info({ sessionId }, 'SessionService unregistered for destroyed session');
        });
    }
    setupFlutterEvents() {
        this.flutterManager.on('started', async (sessionId, vmServiceUri) => {
            log.daemon.info({ sessionId, vmServiceUri }, 'Flutter started event received');
            log.daemon.debug({ sessionId, vmServiceUriLength: vmServiceUri?.length, vmServiceUriType: typeof vmServiceUri }, 'vmServiceUri details');
            this.sessionManager.updateStatus(sessionId, 'running', { vmServiceUri });
            // Connect VM client
            log.daemon.debug({ sessionId }, 'Creating new VMServiceClient');
            const vmClient = new VMServiceClient();
            try {
                log.daemon.info({ sessionId, vmServiceUri }, 'Attempting VM client connection');
                await vmClient.connect(vmServiceUri);
                log.daemon.info({ sessionId, isConnected: vmClient.isConnected }, 'VM client connect() completed');
                this.vmClients.set(sessionId, vmClient);
                // Set vmClient on existing SessionService
                const sessionService = this.server.getSessionService(sessionId);
                if (sessionService) {
                    sessionService.setVmClient(vmClient);
                    log.daemon.info({ sessionId }, 'VM client set on SessionService');
                }
                else {
                    log.daemon.warn({ sessionId }, 'SessionService not found when VM connected');
                }
                log.daemon.info({ sessionId, vmClientsCount: this.vmClients.size, vmClientsKeys: Array.from(this.vmClients.keys()) }, 'VM client added to vmClients map');
            }
            catch (err) {
                log.daemon.error({ sessionId, err, errMessage: err instanceof Error ? err.message : String(err), errStack: err instanceof Error ? err.stack : undefined }, 'Failed to connect VM client');
            }
        });
        this.flutterManager.on('exit', (sessionId) => {
            this.sessionManager.updateStatus(sessionId, 'stopped');
            // Clear vmClient but keep SessionService (session still exists, app just stopped)
            const vmClient = this.vmClients.get(sessionId);
            if (vmClient) {
                vmClient.disconnect();
                this.vmClients.delete(sessionId);
            }
            // Clear vmClient from service so it knows app is not running
            const sessionService = this.server.getSessionService(sessionId);
            sessionService?.clearVmClient();
            // Note: Don't unregister SessionService here - session still exists,
            // user can run the app again. Service is unregistered on session:destroying.
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
            log.daemon.warn('Already running');
            return;
        }
        this.server.start({ port: this.config.port, host: this.config.host });
        this.running = true;
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        log.daemon.info({ pid: process.pid, port: this.config.port }, 'Fleeter daemon started');
    }
    async shutdown(signal) {
        if (!this.running)
            return;
        log.daemon.info({ signal }, 'Shutting down');
        // Stop all Flutter processes
        await this.flutterManager.stopAll();
        // Disconnect all VM clients
        for (const vmClient of this.vmClients.values()) {
            await vmClient.disconnect();
        }
        this.server.stop();
        this.running = false;
        log.daemon.info('Shutdown complete');
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