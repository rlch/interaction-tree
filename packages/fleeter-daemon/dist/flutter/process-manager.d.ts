/**
 * Flutter process manager - handles spawning and managing flutter run processes.
 */
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
export interface FlutterProcess {
    process: ChildProcess;
    pid: number;
    logs: string[];
    vmServiceUri?: string;
    startedAt?: Date;
}
export interface RunAppOptions {
    device?: string;
    flavor?: string;
    target?: string;
    dartDefines?: Record<string, string>;
    additionalArgs?: string[];
}
export declare class FlutterProcessManager extends EventEmitter {
    private processes;
    runApp(sessionId: string, projectPath: string, options?: RunAppOptions): Promise<FlutterProcess>;
    stopApp(sessionId: string): Promise<void>;
    sendKey(sessionId: string, key: string): boolean;
    hotReload(sessionId: string): boolean;
    hotRestart(sessionId: string): boolean;
    getProcess(sessionId: string): FlutterProcess | undefined;
    getLogs(sessionId: string, maxLines?: number): string[];
    private addLog;
    stopAll(): Promise<void>;
}
//# sourceMappingURL=process-manager.d.ts.map