/**
 * Tool handlers - implementations that interact with Flutter app instances.
 */
import { getAppManager, } from '../flutter/app-manager.js';
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
function resolveInstance(idOrName) {
    const manager = getAppManager();
    if (!idOrName) {
        // If no ID specified, use the only running instance (if exactly one)
        const instances = manager.list().filter((i) => i.status === 'running');
        if (instances.length === 0) {
            return { error: 'No running instances. Use run tool first.' };
        }
        if (instances.length > 1) {
            return {
                error: `Multiple instances running. Specify instanceId: ${instances.map((i) => i.name || i.id).join(', ')}`,
            };
        }
        const instance = manager.get(instances[0].id);
        return { vmClient: instance.vmClient, id: instances[0].id };
    }
    const instance = manager.get(idOrName);
    if (!instance) {
        return { error: `Instance not found: ${idOrName}` };
    }
    return { vmClient: instance.vmClient, id: instance.info.id };
}
// ─────────────────────────────────────────────────────────────────────────────
// Instance Management
// ─────────────────────────────────────────────────────────────────────────────
export async function handleRun(args) {
    try {
        const manager = getAppManager();
        const info = await manager.run(args);
        return success({
            instanceId: info.id,
            name: info.name,
            status: info.status,
            vmServiceUri: info.vmServiceUri,
            pid: info.pid,
            device: info.device,
        });
    }
    catch (err) {
        return error(`Failed to run app: ${err}`);
    }
}
export async function handleStop(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    try {
        const manager = getAppManager();
        await manager.stop(resolved.id);
        return success({ stopped: true, instanceId: resolved.id });
    }
    catch (err) {
        return error(`Failed to stop: ${err}`);
    }
}
export async function handleList() {
    const manager = getAppManager();
    const instances = manager.list().map((i) => ({
        instanceId: i.id,
        name: i.name,
        projectPath: i.projectPath,
        device: i.device,
        status: i.status,
        vmServiceUri: i.vmServiceUri,
        pid: i.pid,
        startedAt: i.startedAt?.toISOString(),
    }));
    return success({ instances });
}
export async function handleRebuild(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    try {
        const manager = getAppManager();
        const info = await manager.rebuild(resolved.id, args);
        return success({
            instanceId: info.id,
            name: info.name,
            status: info.status,
            vmServiceUri: info.vmServiceUri,
            pid: info.pid,
        });
    }
    catch (err) {
        return error(`Failed to rebuild: ${err}`);
    }
}
export async function handleGetStatus(args) {
    const manager = getAppManager();
    if (args.instanceId) {
        const info = manager.getInfo(args.instanceId);
        if (!info) {
            return error(`Instance not found: ${args.instanceId}`);
        }
        const vmClient = manager.getVMClient(args.instanceId);
        return success({
            instanceId: info.id,
            name: info.name,
            projectPath: info.projectPath,
            device: info.device,
            status: info.status,
            vmServiceUri: info.vmServiceUri,
            pid: info.pid,
            startedAt: info.startedAt?.toISOString(),
            vmConnected: vmClient?.isConnected ?? false,
        });
    }
    // Return all instances
    const instances = manager.list().map((i) => ({
        instanceId: i.id,
        name: i.name,
        projectPath: i.projectPath,
        status: i.status,
    }));
    return success({ instances });
}
// ─────────────────────────────────────────────────────────────────────────────
// Interaction Tree
// ─────────────────────────────────────────────────────────────────────────────
export async function handleGetTree(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const tree = await vmClient.getTree(args);
        return success({ instanceId: resolved.id, targets: tree });
    }
    catch (err) {
        return error(`Failed to get tree: ${err}`);
    }
}
export async function handleTap(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.tap(args.id);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to tap: ${err}`);
    }
}
export async function handleDoubleTap(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.doubleTap(args.id);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to double tap: ${err}`);
    }
}
export async function handleLongPress(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.longPress(args.id);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to long press: ${err}`);
    }
}
export async function handleEnterText(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.enterText(args.id, args.text);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to enter text: ${err}`);
    }
}
export async function handleClearText(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.clearText(args.id);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to clear text: ${err}`);
    }
}
export async function handleScroll(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.scroll(args.id, args.dx ?? 0, args.dy ?? 0);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to scroll: ${err}`);
    }
}
export async function handleDrag(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.drag(args.id, args.dx ?? 0, args.dy ?? 0);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to drag: ${err}`);
    }
}
export async function handleScrollIntoView(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.scrollIntoView(args.id, args.alignment);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to scroll into view: ${err}`);
    }
}
export async function handleWaitFor(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.waitFor(args.id, args.condition ?? 'exists', args.timeoutMs ?? 10000);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to wait for: ${err}`);
    }
}
export async function handleGetState(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const state = await vmClient.getState(args.id);
        return success({ instanceId: resolved.id, ...state });
    }
    catch (err) {
        return error(`Failed to get state: ${err}`);
    }
}
export async function handleExecuteAction(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.executeAction(args.id, args.actionName, args.args);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to execute action: ${err}`);
    }
}
export async function handleBatch(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const result = await vmClient.batch(args.steps);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to execute batch: ${err}`);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// App Lifecycle
// ─────────────────────────────────────────────────────────────────────────────
export async function handleHotReload(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    try {
        const manager = getAppManager();
        const result = await manager.hotReload(resolved.id);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to hot reload: ${err}`);
    }
}
export async function handleHotRestart(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    try {
        const manager = getAppManager();
        const result = await manager.hotRestart(resolved.id);
        return success({ instanceId: resolved.id, ...result });
    }
    catch (err) {
        return error(`Failed to hot restart: ${err}`);
    }
}
export async function handleGetLogs(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const manager = getAppManager();
    const logs = manager.getLogs(resolved.id, args.maxLines);
    return success({ instanceId: resolved.id, logs, count: logs.length });
}
export async function handleGetErrors(args) {
    const resolved = resolveInstance(args.instanceId);
    if ('error' in resolved)
        return error(resolved.error);
    const vmClient = resolved.vmClient;
    if (!vmClient.isConnected) {
        return error('VM client not connected');
    }
    try {
        const errors = await vmClient.getRuntimeErrors();
        return success({ instanceId: resolved.id, errors });
    }
    catch (err) {
        return error(`Failed to get errors: ${err}`);
    }
}
//# sourceMappingURL=handlers.js.map