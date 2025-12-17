/**
 * Session types for fleeter-daemon.
 */

import type { AgentExecutor } from '../agent/index.js';

export type AppStatus = 'not_running' | 'starting' | 'running' | 'stopped' | 'error';

export interface SessionInfo {
  id: string;
  name: string;
  projectPath: string;
  appStatus: AppStatus;
  vmServiceUri?: string;
  pid?: number;
  connectedClients: string[];  // Client IDs connected to this session
  createdAt: string;
  lastActiveAt: string;
}

export interface Session {
  id: string;
  name: string;
  projectPath: string;
  appStatus: AppStatus;
  vmServiceUri?: string;
  pid?: number;
  connectedClients: Set<string>;
  createdAt: Date;
  lastActiveAt: Date;
  agent?: AgentExecutor;  // Per-session agent
}

export interface CreateSessionOptions {
  name: string;
  projectPath: string;
}
