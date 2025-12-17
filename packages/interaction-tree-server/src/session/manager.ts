/**
 * SessionManager - manages sessions with dedicated agents per Flutter app.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { VMServiceClient } from '../vm/client.js';
import type {
  Session,
  SessionInfo,
  SessionApp,
  CreateSessionOptions,
  RunAppOptions,
  RebuildAppOptions,
} from './types.js';

const VM_SERVICE_URI_REGEX =
  /Observatory\s+(?:listening\s+on|debugger\s+and\s+profiler\s+available\s+at)\s+(wss?:\/\/\S+)/i;

const MAX_LOGS = 1000;

class SessionManager extends EventEmitter {
  private sessions = new Map<string, Session>();
  private activeSessionId: string | null = null;

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
      app: null,
      createdAt: now,
      lastActiveAt: now,
    };

    this.sessions.set(id, session);
    console.error(`[session-manager] Created session "${options.name}" (${id})`);

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

    // Stop app if running
    if (session.app) {
      await this.stopApp(nameOrId);
    }

    // Clear active if this was it
    if (this.activeSessionId === session.id) {
      this.activeSessionId = null;
    }

    this.sessions.delete(session.id);
    console.error(`[session-manager] Destroyed session "${session.name}"`);
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
   * Connect to a session (set as active).
   */
  connect(nameOrId: string): SessionInfo {
    const session = this.get(nameOrId);
    if (!session) {
      throw new Error(`Session not found: ${nameOrId}`);
    }

    this.activeSessionId = session.id;
    session.lastActiveAt = new Date();
    console.error(`[session-manager] Connected to session "${session.name}"`);

    return this.toInfo(session);
  }

  /**
   * Disconnect from current session.
   */
  disconnect(): void {
    if (this.activeSessionId) {
      const session = this.sessions.get(this.activeSessionId);
      console.error(
        `[session-manager] Disconnected from session "${session?.name ?? this.activeSessionId}"`
      );
    }
    this.activeSessionId = null;
  }

  /**
   * Get the active session.
   */
  getActive(): Session | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) ?? null;
  }

  /**
   * Get the active session or throw.
   */
  requireActive(): Session {
    const session = this.getActive();
    if (!session) {
      throw new Error('No active session. Use connect tool first.');
    }
    session.lastActiveAt = new Date();
    return session;
  }

  /**
   * Get VM client for active session.
   */
  getActiveVMClient(): VMServiceClient | null {
    const session = this.getActive();
    return session?.app?.vmClient ?? null;
  }

  /**
   * Require VM client for active session.
   */
  requireActiveVMClient(): VMServiceClient {
    const session = this.requireActive();
    if (!session.app?.vmClient) {
      throw new Error('App not running in active session. Use run tool first.');
    }
    if (!session.app.vmClient.isConnected) {
      throw new Error('App not connected. It may have crashed.');
    }
    return session.app.vmClient;
  }

  /**
   * Run app in active session.
   */
  async runApp(options: RunAppOptions = {}): Promise<SessionInfo> {
    const session = this.requireActive();

    if (session.app?.status === 'running' || session.app?.status === 'starting') {
      throw new Error('App already running in this session');
    }

    const vmClient = new VMServiceClient();
    const app: SessionApp = {
      process: null as unknown as ChildProcess,
      vmClient,
      status: 'starting',
      logs: [],
    };
    session.app = app;

    try {
      await this.startProcess(session, options);
      return this.toInfo(session);
    } catch (err) {
      app.status = 'error';
      app.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Stop app in active session.
   */
  async stopApp(nameOrId?: string): Promise<void> {
    const session = nameOrId ? this.get(nameOrId) : this.getActive();
    if (!session) {
      throw new Error(nameOrId ? `Session not found: ${nameOrId}` : 'No active session');
    }

    if (!session.app) {
      return; // Already stopped
    }

    console.error(`[session-manager] Stopping app in session "${session.name}"`);

    // Disconnect VM client
    if (session.app.vmClient.isConnected) {
      await session.app.vmClient.disconnect();
    }

    // Stop process
    if (session.app.process) {
      session.app.process.stdin?.write('q\n');

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          session.app?.process?.kill('SIGKILL');
          resolve();
        }, 5000);

        session.app?.process?.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    session.app.status = 'stopped';
  }

  /**
   * Hot reload app in active session.
   */
  async hotReload(): Promise<{ success: boolean; error?: string }> {
    const vmClient = this.requireActiveVMClient();
    const session = this.requireActive();

    // Send 'r' for hot reload
    if (session.app?.process?.stdin) {
      session.app.process.stdin.write('r');
    }

    return await vmClient.hotReload();
  }

  /**
   * Hot restart app in active session.
   */
  async hotRestart(): Promise<{ success: boolean; error?: string }> {
    const vmClient = this.requireActiveVMClient();
    const session = this.requireActive();

    // Send 'R' for hot restart
    if (session.app?.process?.stdin) {
      session.app.process.stdin.write('R');
    }

    return await vmClient.hotRestart();
  }

  /**
   * Rebuild app in active session.
   */
  async rebuildApp(options: RebuildAppOptions): Promise<SessionInfo> {
    const session = this.requireActive();

    console.error(`[session-manager] Rebuilding app in session "${session.name}"`);

    // Stop current app
    await this.stopApp();

    // Clean if requested
    if (options.clean) {
      console.error('[session-manager] Running flutter clean...');
      await new Promise<void>((resolve, reject) => {
        const clean = spawn('flutter', ['clean'], {
          cwd: session.projectPath,
          stdio: 'inherit',
        });
        clean.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`flutter clean failed with code ${code}`));
        });
        clean.on('error', reject);
      });
    }

    // Restart
    return this.runApp(options);
  }

  /**
   * Get logs for active session.
   */
  getLogs(maxLines?: number): string[] {
    const session = this.getActive();
    if (!session?.app) return [];
    const count = maxLines ?? 100;
    return session.app.logs.slice(-count);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────────────────

  private async startProcess(session: Session, options: RunAppOptions): Promise<void> {
    const args = ['run', '--machine'];

    if (options.device) {
      args.push('-d', options.device);
    }

    if (options.flavor) {
      args.push('--flavor', options.flavor);
    }

    if (options.target) {
      args.push('-t', options.target);
    }

    if (options.dartDefines) {
      for (const [key, value] of Object.entries(options.dartDefines)) {
        args.push('--dart-define', `${key}=${value}`);
      }
    }

    if (options.additionalArgs) {
      args.push(...options.additionalArgs);
    }

    return new Promise((resolve, reject) => {
      console.error(
        `[session-manager] Starting app in session "${session.name}": flutter ${args.join(' ')}`
      );
      console.error(`[session-manager] Working directory: ${session.projectPath}`);

      const process = spawn('flutter', args, {
        cwd: session.projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      session.app!.process = process;
      session.app!.pid = process.pid;

      let vmServiceUri: string | null = null;
      let resolved = false;

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          this.addLog(session, line);

          // Try to parse machine-readable output
          if (line.startsWith('[{') || line.startsWith('{')) {
            try {
              const events = line.startsWith('[')
                ? JSON.parse(line)
                : [JSON.parse(line)];
              for (const event of events) {
                // Check for VM service URI
                if (event.params?.wsUri) {
                  vmServiceUri = event.params.wsUri as string;
                } else if (event.params?.uri && !vmServiceUri) {
                  vmServiceUri = event.params.uri as string;
                }

                // Check for app.started
                if (event.event === 'app.started' && vmServiceUri && !resolved) {
                  resolved = true;
                  this.connectToApp(session, vmServiceUri)
                    .then(() => resolve())
                    .catch(reject);
                }
              }
            } catch {
              // Not JSON
            }
          }

          // Fallback: regex match
          if (!vmServiceUri) {
            const match = line.match(VM_SERVICE_URI_REGEX);
            if (match) {
              vmServiceUri = match[1];
            }
          }
        }
      };

      process.stdout?.on('data', handleOutput);
      process.stderr?.on('data', handleOutput);

      process.on('error', (err) => {
        console.error(`[session-manager] Process error: ${err.message}`);
        if (session.app) {
          session.app.status = 'error';
          session.app.error = err.message;
        }
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      process.on('exit', (code, signal) => {
        console.error(
          `[session-manager] App in session "${session.name}" exited: code=${code}, signal=${signal}`
        );
        if (session.app) {
          session.app.status = 'stopped';
        }
        this.emit('exit', session.id, code, signal);
      });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (vmServiceUri) {
            this.connectToApp(session, vmServiceUri)
              .then(() => resolve())
              .catch(reject);
          } else {
            reject(new Error('Timeout waiting for app to start'));
          }
        }
      }, 120000);
    });
  }

  private async connectToApp(session: Session, uri: string): Promise<void> {
    console.error(`[session-manager] Connecting session "${session.name}" to ${uri}`);

    await session.app!.vmClient.connect(uri);

    session.app!.status = 'running';
    session.app!.vmServiceUri = uri;
    session.app!.startedAt = new Date();

    console.error(`[session-manager] Session "${session.name}" connected`);
  }

  private addLog(session: Session, line: string): void {
    if (!session.app) return;
    session.app.logs.push(line);
    if (session.app.logs.length > MAX_LOGS) {
      session.app.logs.shift();
    }
  }

  private toInfo(session: Session): SessionInfo {
    return {
      id: session.id,
      name: session.name,
      projectPath: session.projectPath,
      appStatus: session.app?.status ?? 'not_running',
      vmServiceUri: session.app?.vmServiceUri,
      pid: session.app?.pid,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
    };
  }
}

// Singleton
let manager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!manager) {
    manager = new SessionManager();
  }
  return manager;
}
