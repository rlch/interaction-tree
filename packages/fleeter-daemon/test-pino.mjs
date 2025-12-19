import pino, { multistream } from 'pino';
import pinoPretty from 'pino-pretty';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LOGS_DIR = path.join(os.homedir(), '.fleeter', 'logs');
const logPath = path.join(LOGS_DIR, 'test-multistream.log');

// Remove old test log
fs.rmSync(logPath, { force: true });

const streams = [
  {
    level: 'trace',
    stream: pino.destination({
      dest: logPath,
      sync: true,
    }),
  },
  {
    level: 'debug',
    stream: pinoPretty({
      destination: 2,
      colorize: true,
    }),
  },
];

const logger = pino(
  {
    name: 'test',
    level: 'debug',
  },
  multistream(streams)
);

logger.info('Test info message');
logger.debug('Test debug message');

// Check file
setTimeout(() => {
  console.log('\n=== Log file contents ===');
  console.log(fs.readFileSync(logPath, 'utf8'));
}, 100);
