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
  vmClient?: VMServiceClient;
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
  private vmClient?: VMServiceClient;
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

    if (this.vmClient) {
      this.vmClient.on('treeChanged', () => this.invalidateTreeCache());
      this.vmClient.on('interaction', () => this.invalidateTreeCache());
    }
  }

  /** Set the VM client (called when VM connects after runApp) */
  setVmClient(vmClient: VMServiceClient): void {
    this.vmClient = vmClient;
    this.vmClient.on('treeChanged', () => this.invalidateTreeCache());
    this.vmClient.on('interaction', () => this.invalidateTreeCache());
  }

  /** Clear the VM client (called when app exits but session persists) */
  clearVmClient(): void {
    this.vmClient = undefined;
    this.invalidateTreeCache();
  }

  get id(): string {
    return this.sessionId;
  }

  get isVmConnected(): boolean {
    return this.vmClient?.isConnected ?? false;
  }

  get client(): VMServiceClient | undefined {
    return this.vmClient;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VMServiceClient methods (require VM connection)
  // ─────────────────────────────────────────────────────────────────────────────

  async getTree(options?: GetTreeOptions): Promise<InteractionTarget[]> {
    const client = this.requireVmConnection();

    const now = Date.now();
    if (this.treeCache && now - this.treeCacheTime < this.treeCacheTtlMs) {
      return this.treeCache;
    }

    const tree = await client.getTree(options);
    this.treeCache = tree;
    this.treeCacheTime = now;
    return tree;
  }

  async execute(
    nodeId: string,
    interaction: string,
    args?: Record<string, unknown>
  ): Promise<InteractionResult> {
    const client = this.requireVmConnection();
    this.invalidateTreeCache();
    return client.execute(nodeId, interaction, args);
  }

  async getState(nodeId: string): Promise<Record<string, unknown>> {
    const client = this.requireVmConnection();
    return client.getState(nodeId);
  }

  async batch(steps: BatchStep[]): Promise<BatchResult> {
    const client = this.requireVmConnection();
    this.invalidateTreeCache();
    return client.batch(steps);
  }

  async hotReload(clearErrors = false): Promise<HotReloadResult> {
    const client = this.requireVmConnection();
    this.invalidateTreeCache();
    return client.hotReload(clearErrors);
  }

  async hotRestart(clearErrors = true): Promise<HotReloadResult> {
    const client = this.requireVmConnection();
    this.invalidateTreeCache();
    return client.hotRestart(clearErrors);
  }

  async getRuntimeErrors(): Promise<RuntimeError[]> {
    const client = this.requireVmConnection();
    return client.getRuntimeErrors();
  }

  clearRuntimeErrors(): void {
    if (this.vmClient?.isConnected) {
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
      vmConnected: this.vmClient?.isConnected ?? false,
      vmServiceUri: this.vmClient?.connectionUri ?? undefined,
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

  private requireVmConnection(): VMServiceClient {
    if (!this.vmClient || !this.vmClient.isConnected) {
      throw new Error(
        'VM service not connected. Start the app with runApp() first, or wait for the VM to connect.'
      );
    }
    return this.vmClient;
  }

  private invalidateTreeCache(): void {
    this.treeCache = null;
    this.treeCacheTime = 0;
  }
}
