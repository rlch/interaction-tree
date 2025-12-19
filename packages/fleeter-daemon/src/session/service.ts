/**
 * SessionService - unified service for all session operations.
 * One instance per active session, wrapping VMServiceClient, SessionManager, and FlutterProcessManager.
 */

import { EventEmitter } from 'events';
import type { VMServiceClient } from '../vm/client.js';
import type { SessionManager } from './manager.js';
import type { FlutterProcessManager, RunAppOptions } from '../flutter/process-manager.js';
import type { SessionInfo } from './types.js';
import type {
  InteractionTarget,
  InteractionResult,
  BatchStep,
  BatchResult,
  GetTreeOptions,
  RuntimeError,
  HotReloadResult,
} from '../vm/types.js';

export interface SessionServiceOptions {
  sessionId: string;
  vmClient: VMServiceClient;
  sessionManager: SessionManager;
  processManager: FlutterProcessManager;
  projectPath: string;
}

export interface SessionStatus {
  sessionInfo: SessionInfo;
  vmConnected: boolean;
  vmServiceUri?: string;
}

export class SessionService extends EventEmitter {
  private readonly sessionId: string;
  private readonly vmClient: VMServiceClient;
  private readonly sessionManager: SessionManager;
  private readonly processManager: FlutterProcessManager;
  private readonly projectPath: string;

  private treeCache: InteractionTarget[] | null = null;
  private treeCacheTime: number = 0;
  private readonly treeCacheTtlMs = 500;

  constructor(options: SessionServiceOptions) {
    super();
    this.sessionId = options.sessionId;
    this.vmClient = options.vmClient;
    this.sessionManager = options.sessionManager;
    this.processManager = options.processManager;
    this.projectPath = options.projectPath;

    this.vmClient.on('treeChanged', () => this.invalidateTreeCache());
    this.vmClient.on('interaction', () => this.invalidateTreeCache());
  }

  get id(): string {
    return this.sessionId;
  }

  get isVmConnected(): boolean {
    return this.vmClient.isConnected;
  }

  get client(): VMServiceClient {
    return this.vmClient;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VMServiceClient methods (require VM connection)
  // ─────────────────────────────────────────────────────────────────────────────

  async getTree(options?: GetTreeOptions): Promise<InteractionTarget[]> {
    this.requireVmConnection();

    const now = Date.now();
    if (this.treeCache && now - this.treeCacheTime < this.treeCacheTtlMs) {
      return this.treeCache;
    }

    const tree = await this.vmClient.getTree(options);
    this.treeCache = tree;
    this.treeCacheTime = now;
    return tree;
  }

  async execute(
    nodeId: string,
    interaction: string,
    args?: Record<string, unknown>
  ): Promise<InteractionResult> {
    this.requireVmConnection();
    this.invalidateTreeCache();
    return this.vmClient.execute(nodeId, interaction, args);
  }

  async getState(nodeId: string): Promise<Record<string, unknown>> {
    this.requireVmConnection();
    return this.vmClient.getState(nodeId);
  }

  async batch(steps: BatchStep[]): Promise<BatchResult> {
    this.requireVmConnection();
    this.invalidateTreeCache();
    return this.vmClient.batch(steps);
  }

  async hotReload(clearErrors = false): Promise<HotReloadResult> {
    this.requireVmConnection();
    this.invalidateTreeCache();
    return this.vmClient.hotReload(clearErrors);
  }

  async hotRestart(clearErrors = true): Promise<HotReloadResult> {
    this.requireVmConnection();
    this.invalidateTreeCache();
    return this.vmClient.hotRestart(clearErrors);
  }

  async getRuntimeErrors(): Promise<RuntimeError[]> {
    this.requireVmConnection();
    return this.vmClient.getRuntimeErrors();
  }

  clearRuntimeErrors(): void {
    if (this.vmClient.isConnected) {
      this.vmClient.clearRuntimeErrors();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SessionManager methods
  // ─────────────────────────────────────────────────────────────────────────────

  getLogs(maxLines = 100): string[] {
    return this.sessionManager.getLogs(this.sessionId, maxLines);
  }

  getStatus(): SessionStatus {
    const session = this.sessionManager.get(this.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${this.sessionId}`);
    }

    return {
      sessionInfo: this.sessionManager.toInfo(session),
      vmConnected: this.vmClient.isConnected,
      vmServiceUri: this.vmClient.connectionUri ?? undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FlutterProcessManager methods
  // ─────────────────────────────────────────────────────────────────────────────

  async runApp(options?: RunAppOptions): Promise<void> {
    await this.processManager.runApp(this.sessionId, this.projectPath, options);
  }

  async stopApp(): Promise<void> {
    await this.processManager.stopApp(this.sessionId);
    this.invalidateTreeCache();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private requireVmConnection(): void {
    if (!this.vmClient.isConnected) {
      throw new Error(
        'VM service not connected. Start the app with runApp() first, or wait for the VM to connect.'
      );
    }
  }

  private invalidateTreeCache(): void {
    this.treeCache = null;
    this.treeCacheTime = 0;
  }
}
