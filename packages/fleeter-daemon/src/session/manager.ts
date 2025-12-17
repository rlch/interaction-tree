/**
 * SessionManager - manages sessions shared across all daemon clients.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { Session, SessionInfo, CreateSessionOptions } from './types.js';
import { AgentExecutor } from '../agent/index.js';

export class SessionManager extends EventEmitter {
  private sessions = new Map<string, Session>();

  /**
   * Create a new session.
   */
  create(options: CreateSessionOptions): SessionInfo {
    // Check for duplicate name
    for (const session of this.sessions.values()) {
      if (session.name === options.name) {
        throw new Error(`Session with name "${options.name}" already exists`);
      }
    }

    const id = uuidv4();
    const now = new Date();

    const session: Session = {
      id,
      name: options.name,
      projectPath: options.projectPath,
      appStatus: 'not_running',
      connectedClients: new Set(),
      createdAt: now,
      lastActiveAt: now,
      agent: new AgentExecutor(),  // Create agent for this session
    };

    this.sessions.set(id, session);
    console.error(`[session-manager] Created session "${options.name}" (${id})`);
    this.emit('session:created', this.toInfo(session));

    return this.toInfo(session);
  }

  /**
   * Destroy a session.
   */
  async destroy(nameOrId: string): Promise<void> {
    const session = this.get(nameOrId);
    if (!session) {
      throw new Error(`Session not found: ${nameOrId}`);
    }

    // Notify connected clients
    this.emit('session:destroying', session.id);

    this.sessions.delete(session.id);
    console.error(`[session-manager] Destroyed session "${session.name}"`);
    this.emit('session:destroyed', session.id);
  }

  /**
   * List all sessions.
   */
  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => this.toInfo(s));
  }

  /**
   * Get a session by name or ID.
   */
  get(nameOrId: string): Session | undefined {
    // Try by ID first
    if (this.sessions.has(nameOrId)) {
      return this.sessions.get(nameOrId);
    }
    // Try by name
    for (const session of this.sessions.values()) {
      if (session.name === nameOrId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Connect a client to a session.
   */
  connectClient(sessionNameOrId: string, clientId: string): SessionInfo {
    const session = this.get(sessionNameOrId);
    if (!session) {
      throw new Error(`Session not found: ${sessionNameOrId}`);
    }

    session.connectedClients.add(clientId);
    session.lastActiveAt = new Date();
    console.error(`[session-manager] Client ${clientId} connected to session "${session.name}"`);
    this.emit('session:client_connected', session.id, clientId);

    return this.toInfo(session);
  }

  /**
   * Disconnect a client from a session.
   */
  disconnectClient(sessionNameOrId: string, clientId: string): void {
    const session = this.get(sessionNameOrId);
    if (!session) return;

    session.connectedClients.delete(clientId);
    console.error(`[session-manager] Client ${clientId} disconnected from session "${session.name}"`);
    this.emit('session:client_disconnected', session.id, clientId);
  }

  /**
   * Disconnect a client from all sessions.
   */
  disconnectClientFromAll(clientId: string): void {
    for (const session of this.sessions.values()) {
      if (session.connectedClients.has(clientId)) {
        this.disconnectClient(session.id, clientId);
      }
    }
  }

  /**
   * Get sessions a client is connected to.
   */
  getClientSessions(clientId: string): SessionInfo[] {
    return Array.from(this.sessions.values())
      .filter((s) => s.connectedClients.has(clientId))
      .map((s) => this.toInfo(s));
  }

  /**
   * Update session status.
   */
  updateStatus(sessionId: string, status: Session['appStatus'], details?: { vmServiceUri?: string; pid?: number; error?: string }): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.appStatus = status;
    if (details?.vmServiceUri) session.vmServiceUri = details.vmServiceUri;
    if (details?.pid) session.pid = details.pid;
    session.lastActiveAt = new Date();

    this.emit('session:status_changed', this.toInfo(session));
  }

  private toInfo(session: Session): SessionInfo {
    return {
      id: session.id,
      name: session.name,
      projectPath: session.projectPath,
      appStatus: session.appStatus,
      vmServiceUri: session.vmServiceUri,
      pid: session.pid,
      connectedClients: Array.from(session.connectedClients),
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
    };
  }
}
