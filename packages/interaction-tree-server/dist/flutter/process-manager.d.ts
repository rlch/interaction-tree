/**
 * Flutter process manager - handles spawning, monitoring, and controlling Flutter apps.
 */
import { EventEmitter } from 'events';
export interface FlutterAppState {
    status: 'starting' | 'running' | 'stopped' | 'error';
    projectPath: string;
    device?: string;
    vmServiceUri?: string;
    pid?: number;
    error?: string;
    startedAt?: Date;
    logs: string[];
}
export interface RunOptions {
    projectPath: string;
    device?: string;
    flavor?: string;
    target?: string;
    dartDefines?: Record<string, string>;
    additionalArgs?: string[];
}
export interface RebuildOptions extends RunOptions {
    clean?: boolean;
}
declare class FlutterProcessManager extends EventEmitter {
    private process;
    private state;
    private logBuffer;
    private readonly maxLogs;
    get currentState(): FlutterAppState | null;
    get isRunning(): boolean;
    /**
     * Run a Flutter app.
     */
    run(options: RunOptions): Promise<FlutterAppState>;
    /**
     * Stop the running Flutter app.
     */
    stop(): Promise<void>;
    /**
     * Hot reload the app (apply code changes, preserve state).
     */
    hotReload(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Hot restart the app (reset state, same process).
     */
    hotRestart(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Full rebuild - stop, optionally clean, and run again.
     */
    rebuild(options: RebuildOptions): Promise<FlutterAppState>;
    /**
     * Get recent logs.
     */
    getLogs(maxLines?: number): string[];
    /**
     * Send a custom command to the Flutter process.
     */
    sendCommand(command: string): void;
    private connectToApp;
    private handleFlutterEvent;
    private addLog;
}
export declare function getFlutterProcessManager(): FlutterProcessManager;
export {};
//# sourceMappingURL=process-manager.d.ts.map