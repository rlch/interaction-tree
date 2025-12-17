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
declare class Monitor extends EventEmitter {
    private instanceId;
    private minLevel;
    private filter;
    private logToStderr;
    constructor(config?: MonitorConfig);
    emitEvent(source: EventSource, type: string, payload: unknown, level?: EventLevel): boolean;
    flutter: {
        log: (line: string, stderr?: boolean) => void;
        lifecycle: (status: "starting" | "running" | "stopped" | "error", details?: {
            projectPath?: string;
            device?: string;
            vmServiceUri?: string;
            pid?: number;
            error?: string;
        }) => void;
    };
    vm: {
        connected: (uri: string) => void;
        disconnected: (uri?: string) => void;
        error: (message: string, stack?: string) => void;
    };
    agent: {
        toolCall: (toolName: string, args: Record<string, unknown>, conversationId?: string) => void;
        toolResult: (toolName: string, durationMs: number, status: "success" | "error", details?: {
            error?: string;
            summary?: string;
        }) => void;
    };
    mcp: {
        request: (method: string, toolName?: string, args?: Record<string, unknown>) => void;
        response: (method: string, durationMs: number, success: boolean, details?: {
            toolName?: string;
            error?: string;
        }) => void;
    };
    tree: {
        snapshot: (nodeCount: number, rootIds: string[], tree?: unknown) => void;
        diff: (added: string[], removed: string[], changed: string[]) => void;
    };
    subscribe(listener: (event: MonitoringEvent) => void): () => void;
    getInstanceId(): string;
}
export declare function getMonitor(config?: MonitorConfig): Monitor;
export declare function resetMonitor(): void;
export {};
//# sourceMappingURL=monitor.d.ts.map