/**
 * Structured logging for Fleeter daemon.
 * Logs to ~/.fleeter/logs/ with rotation.
 */
import pino from 'pino';
export declare const logger: pino.Logger<never, boolean>;
export declare const createLogger: (module: string) => pino.Logger<never, boolean>;
export declare const log: {
    daemon: pino.Logger<never, boolean>;
    vm: pino.Logger<never, boolean>;
    flutter: pino.Logger<never, boolean>;
    session: pino.Logger<never, boolean>;
    ws: pino.Logger<never, boolean>;
    tree: pino.Logger<never, boolean>;
    agent: pino.Logger<never, boolean>;
};
export type Logger = pino.Logger;
//# sourceMappingURL=logger.d.ts.map