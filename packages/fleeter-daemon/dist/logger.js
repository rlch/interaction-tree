/**
 * Structured logging for Fleeter daemon.
 * Logs to ~/.fleeter/logs/ with rotation.
 */
import pino, { multistream } from 'pino';
import pinoPretty from 'pino-pretty';
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
// Create multi-destination stream (file + stderr) using synchronous destinations
function createStreams() {
    ensureLogDir();
    const streams = [
        // File output (JSON for parsing) - synchronous write
        {
            level: 'trace',
            stream: pino.destination({
                dest: getLogFilePath(),
                sync: true, // Ensure immediate writes
            }),
        },
    ];
    // Add pretty console output if not in production
    if (process.env.NODE_ENV !== 'production') {
        streams.push({
            level: 'debug',
            stream: pinoPretty({
                destination: 2, // stderr
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            }),
        });
    }
    else {
        // Plain JSON to stderr in production
        streams.push({
            level: 'info',
            stream: pino.destination({ dest: 2, sync: true }),
        });
    }
    return streams;
}
// Create the logger instance with multistream for multiple destinations
export const logger = pino({
    name: 'fleeter-daemon',
    level: process.env.LOG_LEVEL || 'debug',
    // Add useful base context
    base: {
        pid: process.pid,
    },
}, multistream(createStreams()));
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