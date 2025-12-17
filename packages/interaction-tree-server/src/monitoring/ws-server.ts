/**
 * WebSocket server for streaming monitoring events and handling commands.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { getMonitor } from './monitor.js';
import type {
  MonitoringEvent,
  Command,
  AgentMessage,
  CommandResponse,
  AgentResponse,
  isCommand,
  isAgentMessage,
} from './types.js';
import { getFlutterProcessManager } from '../flutter/process-manager.js';
import { getVMClient } from '../vm/client.js';

let wss: WebSocketServer | null = null;

export interface MonitoringServerConfig {
  port: number;
  host?: string;
}

type CommandHandler = (cmd: Command, ws: WebSocket) => Promise<void>;
type AgentHandler = (msg: AgentMessage, ws: WebSocket) => Promise<void>;

let commandHandler: CommandHandler | null = null;
let agentHandler: AgentHandler | null = null;

async function handleCommand(cmd: Command, ws: WebSocket): Promise<void> {
  const manager = getFlutterProcessManager();
  const vmClient = getVMClient();

  const sendResponse = (response: Omit<CommandResponse, 'type' | 'id'>) => {
    ws.send(JSON.stringify({
      type: 'command_response',
      id: cmd.id,
      ...response,
    } satisfies CommandResponse));
  };

  try {
    switch (cmd.action) {
      case 'hot_reload': {
        if (!manager.isRunning) {
          sendResponse({ success: false, error: 'No app running' });
          return;
        }
        const result = await manager.hotReload();
        sendResponse({ success: result.success, error: result.error });
        break;
      }

      case 'hot_restart': {
        if (!manager.isRunning) {
          sendResponse({ success: false, error: 'No app running' });
          return;
        }
        const result = await manager.hotRestart();
        sendResponse({ success: result.success, error: result.error });
        break;
      }

      case 'stop': {
        await manager.stop();
        sendResponse({ success: true });
        break;
      }

      case 'flutter_key': {
        if (!cmd.key) {
          sendResponse({ success: false, error: 'No key specified' });
          return;
        }
        manager.sendCommand(cmd.key);
        sendResponse({ success: true });
        break;
      }

      case 'get_status': {
        const state = manager.currentState;
        sendResponse({
          success: true,
          data: {
            process: state ? {
              status: state.status,
              projectPath: state.projectPath,
              device: state.device,
              vmServiceUri: state.vmServiceUri,
              pid: state.pid,
            } : null,
            vmConnection: {
              connected: vmClient.isConnected,
              uri: vmClient.connectionUri,
            },
          },
        });
        break;
      }

      case 'get_tree': {
        if (!vmClient.isConnected) {
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
  } catch (err) {
    sendResponse({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function setCommandHandler(handler: CommandHandler): void {
  commandHandler = handler;
}

export function setAgentHandler(handler: AgentHandler): void {
  agentHandler = handler;
}

export function startMonitoringServer(
  config: MonitoringServerConfig | number
): WebSocketServer {
  const port = typeof config === 'number' ? config : config.port;
  const host = typeof config === 'number' ? '127.0.0.1' : config.host ?? '127.0.0.1';

  if (wss) {
    console.error(`[monitoring] WebSocket server already running`);
    return wss;
  }

  wss = new WebSocketServer({ port, host });
  const monitor = getMonitor();
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.error(`[monitoring] Client connected (${clients.size} total)`);

    ws.send(
      JSON.stringify({
        type: 'monitoring.connected',
        ts: new Date().toISOString(),
        instanceId: monitor.getInstanceId(),
        payload: { message: 'Connected to monitoring stream' },
      })
    );

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'command') {
          if (commandHandler) {
            await commandHandler(msg as Command, ws);
          } else {
            await handleCommand(msg as Command, ws);
          }
        } else if (msg.type === 'agent_message') {
          if (agentHandler) {
            await agentHandler(msg as AgentMessage, ws);
          } else {
            ws.send(JSON.stringify({
              type: 'agent_response',
              id: (msg as AgentMessage).id,
              status: 'failed',
              error: 'Agent handler not configured',
            } satisfies AgentResponse));
          }
        }
      } catch (err) {
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

  const unsubscribe = monitor.subscribe((event: MonitoringEvent) => {
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

export function stopMonitoringServer(): void {
  if (wss) {
    wss.close();
    wss = null;
    console.error('[monitoring] WebSocket server stopped');
  }
}

export function getMonitoringServer(): WebSocketServer | null {
  return wss;
}

export function broadcastToClients(message: object): void {
  if (!wss) return;
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
