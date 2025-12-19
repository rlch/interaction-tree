#!/usr/bin/env bun
/**
 * Uninstall the Fleeter daemon launchd service (macOS)
 */

import { spawnSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PLIST_NAME = 'com.fleeter.daemon.plist';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', PLIST_NAME);

async function main() {
  // Always kill any running daemon processes first
  const pkillResult = spawnSync('pkill', ['-f', 'fleeter-daemon/dist/bin/daemon.js'], { stdio: 'inherit' });
  if (pkillResult.status === 0) {
    console.log('✓ Killed daemon process');
  }

  if (!existsSync(PLIST_PATH)) {
    console.log('Fleeter daemon service is not installed.');
    return;
  }

  console.log('Unloading service...');
  const result = spawnSync('launchctl', ['unload', PLIST_PATH], { stdio: 'inherit' });
  
  if (result.status === 0) {
    console.log('✓ Service unloaded');
  } else {
    console.log('⚠ Service may not have been running');
  }

  unlinkSync(PLIST_PATH);
  console.log(`✓ Removed ${PLIST_PATH}`);
  console.log('\nFleeter daemon service uninstalled.');
}

main().catch(console.error);
