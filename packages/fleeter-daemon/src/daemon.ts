/**
 * Main Fleeter Daemon class.
 */

import { SessionManager } from './session/index.js';
import { DaemonServer } from './ws/index.js';
import { FlutterProcessManager } from './flutter/index.js';
import { VMServiceClient } from './vm/index.js';

export interface DaemonConfig {
  port: number;
  host?: string;
}

export class Daemon {
  private config: DaemonConfig;
  private sessionManager: SessionManager;
  private server: DaemonServer;
  private flutterManager: FlutterProcessManager;
  private vmClients = new Map<string, VMServiceClient>();
  private running = false;

  constructor(config: DaemonConfig) {
    this.config = config;
    this.sessionManager = new SessionManager();
    this.flutterManager = new FlutterProcessManager();
    this.server = new DaemonServer(this.sessionManager, this.flutterManager, this.vmClients);

    this.setupFlutterEvents();
  }

  private setupFlutterEvents(): void {
    this.flutterManager.on('started', async (sessionId: string, vmServiceUri: string) => {
      this.sessionManager.updateStatus(sessionId, 'running', { vmServiceUri });
      
      // Connect VM client
      const vmClient = new VMServiceClient();
      try {
        await vmClient.connect(vmServiceUri);
        this.vmClients.set(sessionId, vmClient);
        console.error(`[daemon] VM client connected for session ${sessionId}`);
      } catch (err) {
        console.error(`[daemon] Failed to connect VM client: ${err}`);
      }
    });

    this.flutterManager.on('exit', (sessionId: string) => {
      this.sessionManager.updateStatus(sessionId, 'stopped');
      const vmClient = this.vmClients.get(sessionId);
      if (vmClient) {
        vmClient.disconnect();
        this.vmClients.delete(sessionId);
      }
    });

    this.flutterManager.on('log', (sessionId: string, line: string) => {
      this.server.broadcastEvent('flutter', 'flutter.log', { line }, sessionId);
    });

    this.flutterManager.on('error', (sessionId: string, err: Error) => {
      console.error(`[daemon] Flutter error for session ${sessionId}: ${err.message}`);
      this.sessionManager.updateStatus(sessionId, 'error', { error: err.message });
      this.server.broadcastEvent('flutter', 'flutter.error', { error: err.message }, sessionId);
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      console.error('[daemon] Already running');
      return;
    }

    this.server.start({ port: this.config.port, host: this.config.host });
    this.running = true;

    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));

    console.error(`[daemon] Fleeter daemon started (PID: ${process.pid})`);
  }

  async shutdown(signal?: string): Promise<void> {
    if (!this.running) return;

    console.error(`[daemon] Shutting down${signal ? ` (${signal})` : ''}...`);
    
    // Stop all Flutter processes
    await this.flutterManager.stopAll();
    
    // Disconnect all VM clients
    for (const vmClient of this.vmClients.values()) {
      await vmClient.disconnect();
    }
    
    this.server.stop();
    this.running = false;
    console.error('[daemon] Shutdown complete');
    process.exit(0);
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  getFlutterManager(): FlutterProcessManager {
    return this.flutterManager;
  }

  getServer(): DaemonServer {
    return this.server;
  }

  isRunning(): boolean {
    return this.running;
  }
}
