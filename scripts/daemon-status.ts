#!/usr/bin/env bun
/**
 * Check Fleeter daemon status
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PLIST_NAME = 'com.fleeter.daemon.plist';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', PLIST_NAME);
const LOG_PATH = join(homedir(), 'Library', 'Logs', 'fleeter-daemon.log');

async function main() {
  console.log('Fleeter Daemon Status\n');

  // Check if plist exists
  const plistInstalled = existsSync(PLIST_PATH);
  console.log(`Service installed: ${plistInstalled ? '✓ Yes' : '✗ No'}`);

  if (!plistInstalled) {
    console.log('\nRun `bun run daemon:install` to install the service.');
    return;
  }

  // Check launchctl
  let isRunning = false;
  let output = '';
  try {
    output = execSync('launchctl list | grep com.fleeter.daemon', { encoding: 'utf-8' }).trim();
    isRunning = true;
  } catch {
    isRunning = false;
  }

  if (isRunning && output) {
    const parts = output.split('\t');
    const pid = parts[0] !== '-' ? parts[0] : null;
    const lastExitCode = parts[1];

    console.log(`Service running: ✓ Yes`);
    if (pid) {
      console.log(`PID: ${pid}`);
    }
    if (lastExitCode && lastExitCode !== '0') {
      console.log(`Last exit code: ${lastExitCode}`);
    }
  } else {
    console.log(`Service running: ✗ No`);
  }

  // Check WebSocket connectivity
  try {
    const ws = new WebSocket('ws://127.0.0.1:9877');
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.close();
        resolve();
      };
      ws.onerror = reject;
      setTimeout(() => reject(new Error('timeout')), 2000);
    });
    console.log(`WebSocket port 9877: ✓ Accepting connections`);
  } catch {
    console.log(`WebSocket port 9877: ✗ Not responding`);
  }

  // Log file
  console.log(`\nLog file: ${LOG_PATH}`);
  if (existsSync(LOG_PATH)) {
    console.log('View logs: bun run daemon:logs');
  }
}

main().catch(console.error);
