/**
 * SessionService - unified service for all session operations.
 * One instance per active session, wrapping VMServiceClient, SessionManager, and FlutterProcessManager.
 */
import { EventEmitter } from 'events';
export class SessionService extends EventEmitter {
    sessionId;
    vmClient;
    sessionManager;
    processManager;
    projectPath;
    treeCache = null;
    treeCacheTime = 0;
    treeCacheTtlMs = 500;
    constructor(options) {
        super();
        this.sessionId = options.sessionId;
        this.vmClient = options.vmClient;
        this.sessionManager = options.sessionManager;
        this.processManager = options.processManager;
        this.projectPath = options.projectPath;
        this.vmClient.on('treeChanged', () => this.invalidateTreeCache());
        this.vmClient.on('interaction', () => this.invalidateTreeCache());
    }
    get id() {
        return this.sessionId;
    }
    get isVmConnected() {
        return this.vmClient.isConnected;
    }
    get client() {
        return this.vmClient;
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // VMServiceClient methods (require VM connection)
    // ─────────────────────────────────────────────────────────────────────────────
    async getTree(options) {
        this.requireVmConnection();
        const now = Date.now();
        if (this.treeCache && now - this.treeCacheTime < this.treeCacheTtlMs) {
            return this.treeCache;
        }
        const tree = await this.vmClient.getTree(options);
        this.treeCache = tree;
        this.treeCacheTime = now;
        return tree;
    }
    async execute(nodeId, interaction, args) {
        this.requireVmConnection();
        this.invalidateTreeCache();
        return this.vmClient.execute(nodeId, interaction, args);
    }
    async getState(nodeId) {
        this.requireVmConnection();
        return this.vmClient.getState(nodeId);
    }
    async batch(steps) {
        this.requireVmConnection();
        this.invalidateTreeCache();
        return this.vmClient.batch(steps);
    }
    async hotReload(clearErrors = false) {
        this.requireVmConnection();
        this.invalidateTreeCache();
        return this.vmClient.hotReload(clearErrors);
    }
    async hotRestart(clearErrors = true) {
        this.requireVmConnection();
        this.invalidateTreeCache();
        return this.vmClient.hotRestart(clearErrors);
    }
    async getRuntimeErrors() {
        this.requireVmConnection();
        return this.vmClient.getRuntimeErrors();
    }
    clearRuntimeErrors() {
        if (this.vmClient.isConnected) {
            this.vmClient.clearRuntimeErrors();
        }
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // SessionManager methods
    // ─────────────────────────────────────────────────────────────────────────────
    getLogs(maxLines = 100) {
        return this.sessionManager.getLogs(this.sessionId, maxLines);
    }
    getStatus() {
        const session = this.sessionManager.get(this.sessionId);
        if (!session) {
            throw new Error(`Session not found: ${this.sessionId}`);
        }
        return {
            sessionInfo: this.sessionManager.toInfo(session),
            vmConnected: this.vmClient.isConnected,
            vmServiceUri: this.vmClient.connectionUri ?? undefined,
        };
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // FlutterProcessManager methods
    // ─────────────────────────────────────────────────────────────────────────────
    async runApp(options) {
        await this.processManager.runApp(this.sessionId, this.projectPath, options);
    }
    async stopApp() {
        await this.processManager.stopApp(this.sessionId);
        this.invalidateTreeCache();
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────────
    requireVmConnection() {
        if (!this.vmClient.isConnected) {
            throw new Error('VM service not connected. Start the app with runApp() first, or wait for the VM to connect.');
        }
    }
    invalidateTreeCache() {
        this.treeCache = null;
        this.treeCacheTime = 0;
    }
}
//# sourceMappingURL=service.js.map