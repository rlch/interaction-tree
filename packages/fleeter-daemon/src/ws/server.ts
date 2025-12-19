/**
 * WebSocket server for fleeter-daemon.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClientMessage,
  ConnectedClient,
  ClientHello,
  CommandMessage,
  CommandResponse,
  ServerHello,
  MonitoringEvent,
  AgentStreamEvent,
} from './protocol.js';
import { isClientHello, isCommandMessage, isAgentToolCall } from './protocol.js';
import type { SessionManager } from '../session/index.js';
import type { FlutterProcessManager } from '../flutter/index.js';
import type { VMServiceClient } from '../vm/index.js';

const DAEMON_VERSION = '0.1.0';

const NO_SESSION_ERROR = 'No session connected. Use list_sessions to see available sessions, then connect_session to connect to one.';

export interface DaemonServerConfig {
  port: number;
  host?: string;
}

export class DaemonServer {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, { client: ConnectedClient; ws: WebSocket }>();
  private sessionManager: SessionManager;
  private flutterManager: FlutterProcessManager;
  private vmClients: Map<string, VMServiceClient>;

  constructor(
    sessionManager: SessionManager,
    flutterManager: FlutterProcessManager,
    vmClients: Map<string, VMServiceClient>
  ) {
    this.sessionManager = sessionManager;
    this.flutterManager = flutterManager;
    this.vmClients = vmClients;
  }

  start(config: DaemonServerConfig): void {
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
          const msg = JSON.parse(data.toString()) as ClientMessage;
          await this.handleMessage(msg, ws, tempId);
        } catch (err) {
          console.error(`[daemon] Error handling message: ${err}`);
          this.sendError(ws, 'unknown', err instanceof Error ? err.message : String(err));
        }
      });

      ws.on('close', () => this.handleDisconnect(tempId));
      ws.on('error', (err) => console.error(`[daemon] WebSocket error: ${err.message}`));
    });

    console.error(`[daemon] WebSocket server listening on ws://${host}:${port}`);
  }

  stop(): void {
    if (this.wss) {
      for (const { client } of this.clients.values()) {
        this.sessionManager.disconnectClientFromAll(client.id);
      }
      this.wss.close();
      this.wss = null;
      console.error('[daemon] WebSocket server stopped');
    }
  }

  private async handleMessage(msg: ClientMessage, ws: WebSocket, tempId: string): Promise<void> {
    if (isClientHello(msg)) {
      await this.handleHello(msg, ws, tempId);
    } else if (isCommandMessage(msg)) {
      await this.handleCommand(msg, ws);
    } else if (isAgentToolCall(msg)) {
      this.sendError(ws, msg.id, 'Agent mode not yet implemented');
    }
  }

  private async handleHello(msg: ClientHello, ws: WebSocket, tempId: string): Promise<void> {
    this.clients.delete(tempId);

    const client: ConnectedClient = {
      id: msg.clientId,
      type: msg.clientType,
      connectedAt: new Date(),
      currentSessionId: null,
    };

    this.clients.set(msg.clientId, { client, ws });
    console.error(`[daemon] Client registered: ${msg.clientId} (${msg.clientType})`);

    const sessions = this.sessionManager.list();
    const response: ServerHello = {
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

  private async handleCommand(msg: CommandMessage, ws: WebSocket): Promise<void> {
    const { id, clientId, action, data } = msg;

    const sendResponse = (response: Omit<CommandResponse, 'type' | 'id'>) => {
      ws.send(JSON.stringify({ type: 'command_response', id, ...response } satisfies CommandResponse));
    };

    try {
      switch (action) {
        case 'create_session': {
          const { name, projectPath } = data as { name: string; projectPath: string };
          if (!name || !projectPath) {
            sendResponse({ success: false, error: 'name and projectPath are required' });
            return;
          }
          const session = this.sessionManager.create({ name, projectPath });
          // Auto-connect the creating client to the new session
          this.sessionManager.connectClient(session.id, clientId);
          const clientEntry = this.clients.get(clientId);
          if (clientEntry) clientEntry.client.currentSessionId = session.id;
          sendResponse({ success: true, data: { session } });
          this.broadcastEvent('session', 'session.created', { session });
          break;
        }

        case 'destroy_session': {
          const { sessionId } = data as { sessionId: string };
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
          const { sessionId } = data as { sessionId: string };
          if (!sessionId) {
            sendResponse({ success: false, error: 'sessionId is required' });
            return;
          }
          const session = this.sessionManager.connectClient(sessionId, clientId);
          const clientEntry = this.clients.get(clientId);
          if (clientEntry) clientEntry.client.currentSessionId = session.id;
          
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
          
          sendResponse({ success: true, data: { session } });
          break;
        }

        case 'disconnect_session': {
          const { sessionId } = data as { sessionId: string };
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
          const options = data as { device?: string; flavor?: string; target?: string } | undefined;
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
          const success = this.flutterManager.hotReload(sessionId);
          sendResponse({ success, error: success ? undefined : 'No process running' });
          break;
        }

        case 'hot_restart': {
          const clientEntry = this.clients.get(clientId);
          const sessionId = clientEntry?.client.currentSessionId;
          if (!sessionId) {
            sendResponse({ success: false, error: NO_SESSION_ERROR });
            return;
          }
          const success = this.flutterManager.hotRestart(sessionId);
          sendResponse({ success, error: success ? undefined : 'No process running' });
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
          const options = data as { summaryOnly?: boolean } | undefined;
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
          const options = data as { maxLines?: number } | undefined;
          // Get logs from session (persisted) instead of process (ephemeral)
          const logs = this.sessionManager.getLogs(sessionId, options?.maxLines);
          sendResponse({ success: true, data: { logs } });
          break;
        }

        case 'execute_interaction':
          sendResponse({ success: false, error: `${action} not yet implemented` });
          break;

        case 'agent_message': {
          const clientEntry = this.clients.get(clientId);
          const sessionId = clientEntry?.client.currentSessionId;
          if (!sessionId) {
            sendResponse({ success: false, error: NO_SESSION_ERROR });
            return;
          }
          const session = this.sessionManager.get(sessionId);
          if (!session?.agent) {
            sendResponse({ success: false, error: 'No agent for session' });
            return;
          }
          const { intent, conversationId } = data as { intent: string; conversationId?: string };

          const vmClient = this.vmClients.get(sessionId);

          const onEvent = (partialEvent: Omit<AgentStreamEvent, 'type' | 'id' | 'sessionId'>) => {
            const streamEvent: AgentStreamEvent = {
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
            const result = await session.agent.execute({
              intent,
              conversationId,
              vmClient,
              sessionId,
              cwd: session.projectPath,
              onEvent,
            });

            ws.send(JSON.stringify({
              type: 'agent_response',
              id,
              status: result.status,
              summary: result.summary,
              error: result.error,
              question: result.question,
              conversationId: result.conversationId,
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'agent_response',
              id,
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
            }));
          }
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (err) {
      sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private handleDisconnect(clientIdOrTemp: string): void {
    const clientEntry = this.clients.get(clientIdOrTemp);
    if (clientEntry) {
      console.error(`[daemon] Client disconnected: ${clientEntry.client.id}`);
      this.sessionManager.disconnectClientFromAll(clientEntry.client.id);
      this.clients.delete(clientIdOrTemp);
    }
  }

  private sendError(ws: WebSocket, id: string, error: string): void {
    ws.send(JSON.stringify({ type: 'command_response', id, success: false, error } satisfies CommandResponse));
  }

  broadcastEvent(source: MonitoringEvent['source'], eventType: string, payload: unknown, sessionId?: string): void {
    const event: MonitoringEvent = {
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

  getClientCount(): number {
    return this.clients.size;
  }
}
