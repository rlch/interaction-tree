/**
 * Manages multiple Flutter app instances.
 * Each instance has its own process, VM connection, and dedicated agent.
 */
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { VMServiceClient } from '../vm/client.js';
export interface AppInstance {
    id: string;
    name?: string;
    projectPath: string;
    device?: string;
    status: 'starting' | 'running' | 'stopped' | 'error';
    vmServiceUri?: string;
    pid?: number;
    startedAt?: Date;
    error?: string;
}
export interface RunOptions {
    projectPath: string;
    name?: string;
    device?: string;
    flavor?: string;
    target?: string;
    dartDefines?: Record<string, string>;
    additionalArgs?: string[];
}
export interface RebuildOptions extends RunOptions {
    clean?: boolean;
}
interface ManagedInstance {
    info: AppInstance;
    process: ChildProcess | null;
    vmClient: VMServiceClient;
    logs: string[];
}
declare class AppManager extends EventEmitter {
    private instances;
    private readonly maxLogs;
    /**
     * List all app instances.
     */
    list(): AppInstance[];
    /**
     * Get an instance by ID or name.
     */
    get(idOrName: string): ManagedInstance | undefined;
    /**
     * Get instance info by ID or name.
     */
    getInfo(idOrName: string): AppInstance | undefined;
    /**
     * Run a new Flutter app instance.
     */
    run(options: RunOptions): Promise<AppInstance>;
    /**
     * Stop an instance by ID or name.
     */
    stop(idOrName: string): Promise<void>;
    /**
     * Remove an instance (must be stopped first).
     */
    remove(idOrName: string): boolean;
    /**
     * Hot reload an instance.
     */
    hotReload(idOrName: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Hot restart an instance.
     */
    hotRestart(idOrName: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Rebuild an instance (stop, optionally clean, restart).
     */
    rebuild(idOrName: string, options: RebuildOptions): Promise<AppInstance>;
    /**
     * Get logs for an instance.
     */
    getLogs(idOrName: string, maxLines?: number): string[];
    /**
     * Get VM client for an instance.
     */
    getVMClient(idOrName: string): VMServiceClient | undefined;
    private startProcess;
    private connectToApp;
    private addLog;
}
export declare function getAppManager(): AppManager;
export {};
//# sourceMappingURL=app-manager.d.ts.map