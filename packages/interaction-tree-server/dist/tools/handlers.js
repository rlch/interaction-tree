/**
 * Tool handlers for raw mode.
 * These are the actual implementations that interact with the VM.
 */
import { getVMClient } from '../vm/client.js';
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
// Connection
// ─────────────────────────────────────────────────────────────────────────────
export async function handleConnect(args) {
    try {
        const client = getVMClient();
        await client.connect(args.uri);
        return success({ connected: true, uri: args.uri });
    }
    catch (err) {
        return error(`Failed to connect: ${err}`);
    }
}
export async function handleDisconnect() {
    try {
        const client = getVMClient();
        await client.disconnect();
        return success({ disconnected: true });
    }
    catch (err) {
        return error(`Failed to disconnect: ${err}`);
    }
}
export async function handleGetStatus() {
    const client = getVMClient();
    return success(await client.getStatus());
}
// ─────────────────────────────────────────────────────────────────────────────
// Interaction Tree
// ─────────────────────────────────────────────────────────────────────────────
export async function handleGetTree(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const tree = await client.getTree(args);
        return success({ targets: tree });
    }
    catch (err) {
        return error(`Failed to get tree: ${err}`);
    }
}
export async function handleTap(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.tap(args.id);
        return success(result);
    }
    catch (err) {
        return error(`Failed to tap: ${err}`);
    }
}
export async function handleDoubleTap(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.doubleTap(args.id);
        return success(result);
    }
    catch (err) {
        return error(`Failed to double tap: ${err}`);
    }
}
export async function handleLongPress(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.longPress(args.id);
        return success(result);
    }
    catch (err) {
        return error(`Failed to long press: ${err}`);
    }
}
export async function handleEnterText(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.enterText(args.id, args.text);
        return success(result);
    }
    catch (err) {
        return error(`Failed to enter text: ${err}`);
    }
}
export async function handleClearText(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.clearText(args.id);
        return success(result);
    }
    catch (err) {
        return error(`Failed to clear text: ${err}`);
    }
}
export async function handleScroll(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.scroll(args.id, args.dx ?? 0, args.dy ?? 0);
        return success(result);
    }
    catch (err) {
        return error(`Failed to scroll: ${err}`);
    }
}
export async function handleDrag(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.drag(args.id, args.dx ?? 0, args.dy ?? 0);
        return success(result);
    }
    catch (err) {
        return error(`Failed to drag: ${err}`);
    }
}
export async function handleScrollIntoView(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.scrollIntoView(args.id, args.alignment);
        return success(result);
    }
    catch (err) {
        return error(`Failed to scroll into view: ${err}`);
    }
}
export async function handleWaitFor(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.waitFor(args.id, args.condition ?? 'exists', args.timeoutMs ?? 10000);
        return success(result);
    }
    catch (err) {
        return error(`Failed to wait for: ${err}`);
    }
}
export async function handleGetState(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const state = await client.getState(args.id);
        return success(state);
    }
    catch (err) {
        return error(`Failed to get state: ${err}`);
    }
}
export async function handleExecuteAction(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.executeAction(args.id, args.actionName, args.args);
        return success(result);
    }
    catch (err) {
        return error(`Failed to execute action: ${err}`);
    }
}
export async function handleBatch(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.batch(args.steps);
        return success(result);
    }
    catch (err) {
        return error(`Failed to execute batch: ${err}`);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Dart Tooling
// ─────────────────────────────────────────────────────────────────────────────
export async function handleHotReload() {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.hotReload();
        return success(result);
    }
    catch (err) {
        return error(`Failed to hot reload: ${err}`);
    }
}
export async function handleHotRestart() {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const result = await client.hotRestart();
        return success(result);
    }
    catch (err) {
        return error(`Failed to hot restart: ${err}`);
    }
}
export async function handleGetLogs(args) {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const logs = await client.getLogs(args.since);
        return success({ logs });
    }
    catch (err) {
        return error(`Failed to get logs: ${err}`);
    }
}
export async function handleGetErrors() {
    const client = getVMClient();
    if (!client.isConnected) {
        return error('Not connected. Use connect tool first.');
    }
    try {
        const errors = await client.getRuntimeErrors();
        return success({ errors });
    }
    catch (err) {
        return error(`Failed to get errors: ${err}`);
    }
}
//# sourceMappingURL=handlers.js.map