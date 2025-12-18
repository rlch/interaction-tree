/**
 * VM Service client for connecting to Flutter apps.
 * Implements JSON-RPC 2.0 over WebSocket.
 *
 * Subscribes to VM Service event streams (Extension, Debug) to receive
 * real-time notifications like Flutter.Frame and Flutter.Navigation,
 * similar to how Flutter DevTools gets widget tree updates.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { log } from '../logger.js';
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
  LogEntry,
  RuntimeError,
  HotReloadResult,
  AppStatus,
} from './types.js';

/** Events emitted by VMServiceClient */
export interface VMServiceEvents {
  /** Fired when tree may have changed (Frame, Navigation, Reload events) */
  treeChanged: () => void;
  /** Fired on Flutter.Frame events (rate-limited) */
  frame: () => void;
  /** Fired on Flutter.Navigation events */
  navigation: (route?: string) => void;
  /** Fired on isolate reload (hot reload/restart) */
  reload: () => void;
  /** Fired when connection closes */
  close: () => void;
}

/** Rate limiter for frame events (like DevTools at 5 FPS) */
class RateLimiter {
  private lastCall = 0;
  private pending = false;

  constructor(private fps: number) {}

  call(fn: () => void): void {
    const now = Date.now();
    const minInterval = 1000 / this.fps;

    if (now - this.lastCall >= minInterval) {
      this.lastCall = now;
      fn();
    } else if (!this.pending) {
      this.pending = true;
      setTimeout(() => {
        this.pending = false;
        this.lastCall = Date.now();
        fn();
      }, minInterval - (now - this.lastCall));
    }
  }
}

export class VMServiceClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private isolateId: string | null = null;
  private uri: string | null = null;
  private onCloseCallbacks: Array<() => void> = [];
  private frameRateLimiter = new RateLimiter(5); // 5 FPS like DevTools
  private receivedNavigationEvent = false;
  private receivedReloadEvent = false;

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get connectionUri(): string | null {
    return this.uri;
  }

  /**
   * Connect to a Flutter app via VM service WebSocket.
   * Subscribes to Extension and Isolate event streams for real-time updates.
   */
  async connect(uri: string): Promise<void> {
    log.vm.info({ uri }, 'Connecting to VM service');
    
    if (this.ws) {
      await this.disconnect();
    }

    this.uri = uri;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(uri);

      this.ws.on('open', async () => {
        log.vm.debug('WebSocket opened');
        try {
          await this.findMainIsolate();
          log.vm.info({ isolateId: this.isolateId }, 'Found main isolate');
          await this.subscribeToStreams();
          log.vm.info('VM client connected and subscribed to streams');
          resolve();
        } catch (err) {
          log.vm.error({ err }, 'Failed to initialize VM client');
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
        log.vm.error({ err: err.message }, 'WebSocket error');
        reject(new Error(`WebSocket error: ${err.message}`));
      });
    });
  }

  /**
   * Subscribe to VM Service event streams for real-time updates.
   * Similar to how Flutter DevTools receives widget tree change notifications.
   */
  private async subscribeToStreams(): Promise<void> {
    log.vm.debug('Subscribing to VM Service streams');
    try {
      // Subscribe to Extension events (Flutter.Frame, Flutter.Navigation, etc.)
      const extResult = await this.callMethod('streamListen', { streamId: 'Extension' });
      log.vm.debug({ result: extResult }, 'Subscribed to Extension stream');
    } catch (err) {
      log.vm.warn({ err }, 'Failed to subscribe to Extension stream (may already be subscribed)');
    }
    
    try {
      // Subscribe to Isolate events (reload, restart)
      const isoResult = await this.callMethod('streamListen', { streamId: 'Isolate' });
      log.vm.debug({ result: isoResult }, 'Subscribed to Isolate stream');
    } catch (err) {
      log.vm.warn({ err }, 'Failed to subscribe to Isolate stream (may already be subscribed)');
    }
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
      summaryOnly: options?.summaryOnly ?? false,
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
      const message = JSON.parse(data) as JsonRpcResponse & {
        method?: string;
        params?: { streamId?: string; event?: { kind?: string; extensionKind?: string; extensionData?: unknown } };
      };

      // Handle stream events (notifications without id)
      if (message.method === 'streamNotify' && message.params) {
        log.vm.trace({ streamId: message.params.streamId, event: message.params.event }, 'Received stream notification');
        this.handleStreamEvent(message.params);
        return;
      }

      // Handle responses to our requests
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          if (message.error) {
            log.vm.debug({ id: message.id, error: message.error }, 'Request failed');
            pending.reject(
              new Error(message.error.message || 'Unknown error')
            );
          } else {
            pending.resolve(message.result);
          }
        }
      }
    } catch (err) {
      log.vm.warn({ err, data: data.substring(0, 200) }, 'Failed to parse message');
    }
  }

  /**
   * Handle incoming VM Service stream events.
   * Emits appropriate events for tree updates.
   */
  private handleStreamEvent(params: { streamId?: string; event?: { kind?: string; extensionKind?: string; extensionData?: unknown } }): void {
    const { streamId, event } = params;
    if (!event) {
      log.vm.debug({ streamId }, 'Stream event with no event data');
      return;
    }

    // Extension events (Flutter.Frame, Flutter.Navigation, etc.)
    if (streamId === 'Extension') {
      const extensionKind = event.extensionKind;
      log.vm.debug({ extensionKind }, 'Extension event received');

      if (extensionKind === 'Flutter.Frame') {
        // Rate-limit frame events to 5 FPS
        // Only trigger tree update after navigation or reload
        if (this.receivedNavigationEvent || this.receivedReloadEvent) {
          log.vm.debug('Frame event after nav/reload - triggering tree update');
          this.frameRateLimiter.call(() => {
            this.receivedNavigationEvent = false;
            this.receivedReloadEvent = false;
            this.emit('frame');
            this.emit('treeChanged');
          });
        }
      } else if (extensionKind === 'Flutter.Navigation') {
        log.vm.info({ extensionData: event.extensionData }, 'Navigation event');
        this.receivedNavigationEvent = true;
        const route = (event.extensionData as { route?: string })?.route;
        this.emit('navigation', route);
        // Emit tree changed immediately on navigation
        this.emit('treeChanged');
      } else if (extensionKind === 'Flutter.FirstFrame') {
        log.vm.info('First frame event - triggering initial tree fetch');
        // First frame after app start - definitely want tree
        this.emit('treeChanged');
      } else {
        log.vm.trace({ extensionKind }, 'Unhandled extension event');
      }
    }

    // Isolate events (reload, restart)
    if (streamId === 'Isolate') {
      if (event.kind === 'IsolateReload') {
        this.receivedReloadEvent = true;
        this.emit('reload');
        this.emit('treeChanged');
      }
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

    // Notify listeners (legacy callback style)
    for (const callback of this.onCloseCallbacks) {
      callback();
    }

    // Emit close event (new EventEmitter style)
    this.emit('close');
  }
}
