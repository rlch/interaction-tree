/**
 * MCP Server for interaction tree.
 * Supports two modes:
 * - agent (default): AI-powered intent interpretation
 * - raw: Direct tool access
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
export type ServerMode = 'agent' | 'raw';
export interface ServerConfig {
    mode: ServerMode;
}
export declare function createServer(config: ServerConfig): Server;
export declare function startServer(config: ServerConfig): Promise<void>;
//# sourceMappingURL=server.d.ts.map