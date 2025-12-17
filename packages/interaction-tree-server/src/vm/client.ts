/**
 * VM Service client for connecting to Flutter apps.
 * Implements JSON-RPC 2.0 over WebSocket.
 */

import WebSocket from 'ws';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  VMIsolateRef,
} from './protocol.js';
import type {
  InteractionTarget,
  InteractionResult,
  BatchStep,
  BatchResult,
  GetTreeOptions,
} from '../types/interaction-tree.js';
import type {
  LogEntry,
  RuntimeError,
  HotReloadResult,
  AppStatus,
} from '../types/dart-tooling.js';

export class VMServiceClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private isolateId: string | null = null;
  private uri: string | null = null;
  private onCloseCallbacks: Array<() => void> = [];

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get connectionUri(): string | null {
    return this.uri;
  }

  /**
   * Connect to a Flutter app via VM service WebSocket.
   */
  async connect(uri: string): Promise<void> {
    if (this.ws) {
      await this.disconnect();
    }

    this.uri = uri;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(uri);

      this.ws.on('open', async () => {
        try {
          await this.findMainIsolate();
          resolve();
        } catch (err) {
          // Close the socket if we can't find the isolate
          this.ws?.close();
          this.ws = null;
          this.uri = null;
          reject(err);
        }
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        this.handleClose();
      });

      this.ws.on('error', (err) => {
        reject(new Error(`WebSocket error: ${err.message}`));
      });
    });
  }

  /**
   * Disconnect from the VM service.
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isolateId = null;
      this.uri = null;
    }
  }

  /**
   * Register a callback for when the connection closes.
   */
  onClose(callback: () => void): void {
    this.onCloseCallbacks.push(callback);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Interaction Tree Methods
  // ─────────────────────────────────────────────────────────────────────────────

  async getTree(options?: GetTreeOptions): Promise<InteractionTarget[]> {
    const result = await this.callExtension('ext.interaction_tree.getTree', {
      includeBounds: options?.includeBounds ?? false,
      includeWidgetType: options?.includeWidgetType ?? false,
      includeState: options?.includeState ?? false,
    });
    return (result as { targets: InteractionTarget[] }).targets ?? [];
  }

  async execute(
    id: string,
    interaction: string,
    args?: Record<string, unknown>
  ): Promise<InteractionResult> {
    return (await this.callExtension('ext.interaction_tree.execute', {
      id,
      interaction,
      args,
    })) as InteractionResult;
  }

  async tap(id: string): Promise<InteractionResult> {
    return this.execute(id, 'tap');
  }

  async doubleTap(id: string): Promise<InteractionResult> {
    return this.execute(id, 'doubleTap');
  }

  async longPress(id: string): Promise<InteractionResult> {
    return this.execute(id, 'longPress');
  }

  async enterText(id: string, text: string): Promise<InteractionResult> {
    return this.execute(id, 'enterText', { text });
  }

  async clearText(id: string): Promise<InteractionResult> {
    return this.execute(id, 'clearText');
  }

  async scroll(
    id: string,
    dx: number,
    dy: number
  ): Promise<InteractionResult> {
    return this.execute(id, 'scroll', { dx, dy });
  }

  async drag(id: string, dx: number, dy: number): Promise<InteractionResult> {
    return this.execute(id, 'drag', { dx, dy });
  }

  async scrollIntoView(
    id: string,
    alignment = 0
  ): Promise<InteractionResult> {
    return this.execute(id, 'scrollIntoView', { alignment });
  }

  async waitFor(
    id: string,
    condition: 'exists' | 'notExists' | 'visible' | 'notVisible' = 'exists',
    timeoutMs = 10000
  ): Promise<InteractionResult> {
    return this.execute(id, 'waitFor', { condition, timeoutMs });
  }

  async getState(id: string): Promise<Record<string, unknown>> {
    return (await this.callExtension('ext.interaction_tree.getState', {
      id,
    })) as Record<string, unknown>;
  }

  async executeAction(
    id: string,
    actionName: string,
    args?: Record<string, unknown>
  ): Promise<InteractionResult> {
    return this.execute(id, 'executeAction', { actionName, args });
  }

  async batch(steps: BatchStep[]): Promise<BatchResult> {
    return (await this.callExtension('ext.interaction_tree.batch', {
      steps,
    })) as BatchResult;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Dart Tooling Methods
  // ─────────────────────────────────────────────────────────────────────────────

  async hotReload(): Promise<HotReloadResult> {
    try {
      // Use callExtension to include isolateId
      await this.callExtension('ext.flutter.reassemble', {});
      return { success: true, reloadedAt: new Date().toISOString() };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async hotRestart(): Promise<HotReloadResult> {
    try {
      // Hot restart via Flutter extension
      await this.callExtension('ext.flutter.hotRestart', {});
      return { success: true, restartedAt: new Date().toISOString() };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getLogs(_since?: string): Promise<LogEntry[]> {
    // TODO: Implement log collection from VM service
    // This may require connecting to the Dart Tooling Daemon instead
    return [];
  }

  async getRuntimeErrors(): Promise<RuntimeError[]> {
    // TODO: Implement error collection
    return [];
  }

  async getStatus(): Promise<AppStatus> {
    return {
      connected: this.isConnected,
      isolateId: this.isolateId ?? undefined,
      appUri: this.uri ?? undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal Methods
  // ─────────────────────────────────────────────────────────────────────────────

  private async findMainIsolate(): Promise<void> {
    const vm = (await this.callMethod('getVM', {})) as {
      isolates: VMIsolateRef[];
    };

    // Find the main isolate (non-system isolate)
    const mainIsolate = vm.isolates.find((iso) => !iso.isSystemIsolate);
    if (!mainIsolate) {
      throw new Error('No main isolate found');
    }

    this.isolateId = mainIsolate.id;
  }

  private async callMethod(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to VM service');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(request));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private async callExtension(
    method: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.isolateId) {
      throw new Error('No isolate connected');
    }

    const result = await this.callMethod(method, {
      isolateId: this.isolateId,
      ...args,
    });

    return result;
  }

  private handleMessage(data: string): void {
    try {
      const response = JSON.parse(data) as JsonRpcResponse;

      if (response.id !== undefined) {
        const pending = this.pending.get(response.id);
        if (pending) {
          this.pending.delete(response.id);
          if (response.error) {
            pending.reject(
              new Error(response.error.message || 'Unknown error')
            );
          } else {
            pending.resolve(response.result);
          }
        }
      }
    } catch {
      // Ignore parse errors for now
    }
  }

  private handleClose(): void {
    this.ws = null;
    this.isolateId = null;

    // Reject all pending requests
    for (const [, { reject }] of this.pending) {
      reject(new Error('Connection closed'));
    }
    this.pending.clear();

    // Notify listeners
    for (const callback of this.onCloseCallbacks) {
      callback();
    }
  }
}

// Singleton instance for the server
let vmClient: VMServiceClient | null = null;

export function getVMClient(): VMServiceClient {
  if (!vmClient) {
    vmClient = new VMServiceClient();
  }
  return vmClient;
}
