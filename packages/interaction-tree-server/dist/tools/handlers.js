/**
 * Tool handlers - implementations that use SessionManager.
 */
import { getSessionManager } from '../session/index.js';
function success(data) {
    return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
}
function error(message) {
    return {
        content: [{ type: 'text', text: `Error: ${message}` }],
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Session Management
// ─────────────────────────────────────────────────────────────────────────────
export async function handleCreateSession(args) {
    try {
        const manager = getSessionManager();
        const info = manager.create(args);
        return success(info);
    }
    catch (err) {
        return error(`Failed to create session: ${err}`);
    }
}
export async function handleDestroySession(args) {
    try {
        const manager = getSessionManager();
        await manager.destroy(args.session);
        return success({ destroyed: true, session: args.session });
    }
    catch (err) {
        return error(`Failed to destroy session: ${err}`);
    }
}
export async function handleListSessions() {
    const manager = getSessionManager();
    const sessions = manager.list();
    return success({ sessions });
}
export async function handleConnect(args) {
    try {
        const manager = getSessionManager();
        const info = manager.connect(args.session);
        return success({ connected: true, session: info });
    }
    catch (err) {
        return error(`Failed to connect: ${err}`);
    }
}
export async function handleDisconnect() {
    const manager = getSessionManager();
    manager.disconnect();
    return success({ disconnected: true });
}
// ─────────────────────────────────────────────────────────────────────────────
// App Lifecycle
// ─────────────────────────────────────────────────────────────────────────────
export async function handleRun(args) {
    try {
        const manager = getSessionManager();
        const info = await manager.runApp(args);
        return success(info);
    }
    catch (err) {
        return error(`Failed to run app: ${err}`);
    }
}
export async function handleStop() {
    try {
        const manager = getSessionManager();
        await manager.stopApp();
        return success({ stopped: true });
    }
    catch (err) {
        return error(`Failed to stop: ${err}`);
    }
}
export async function handleRebuild(args) {
    try {
        const manager = getSessionManager();
        const info = await manager.rebuildApp(args);
        return success(info);
    }
    catch (err) {
        return error(`Failed to rebuild: ${err}`);
    }
}
export async function handleGetStatus() {
    const manager = getSessionManager();
    const session = manager.getActive();
    if (!session) {
        return success({
            connected: false,
            message: 'No active session. Use connect tool first.',
        });
    }
    const vmClient = session.app?.vmClient;
    return success({
        sessionId: session.id,
        sessionName: session.name,
        projectPath: session.projectPath,
        appStatus: session.app?.status ?? 'not_running',
        vmServiceUri: session.app?.vmServiceUri,
        pid: session.app?.pid,
        vmConnected: vmClient?.isConnected ?? false,
    });
}
export async function handleHotReload() {
    try {
        const manager = getSessionManager();
        const result = await manager.hotReload();
        return success(result);
    }
    catch (err) {
        return error(`Failed to hot reload: ${err}`);
    }
}
export async function handleHotRestart() {
    try {
        const manager = getSessionManager();
        const result = await manager.hotRestart();
        return success(result);
    }
    catch (err) {
        return error(`Failed to hot restart: ${err}`);
    }
}
export async function handleGetLogs(args) {
    const manager = getSessionManager();
    const logs = manager.getLogs(args.maxLines);
    return success({ logs, count: logs.length });
}
export async function handleGetErrors() {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const errors = await vmClient.getRuntimeErrors();
        return success({ errors });
    }
    catch (err) {
        return error(`Failed to get errors: ${err}`);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Interaction Tree
// ─────────────────────────────────────────────────────────────────────────────
export async function handleGetTree(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const tree = await vmClient.getTree(args);
        return success({ targets: tree });
    }
    catch (err) {
        return error(`Failed to get tree: ${err}`);
    }
}
export async function handleTap(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.tap(args.id);
        return success(result);
    }
    catch (err) {
        return error(`Failed to tap: ${err}`);
    }
}
export async function handleDoubleTap(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.doubleTap(args.id);
        return success(result);
    }
    catch (err) {
        return error(`Failed to double tap: ${err}`);
    }
}
export async function handleLongPress(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.longPress(args.id);
        return success(result);
    }
    catch (err) {
        return error(`Failed to long press: ${err}`);
    }
}
export async function handleEnterText(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.enterText(args.id, args.text);
        return success(result);
    }
    catch (err) {
        return error(`Failed to enter text: ${err}`);
    }
}
export async function handleClearText(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.clearText(args.id);
        return success(result);
    }
    catch (err) {
        return error(`Failed to clear text: ${err}`);
    }
}
export async function handleScroll(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.scroll(args.id, args.dx ?? 0, args.dy ?? 0);
        return success(result);
    }
    catch (err) {
        return error(`Failed to scroll: ${err}`);
    }
}
export async function handleDrag(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.drag(args.id, args.dx ?? 0, args.dy ?? 0);
        return success(result);
    }
    catch (err) {
        return error(`Failed to drag: ${err}`);
    }
}
export async function handleScrollIntoView(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.scrollIntoView(args.id, args.alignment);
        return success(result);
    }
    catch (err) {
        return error(`Failed to scroll into view: ${err}`);
    }
}
export async function handleWaitFor(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.waitFor(args.id, args.condition ?? 'exists', args.timeoutMs ?? 10000);
        return success(result);
    }
    catch (err) {
        return error(`Failed to wait for: ${err}`);
    }
}
export async function handleGetState(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const state = await vmClient.getState(args.id);
        return success(state);
    }
    catch (err) {
        return error(`Failed to get state: ${err}`);
    }
}
export async function handleExecuteAction(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.executeAction(args.id, args.actionName, args.args);
        return success(result);
    }
    catch (err) {
        return error(`Failed to execute action: ${err}`);
    }
}
export async function handleBatch(args) {
    try {
        const manager = getSessionManager();
        const vmClient = manager.requireActiveVMClient();
        const result = await vmClient.batch(args.steps);
        return success(result);
    }
    catch (err) {
        return error(`Failed to execute batch: ${err}`);
    }
}
//# sourceMappingURL=handlers.js.map