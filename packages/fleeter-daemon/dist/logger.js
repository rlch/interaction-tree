/**
 * Structured logging for Fleeter daemon.
 * Logs to ~/.fleeter/logs/ with rotation.
 */
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import os from 'os';
const FLEETER_DIR = path.join(os.homedir(), '.fleeter');
const LOGS_DIR = path.join(FLEETER_DIR, 'logs');
// Ensure log directory exists
function ensureLogDir() {
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
}
// Get log file path with date suffix for rotation
function getLogFilePath() {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(LOGS_DIR, `daemon-${date}.log`);
}
// Create multi-destination transport (file + stderr)
function createTransport() {
    ensureLogDir();
    const targets = [
        // File output (JSON for parsing)
        {
            target: 'pino/file',
            options: { destination: getLogFilePath() },
            level: 'trace',
        },
    ];
    // Add pretty console output if not in production
    if (process.env.NODE_ENV !== 'production') {
        targets.push({
            target: 'pino-pretty',
            options: {
                destination: 2, // stderr
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
            level: 'debug',
        });
    }
    else {
        // Plain JSON to stderr in production
        targets.push({
            target: 'pino/file',
            options: { destination: 2 },
            level: 'info',
        });
    }
    return pino.transport({ targets });
}
// Create the logger instance
export const logger = pino({
    name: 'fleeter-daemon',
    level: process.env.LOG_LEVEL || 'debug',
    // Add useful base context
    base: {
        pid: process.pid,
    },
}, createTransport());
// Create child loggers for specific modules
export const createLogger = (module) => logger.child({ module });
// Pre-created loggers for common modules
export const log = {
    daemon: createLogger('daemon'),
    vm: createLogger('vm'),
    flutter: createLogger('flutter'),
    session: createLogger('session'),
    ws: createLogger('ws'),
    tree: createLogger('tree'),
    agent: createLogger('agent'),
};
//# sourceMappingURL=logger.js.map