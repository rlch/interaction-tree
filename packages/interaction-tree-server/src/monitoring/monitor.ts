/**
 * Monitoring event bus singleton.
 * Emits structured events that can be consumed by WebSocket clients, CLI tools, etc.
 */

import { EventEmitter } from 'events';
import type { MonitoringEvent, EventSource, EventLevel } from './types.js';

export interface MonitorConfig {
  instanceId?: string;
  minLevel?: EventLevel;
  filter?: string[];
  logToStderr?: boolean;
}

const LEVEL_PRIORITY: Record<EventLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Monitor extends EventEmitter {
  private instanceId: string;
  private minLevel: EventLevel;
  private filter: Set<string> | null;
  private logToStderr: boolean;

  constructor(config: MonitorConfig = {}) {
    super();
    this.instanceId =
      config.instanceId ??
      process.env.INTERACTION_TREE_INSTANCE_ID ??
      `it-${Date.now().toString(36)}`;
    this.minLevel =
      config.minLevel ??
      (process.env.INTERACTION_TREE_MONITOR_LEVEL as EventLevel) ??
      'info';
    this.filter = config.filter
      ? new Set(config.filter)
      : process.env.INTERACTION_TREE_MONITOR_FILTER
        ? new Set(process.env.INTERACTION_TREE_MONITOR_FILTER.split(','))
        : null;
    this.logToStderr = config.logToStderr ?? true;
  }

  emitEvent(
    source: EventSource,
    type: string,
    payload: unknown,
    level: EventLevel = 'info'
  ): boolean {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return false;
    }

    if (this.filter && !this.filter.has(type) && !this.filter.has(source)) {
      return false;
    }

    const event: MonitoringEvent = {
      ts: new Date().toISOString(),
      instanceId: this.instanceId,
      source,
      type,
      level,
      payload,
    };

    if (this.logToStderr) {
      const levelIcon =
        { error: '❌', warn: '⚠️', info: 'ℹ️', debug: '🔍' }[level] ?? '•';
      console.error(
        `${levelIcon} [${source}] ${type}: ${JSON.stringify(payload)}`
      );
    }

    return super.emit('event', event);
  }

  flutter = {
    log: (line: string, stderr = false) => {
      this.emitEvent(
        'flutter',
        'flutter.log',
        { line, stderr },
        stderr ? 'warn' : 'debug'
      );
    },

    lifecycle: (
      status: 'starting' | 'running' | 'stopped' | 'error',
      details?: {
        projectPath?: string;
        device?: string;
        vmServiceUri?: string;
        pid?: number;
        error?: string;
      }
    ) => {
      this.emitEvent(
        'flutter',
        'flutter.lifecycle',
        { status, ...details },
        status === 'error' ? 'error' : 'info'
      );
    },
  };

  vm = {
    connected: (uri: string) => {
      this.emitEvent('vm', 'vm.connected', { uri }, 'info');
    },

    disconnected: (uri?: string) => {
      this.emitEvent('vm', 'vm.disconnected', { uri }, 'info');
    },

    error: (message: string, stack?: string) => {
      this.emitEvent('vm', 'vm.error', { message, stack }, 'error');
    },
  };

  agent = {
    toolCall: (
      toolName: string,
      args: Record<string, unknown>,
      conversationId?: string
    ) => {
      this.emitEvent(
        'agent',
        'agent.tool_call',
        { toolName, args, conversationId },
        'info'
      );
    },

    toolResult: (
      toolName: string,
      durationMs: number,
      status: 'success' | 'error',
      details?: { error?: string; summary?: string }
    ) => {
      this.emitEvent(
        'agent',
        'agent.tool_result',
        { toolName, durationMs, status, ...details },
        status === 'error' ? 'error' : 'info'
      );
    },
  };

  mcp = {
    request: (method: string, toolName?: string, args?: Record<string, unknown>) => {
      this.emitEvent('mcp', 'mcp.request', { method, toolName, args }, 'debug');
    },

    response: (
      method: string,
      durationMs: number,
      success: boolean,
      details?: { toolName?: string; error?: string }
    ) => {
      this.emitEvent(
        'mcp',
        'mcp.response',
        { method, durationMs, success, ...details },
        success ? 'debug' : 'error'
      );
    },
  };

  tree = {
    snapshot: (nodeCount: number, rootIds: string[], tree?: unknown) => {
      this.emitEvent(
        'interaction_tree',
        'interaction_tree.snapshot',
        { nodeCount, rootIds, tree },
        'debug'
      );
    },

    diff: (added: string[], removed: string[], changed: string[]) => {
      this.emitEvent(
        'interaction_tree',
        'interaction_tree.diff',
        { added, removed, changed },
        'info'
      );
    },
  };

  subscribe(listener: (event: MonitoringEvent) => void): () => void {
    this.on('event', listener);
    return () => this.off('event', listener);
  }

  getInstanceId(): string {
    return this.instanceId;
  }
}

let monitor: Monitor | null = null;

export function getMonitor(config?: MonitorConfig): Monitor {
  if (!monitor) {
    monitor = new Monitor(config);
  }
  return monitor;
}

export function resetMonitor(): void {
  monitor = null;
}
