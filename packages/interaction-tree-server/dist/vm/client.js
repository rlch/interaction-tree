/**
 * VM Service client for connecting to Flutter apps.
 * Implements JSON-RPC 2.0 over WebSocket.
 */
import WebSocket from 'ws';
export class VMServiceClient {
    ws = null;
    requestId = 0;
    pending = new Map();
    isolateId = null;
    uri = null;
    onCloseCallbacks = [];
    get isConnected() {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
    get connectionUri() {
        return this.uri;
    }
    /**
     * Connect to a Flutter app via VM service WebSocket.
     */
    async connect(uri) {
        if (this.ws) {
            await this.disconnect();
        }
        this.uri = uri;
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(uri);
            this.ws.on('open', async () => {
                try {
                    await this.findMainIsolate();
                    resolve();
                }
                catch (err) {
                    // Close the socket if we can't find the isolate
                    this.ws?.close();
                    this.ws = null;
                    this.uri = null;
                    reject(err);
                }
            });
            this.ws.on('message', (data) => {
                this.handleMessage(data.toString());
            });
            this.ws.on('close', () => {
                this.handleClose();
            });
            this.ws.on('error', (err) => {
                reject(new Error(`WebSocket error: ${err.message}`));
            });
        });
    }
    /**
     * Disconnect from the VM service.
     */
    async disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isolateId = null;
            this.uri = null;
        }
    }
    /**
     * Register a callback for when the connection closes.
     */
    onClose(callback) {
        this.onCloseCallbacks.push(callback);
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Interaction Tree Methods
    // ─────────────────────────────────────────────────────────────────────────────
    async getTree(options) {
        const result = await this.callExtension('ext.interaction_tree.getTree', {
            includeBounds: options?.includeBounds ?? false,
            includeWidgetType: options?.includeWidgetType ?? false,
            includeState: options?.includeState ?? false,
        });
        return result.targets ?? [];
    }
    async execute(id, interaction, args) {
        return (await this.callExtension('ext.interaction_tree.execute', {
            id,
            interaction,
            args,
        }));
    }
    async tap(id) {
        return this.execute(id, 'tap');
    }
    async doubleTap(id) {
        return this.execute(id, 'doubleTap');
    }
    async longPress(id) {
        return this.execute(id, 'longPress');
    }
    async enterText(id, text) {
        return this.execute(id, 'enterText', { text });
    }
    async clearText(id) {
        return this.execute(id, 'clearText');
    }
    async scroll(id, dx, dy) {
        return this.execute(id, 'scroll', { dx, dy });
    }
    async drag(id, dx, dy) {
        return this.execute(id, 'drag', { dx, dy });
    }
    async scrollIntoView(id, alignment = 0) {
        return this.execute(id, 'scrollIntoView', { alignment });
    }
    async waitFor(id, condition = 'exists', timeoutMs = 10000) {
        return this.execute(id, 'waitFor', { condition, timeoutMs });
    }
    async getState(id) {
        return (await this.callExtension('ext.interaction_tree.getState', {
            id,
        }));
    }
    async executeAction(id, actionName, args) {
        return this.execute(id, 'executeAction', { actionName, args });
    }
    async batch(steps) {
        return (await this.callExtension('ext.interaction_tree.batch', {
            steps,
        }));
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Dart Tooling Methods
    // ─────────────────────────────────────────────────────────────────────────────
    async hotReload() {
        try {
            // Use callExtension to include isolateId
            await this.callExtension('ext.flutter.reassemble', {});
            return { success: true, reloadedAt: new Date().toISOString() };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    async hotRestart() {
        try {
            // Hot restart via Flutter extension
            await this.callExtension('ext.flutter.hotRestart', {});
            return { success: true, restartedAt: new Date().toISOString() };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    async getLogs(_since) {
        // TODO: Implement log collection from VM service
        // This may require connecting to the Dart Tooling Daemon instead
        return [];
    }
    async getRuntimeErrors() {
        // TODO: Implement error collection
        return [];
    }
    async getStatus() {
        return {
            connected: this.isConnected,
            isolateId: this.isolateId ?? undefined,
            appUri: this.uri ?? undefined,
        };
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Internal Methods
    // ─────────────────────────────────────────────────────────────────────────────
    async findMainIsolate() {
        const vm = (await this.callMethod('getVM', {}));
        // Find the main isolate (non-system isolate)
        const mainIsolate = vm.isolates.find((iso) => !iso.isSystemIsolate);
        if (!mainIsolate) {
            throw new Error('No main isolate found');
        }
        this.isolateId = mainIsolate.id;
    }
    async callMethod(method, params) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to VM service');
        }
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            method,
            params,
            id,
        };
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(request));
            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`Request ${method} timed out`));
                }
            }, 30000);
        });
    }
    async callExtension(method, args) {
        if (!this.isolateId) {
            throw new Error('No isolate connected');
        }
        const result = await this.callMethod(method, {
            isolateId: this.isolateId,
            ...args,
        });
        return result;
    }
    handleMessage(data) {
        try {
            const response = JSON.parse(data);
            if (response.id !== undefined) {
                const pending = this.pending.get(response.id);
                if (pending) {
                    this.pending.delete(response.id);
                    if (response.error) {
                        pending.reject(new Error(response.error.message || 'Unknown error'));
                    }
                    else {
                        pending.resolve(response.result);
                    }
                }
            }
        }
        catch {
            // Ignore parse errors for now
        }
    }
    handleClose() {
        this.ws = null;
        this.isolateId = null;
        // Reject all pending requests
        for (const [, { reject }] of this.pending) {
            reject(new Error('Connection closed'));
        }
        this.pending.clear();
        // Notify listeners
        for (const callback of this.onCloseCallbacks) {
            callback();
        }
    }
}
//# sourceMappingURL=client.js.map