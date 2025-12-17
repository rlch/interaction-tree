/**
 * WebSocket server for streaming monitoring events and handling commands.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { getMonitor } from './monitor.js';
import { getSessionManager } from '../session/index.js';
let wss = null;
let commandHandler = null;
let agentHandler = null;
async function handleCommand(cmd, ws) {
    const manager = getSessionManager();
    const session = manager.getActive();
    const vmClient = session?.app?.vmClient;
    const sendResponse = (response) => {
        ws.send(JSON.stringify({
            type: 'command_response',
            id: cmd.id,
            ...response,
        }));
    };
    try {
        switch (cmd.action) {
            // Session Management
            case 'create_session': {
                const { name, projectPath } = cmd.data;
                if (!name || !projectPath) {
                    sendResponse({ success: false, error: 'name and projectPath are required' });
                    return;
                }
                const newSession = manager.create({ name, projectPath });
                sendResponse({
                    success: true,
                    data: {
                        session: {
                            id: newSession.id,
                            name: newSession.name,
                            projectPath: newSession.projectPath,
                            appStatus: newSession.appStatus,
                            vmServiceUri: newSession.vmServiceUri ?? null,
                            pid: newSession.pid ?? null,
                            createdAt: newSession.createdAt,
                            lastActiveAt: newSession.lastActiveAt,
                        },
                    },
                });
                break;
            }
            case 'destroy_session': {
                const { session: sessionId } = cmd.data;
                if (!sessionId) {
                    sendResponse({ success: false, error: 'session is required' });
                    return;
                }
                try {
                    await manager.destroy(sessionId);
                    sendResponse({ success: true });
                }
                catch (err) {
                    sendResponse({
                        success: false,
                        error: err instanceof Error ? err.message : 'Session not found',
                    });
                }
                break;
            }
            case 'list_sessions': {
                const sessions = manager.list();
                sendResponse({ success: true, data: { sessions } });
                break;
            }
            case 'connect': {
                const { session: sessionId } = cmd.data;
                if (!sessionId) {
                    sendResponse({ success: false, error: 'session is required' });
                    return;
                }
                try {
                    manager.connect(sessionId);
                    sendResponse({ success: true });
                }
                catch (err) {
                    sendResponse({
                        success: false,
                        error: err instanceof Error ? err.message : 'Session not found',
                    });
                }
                break;
            }
            case 'hot_reload': {
                if (!session?.app || session.app.status !== 'running') {
                    sendResponse({ success: false, error: 'No app running' });
                    return;
                }
                const result = await manager.hotReload();
                sendResponse({ success: result.success, error: result.error });
                break;
            }
            case 'hot_restart': {
                if (!session?.app || session.app.status !== 'running') {
                    sendResponse({ success: false, error: 'No app running' });
                    return;
                }
                const result = await manager.hotRestart();
                sendResponse({ success: result.success, error: result.error });
                break;
            }
            case 'run': {
                if (!session) {
                    sendResponse({ success: false, error: 'No active session. Connect to a session first.' });
                    return;
                }
                try {
                    const options = cmd.data;
                    const result = await manager.runApp(options ?? {});
                    sendResponse({
                        success: true,
                        data: {
                            status: result.appStatus,
                            pid: result.pid,
                            vmServiceUri: result.vmServiceUri,
                        },
                    });
                }
                catch (err) {
                    sendResponse({
                        success: false,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
                break;
            }
            case 'stop': {
                await manager.stopApp();
                sendResponse({ success: true });
                break;
            }
            case 'flutter_key': {
                if (!cmd.key) {
                    sendResponse({ success: false, error: 'No key specified' });
                    return;
                }
                if (session?.app?.process?.stdin) {
                    session.app.process.stdin.write(cmd.key);
                    sendResponse({ success: true });
                }
                else {
                    sendResponse({ success: false, error: 'No app process available' });
                }
                break;
            }
            case 'get_status': {
                sendResponse({
                    success: true,
                    data: {
                        session: session
                            ? {
                                id: session.id,
                                name: session.name,
                                projectPath: session.projectPath,
                            }
                            : null,
                        app: session?.app
                            ? {
                                status: session.app.status,
                                vmServiceUri: session.app.vmServiceUri,
                                pid: session.app.pid,
                            }
                            : null,
                        vmConnection: {
                            connected: vmClient?.isConnected ?? false,
                            uri: vmClient?.connectionUri,
                        },
                    },
                });
                break;
            }
            case 'get_tree': {
                if (!vmClient?.isConnected) {
                    sendResponse({ success: false, error: 'Not connected to VM' });
                    return;
                }
                const tree = await vmClient.getTree({ includeWidgetType: true });
                sendResponse({ success: true, data: tree });
                break;
            }
            default:
                sendResponse({ success: false, error: `Unknown action: ${cmd.action}` });
        }
    }
    catch (err) {
        sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
export function setCommandHandler(handler) {
    commandHandler = handler;
}
export function setAgentHandler(handler) {
    agentHandler = handler;
}
export function startMonitoringServer(config) {
    const port = typeof config === 'number' ? config : config.port;
    const host = typeof config === 'number' ? '127.0.0.1' : config.host ?? '127.0.0.1';
    if (wss) {
        console.error(`[monitoring] WebSocket server already running`);
        return wss;
    }
    wss = new WebSocketServer({ port, host });
    const monitor = getMonitor();
    const clients = new Set();
    wss.on('connection', (ws) => {
        clients.add(ws);
        console.error(`[monitoring] Client connected (${clients.size} total)`);
        ws.send(JSON.stringify({
            type: 'monitoring.connected',
            ts: new Date().toISOString(),
            instanceId: monitor.getInstanceId(),
            payload: { message: 'Connected to monitoring stream' },
        }));
        ws.on('message', async (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'command') {
                    if (commandHandler) {
                        await commandHandler(msg, ws);
                    }
                    else {
                        await handleCommand(msg, ws);
                    }
                }
                else if (msg.type === 'agent_message') {
                    if (agentHandler) {
                        await agentHandler(msg, ws);
                    }
                    else {
                        ws.send(JSON.stringify({
                            type: 'agent_response',
                            id: msg.id,
                            status: 'failed',
                            error: 'Agent handler not configured',
                        }));
                    }
                }
            }
            catch (err) {
                console.error(`[monitoring] Error handling message: ${err}`);
            }
        });
        ws.on('close', () => {
            clients.delete(ws);
            console.error(`[monitoring] Client disconnected (${clients.size} total)`);
        });
        ws.on('error', (err) => {
            console.error(`[monitoring] WebSocket error: ${err.message}`);
            clients.delete(ws);
        });
    });
    const unsubscribe = monitor.subscribe((event) => {
        const message = JSON.stringify(event);
        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    });
    wss.on('close', () => {
        unsubscribe();
        wss = null;
    });
    console.error(`[monitoring] WebSocket server listening on ws://${host}:${port}`);
    return wss;
}
export function stopMonitoringServer() {
    if (wss) {
        wss.close();
        wss = null;
        console.error('[monitoring] WebSocket server stopped');
    }
}
export function getMonitoringServer() {
    return wss;
}
export function broadcastToClients(message) {
    if (!wss)
        return;
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}
//# sourceMappingURL=ws-server.js.map