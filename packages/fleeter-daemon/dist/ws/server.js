/**
 * WebSocket server for fleeter-daemon.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { isClientHello, isCommandMessage, isAgentToolCall } from './protocol.js';
const DAEMON_VERSION = '0.1.0';
const NO_SESSION_ERROR = 'No session connected. Use list_sessions to see available sessions, then connect_session to connect to one.';
export class DaemonServer {
    wss = null;
    clients = new Map();
    sessionManager;
    flutterManager;
    vmClients;
    constructor(sessionManager, flutterManager, vmClients) {
        this.sessionManager = sessionManager;
        this.flutterManager = flutterManager;
        this.vmClients = vmClients;
    }
    start(config) {
        const { port, host = '127.0.0.1' } = config;
        if (this.wss) {
            console.error('[daemon] WebSocket server already running');
            return;
        }
        this.wss = new WebSocketServer({ port, host });
        this.wss.on('connection', (ws) => {
            const tempId = uuidv4();
            console.error(`[daemon] New connection (temp id: ${tempId})`);
            ws.on('message', async (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    await this.handleMessage(msg, ws, tempId);
                }
                catch (err) {
                    console.error(`[daemon] Error handling message: ${err}`);
                    this.sendError(ws, 'unknown', err instanceof Error ? err.message : String(err));
                }
            });
            ws.on('close', () => this.handleDisconnect(tempId));
            ws.on('error', (err) => console.error(`[daemon] WebSocket error: ${err.message}`));
        });
        console.error(`[daemon] WebSocket server listening on ws://${host}:${port}`);
    }
    stop() {
        if (this.wss) {
            for (const { client } of this.clients.values()) {
                this.sessionManager.disconnectClientFromAll(client.id);
            }
            this.wss.close();
            this.wss = null;
            console.error('[daemon] WebSocket server stopped');
        }
    }
    async handleMessage(msg, ws, tempId) {
        if (isClientHello(msg)) {
            await this.handleHello(msg, ws, tempId);
        }
        else if (isCommandMessage(msg)) {
            await this.handleCommand(msg, ws);
        }
        else if (isAgentToolCall(msg)) {
            this.sendError(ws, msg.id, 'Agent mode not yet implemented');
        }
    }
    async handleHello(msg, ws, tempId) {
        this.clients.delete(tempId);
        const client = {
            id: msg.clientId,
            type: msg.clientType,
            connectedAt: new Date(),
            currentSessionId: null,
        };
        this.clients.set(msg.clientId, { client, ws });
        console.error(`[daemon] Client registered: ${msg.clientId} (${msg.clientType})`);
        const sessions = this.sessionManager.list();
        const response = {
            type: 'hello_ack',
            daemonVersion: DAEMON_VERSION,
            sessions: sessions.map((s) => ({
                id: s.id,
                name: s.name,
                projectPath: s.projectPath,
                appStatus: s.appStatus,
            })),
        };
        ws.send(JSON.stringify(response));
    }
    async handleCommand(msg, ws) {
        const { id, clientId, action, data } = msg;
        const sendResponse = (response) => {
            ws.send(JSON.stringify({ type: 'command_response', id, ...response }));
        };
        try {
            switch (action) {
                case 'create_session': {
                    const { name, projectPath } = data;
                    if (!name || !projectPath) {
                        sendResponse({ success: false, error: 'name and projectPath are required' });
                        return;
                    }
                    const session = this.sessionManager.create({ name, projectPath });
                    // Auto-connect the creating client to the new session
                    this.sessionManager.connectClient(session.id, clientId);
                    const clientEntry = this.clients.get(clientId);
                    if (clientEntry)
                        clientEntry.client.currentSessionId = session.id;
                    sendResponse({ success: true, data: { session } });
                    this.broadcastEvent('session', 'session.created', { session });
                    break;
                }
                case 'destroy_session': {
                    const { sessionId } = data;
                    if (!sessionId) {
                        sendResponse({ success: false, error: 'sessionId is required' });
                        return;
                    }
                    await this.sessionManager.destroy(sessionId);
                    sendResponse({ success: true });
                    this.broadcastEvent('session', 'session.destroyed', { sessionId });
                    break;
                }
                case 'list_sessions': {
                    const sessions = this.sessionManager.list();
                    sendResponse({ success: true, data: { sessions } });
                    break;
                }
                case 'connect_session': {
                    const { sessionId } = data;
                    if (!sessionId) {
                        sendResponse({ success: false, error: 'sessionId is required' });
                        return;
                    }
                    const session = this.sessionManager.connectClient(sessionId, clientId);
                    const clientEntry = this.clients.get(clientId);
                    if (clientEntry)
                        clientEntry.client.currentSessionId = session.id;
                    // Send stored logs to the connecting client
                    const storedLogs = this.sessionManager.getLogs(sessionId, 500);
                    if (storedLogs.length > 0) {
                        for (const line of storedLogs) {
                            ws.send(JSON.stringify({
                                type: 'event',
                                ts: new Date().toISOString(),
                                source: 'flutter',
                                eventType: 'flutter.log',
                                sessionId,
                                payload: { line },
                            }));
                        }
                    }
                    // Send chat history to the connecting client
                    const chatHistory = this.sessionManager.getChatHistory(sessionId);
                    sendResponse({ success: true, data: { session, chatHistory } });
                    break;
                }
                case 'disconnect_session': {
                    const { sessionId } = data;
                    if (!sessionId) {
                        sendResponse({ success: false, error: 'sessionId is required' });
                        return;
                    }
                    this.sessionManager.disconnectClient(sessionId, clientId);
                    const clientEntry = this.clients.get(clientId);
                    if (clientEntry?.client.currentSessionId === sessionId) {
                        clientEntry.client.currentSessionId = null;
                    }
                    sendResponse({ success: true });
                    break;
                }
                case 'get_status': {
                    const clientEntry = this.clients.get(clientId);
                    const currentSessionId = clientEntry?.client.currentSessionId;
                    const currentSession = currentSessionId ? this.sessionManager.get(currentSessionId) : null;
                    sendResponse({
                        success: true,
                        data: {
                            daemon: { version: DAEMON_VERSION, uptime: process.uptime() },
                            client: clientEntry?.client ?? null,
                            currentSession: currentSession ? this.sessionManager.list().find((s) => s.id === currentSession.id) : null,
                            totalSessions: this.sessionManager.list().length,
                            totalClients: this.clients.size,
                        },
                    });
                    break;
                }
                case 'health_check': {
                    sendResponse({ success: true, data: { healthy: true, version: DAEMON_VERSION } });
                    break;
                }
                case 'run_app': {
                    const clientEntry = this.clients.get(clientId);
                    const sessionId = clientEntry?.client.currentSessionId;
                    if (!sessionId) {
                        sendResponse({ success: false, error: NO_SESSION_ERROR });
                        return;
                    }
                    const session = this.sessionManager.get(sessionId);
                    if (!session) {
                        sendResponse({ success: false, error: 'Session not found' });
                        return;
                    }
                    const options = data;
                    this.sessionManager.updateStatus(sessionId, 'starting');
                    const flutterProcess = await this.flutterManager.runApp(sessionId, session.projectPath, options ?? {});
                    this.sessionManager.updateStatus(sessionId, 'running', { pid: flutterProcess.pid });
                    sendResponse({ success: true, data: { pid: flutterProcess.pid } });
                    break;
                }
                case 'stop_app': {
                    const clientEntry = this.clients.get(clientId);
                    const sessionId = clientEntry?.client.currentSessionId;
                    if (!sessionId) {
                        sendResponse({ success: false, error: NO_SESSION_ERROR });
                        return;
                    }
                    await this.flutterManager.stopApp(sessionId);
                    sendResponse({ success: true });
                    break;
                }
                case 'hot_reload': {
                    const clientEntry = this.clients.get(clientId);
                    const sessionId = clientEntry?.client.currentSessionId;
                    if (!sessionId) {
                        sendResponse({ success: false, error: NO_SESSION_ERROR });
                        return;
                    }
                    const vmClient = this.vmClients.get(sessionId);
                    if (!vmClient?.isConnected) {
                        sendResponse({ success: false, error: 'VM client not connected' });
                        return;
                    }
                    const clearErrors = data?.clearRuntimeErrors ?? false;
                    const result = await vmClient.hotReload(clearErrors);
                    sendResponse({ success: result.success, data: result, error: result.error });
                    break;
                }
                case 'hot_restart': {
                    const clientEntry = this.clients.get(clientId);
                    const sessionId = clientEntry?.client.currentSessionId;
                    if (!sessionId) {
                        sendResponse({ success: false, error: NO_SESSION_ERROR });
                        return;
                    }
                    const vmClient = this.vmClients.get(sessionId);
                    if (!vmClient?.isConnected) {
                        sendResponse({ success: false, error: 'VM client not connected' });
                        return;
                    }
                    const clearErrors = data?.clearRuntimeErrors ?? true;
                    const result = await vmClient.hotRestart(clearErrors);
                    sendResponse({ success: result.success, data: result, error: result.error });
                    break;
                }
                case 'get_tree': {
                    const clientEntry = this.clients.get(clientId);
                    const sessionId = clientEntry?.client.currentSessionId;
                    if (!sessionId) {
                        sendResponse({ success: false, error: NO_SESSION_ERROR });
                        return;
                    }
                    const vmClient = this.vmClients.get(sessionId);
                    if (!vmClient?.isConnected) {
                        sendResponse({ success: false, error: 'Not connected to VM' });
                        return;
                    }
                    const options = data;
                    const tree = await vmClient.getTree({ includeWidgetType: true, summaryOnly: options?.summaryOnly });
                    sendResponse({ success: true, data: { tree } });
                    break;
                }
                case 'get_logs': {
                    const clientEntry = this.clients.get(clientId);
                    const sessionId = clientEntry?.client.currentSessionId;
                    if (!sessionId) {
                        sendResponse({ success: false, error: NO_SESSION_ERROR });
                        return;
                    }
                    const options = data;
                    // Get logs from session (persisted) instead of process (ephemeral)
                    const logs = this.sessionManager.getLogs(sessionId, options?.maxLines);
                    sendResponse({ success: true, data: { logs } });
                    break;
                }
                case 'execute_interaction': {
                    const clientEntry = this.clients.get(clientId);
                    const sessionId = clientEntry?.client.currentSessionId;
                    if (!sessionId) {
                        sendResponse({ success: false, error: NO_SESSION_ERROR });
                        return;
                    }
                    const vmClient = this.vmClients.get(sessionId);
                    if (!vmClient?.isConnected) {
                        sendResponse({ success: false, error: 'VM client not connected' });
                        return;
                    }
                    const { nodeId, interaction, args } = data;
                    if (!nodeId || !interaction) {
                        sendResponse({ success: false, error: 'nodeId and interaction are required' });
                        return;
                    }
                    try {
                        const result = await vmClient.execute(nodeId, interaction, args);
                        sendResponse({ success: true, data: result });
                    }
                    catch (err) {
                        sendResponse({
                            success: false,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    }
                    break;
                }
                case 'agent_message': {
                    console.error(`[daemon] Received agent_message from ${clientId}`);
                    const clientEntry = this.clients.get(clientId);
                    const sessionId = clientEntry?.client.currentSessionId;
                    console.error(`[daemon] sessionId: ${sessionId}`);
                    if (!sessionId) {
                        console.error(`[daemon] No session connected`);
                        sendResponse({ success: false, error: NO_SESSION_ERROR });
                        return;
                    }
                    const session = this.sessionManager.get(sessionId);
                    console.error(`[daemon] session: ${session?.id}, agent: ${!!session?.agent}`);
                    if (!session?.agent) {
                        console.error(`[daemon] No agent for session`);
                        sendResponse({ success: false, error: 'No agent for session' });
                        return;
                    }
                    const { intent } = data;
                    console.error(`[daemon] intent: ${intent}`);
                    // Store user message in chat history
                    this.sessionManager.addChatMessage(sessionId, {
                        role: 'user',
                        content: { type: 'text', text: intent },
                        timestamp: new Date().toISOString(),
                    });
                    const vmClient = this.vmClients.get(sessionId);
                    console.error(`[daemon] vmClient: ${!!vmClient}`);
                    // Track text and tool calls for chat history
                    let textBuffer = '';
                    const pendingToolCalls = new Map();
                    const onEvent = (partialEvent) => {
                        console.error(`[daemon] onEvent: ${JSON.stringify(partialEvent.event)}`);
                        const evt = partialEvent.event;
                        // Track text for chat history
                        if (evt.kind === 'text_delta') {
                            textBuffer += evt.text;
                        }
                        // Track tool calls for chat history
                        if (evt.kind === 'tool_call_start') {
                            pendingToolCalls.set(evt.toolCallId, {
                                name: evt.toolName,
                                args: {},
                                timestamp: new Date().toISOString(),
                            });
                        }
                        if (evt.kind === 'tool_call_end') {
                            const pending = pendingToolCalls.get(evt.toolCallId);
                            if (pending) {
                                // Store completed tool call in chat history
                                this.sessionManager.addChatMessage(sessionId, {
                                    role: 'assistant',
                                    content: {
                                        type: 'tool_call',
                                        name: pending.name,
                                        args: pending.args,
                                        output: evt.result,
                                        status: 'success',
                                    },
                                    timestamp: pending.timestamp,
                                });
                                pendingToolCalls.delete(evt.toolCallId);
                            }
                        }
                        const streamEvent = {
                            type: 'agent_stream',
                            id,
                            sessionId,
                            event: partialEvent.event,
                        };
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify(streamEvent));
                        }
                    };
                    try {
                        console.error(`[daemon] Calling agent.execute...`);
                        // AgentExecutor maintains its own Claude SDK session ID internally
                        const result = await session.agent.execute({
                            intent,
                            vmClient,
                            sessionId,
                            cwd: session.projectPath,
                            onEvent,
                        });
                        console.error(`[daemon] agent.execute result: ${JSON.stringify(result)}`);
                        // Store final assistant text response if any
                        if (textBuffer.trim() || result.summary) {
                            this.sessionManager.addChatMessage(sessionId, {
                                role: 'assistant',
                                content: { type: 'text', text: textBuffer.trim() || result.summary || '' },
                                timestamp: new Date().toISOString(),
                            });
                        }
                        const response = {
                            type: 'agent_response',
                            id,
                            status: result.status,
                            summary: result.summary,
                            error: result.error,
                            question: result.question,
                            sdkSessionId: result.sessionId,
                        };
                        console.error(`[daemon] Sending response: ${JSON.stringify(response)}`);
                        ws.send(JSON.stringify(response));
                    }
                    catch (err) {
                        ws.send(JSON.stringify({
                            type: 'agent_response',
                            id,
                            status: 'error',
                            error: err instanceof Error ? err.message : String(err),
                        }));
                    }
                    break;
                }
                default:
                    sendResponse({ success: false, error: `Unknown action: ${action}` });
            }
        }
        catch (err) {
            sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
    }
    handleDisconnect(clientIdOrTemp) {
        const clientEntry = this.clients.get(clientIdOrTemp);
        if (clientEntry) {
            console.error(`[daemon] Client disconnected: ${clientEntry.client.id}`);
            this.sessionManager.disconnectClientFromAll(clientEntry.client.id);
            this.clients.delete(clientIdOrTemp);
        }
    }
    sendError(ws, id, error) {
        ws.send(JSON.stringify({ type: 'command_response', id, success: false, error }));
    }
    broadcastEvent(source, eventType, payload, sessionId) {
        const event = {
            type: 'event',
            ts: new Date().toISOString(),
            source,
            eventType,
            sessionId,
            payload,
        };
        const message = JSON.stringify(event);
        for (const { ws } of this.clients.values()) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        }
    }
    getClientCount() {
        return this.clients.size;
    }
}
//# sourceMappingURL=server.js.map