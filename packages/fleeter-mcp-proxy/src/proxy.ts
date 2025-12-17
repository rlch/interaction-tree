/**
 * MCP Proxy - translates MCP protocol to daemon WebSocket commands.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DaemonClient } from './daemon-client.js';

const TOOLS = [
  {
    name: 'create_session',
    description: 'Create a new Flutter session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Session name' },
        projectPath: { type: 'string', description: 'Path to Flutter project' },
      },
      required: ['name', 'projectPath'],
    },
  },
  {
    name: 'list_sessions',
    description: 'List all Flutter sessions',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'connect_session',
    description: 'Connect to an existing session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string', description: 'Session ID or name' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'destroy_session',
    description: 'Destroy a session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'run_app',
    description: 'Run Flutter app in current session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        device: { type: 'string', description: 'Target device' },
        flavor: { type: 'string', description: 'Build flavor' },
        target: { type: 'string', description: 'Target file' },
      },
    },
  },
  {
    name: 'stop_app',
    description: 'Stop Flutter app in current session',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'hot_reload',
    description: 'Hot reload the running app',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'hot_restart',
    description: 'Hot restart the running app',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_tree',
    description: 'Get interaction tree from running app',
    inputSchema: {
      type: 'object' as const,
      properties: {
        summaryOnly: { type: 'boolean', description: 'Only include user widgets' },
      },
    },
  },
  {
    name: 'execute_interaction',
    description: 'Execute an interaction on a widget',
    inputSchema: {
      type: 'object' as const,
      properties: {
        nodeId: { type: 'string', description: 'Target node ID' },
        interaction: { type: 'string', description: 'Interaction name' },
        args: { type: 'object', description: 'Interaction arguments' },
      },
      required: ['nodeId', 'interaction'],
    },
  },
  {
    name: 'get_status',
    description: 'Get daemon and session status',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

export class McpProxy {
  private server: Server;
  private daemonClient: DaemonClient;

  constructor(daemonClient: DaemonClient) {
    this.daemonClient = daemonClient;
    this.server = new Server(
      { name: 'fleeter', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOLS };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.daemonClient.sendCommand(name, args as Record<string, unknown>);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[mcp-proxy] MCP server started');
  }
}
