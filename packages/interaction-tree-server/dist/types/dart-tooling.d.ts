/**
 * Types for Dart tooling / VM service operations.
 */
export interface LogEntry {
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'debug';
    message: string;
    logger?: string;
}
export interface RuntimeError {
    message: string;
    stackTrace?: string;
    timestamp?: string;
}
export interface HotReloadResult {
    success: boolean;
    reloadedAt?: string;
    restartedAt?: string;
    error?: string;
}
export interface AppStatus {
    connected: boolean;
    isolateId?: string;
    appUri?: string;
    paused?: boolean;
}
export interface LaunchAppOptions {
    target?: string;
    device?: string;
    flavor?: string;
    additionalArgs?: string[];
}
export interface LaunchAppResult {
    success: boolean;
    pid?: number;
    vmServiceUri?: string;
    error?: string;
}
//# sourceMappingURL=dart-tooling.d.ts.map