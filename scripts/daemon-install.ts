#!/usr/bin/env bun
/**
 * Install the Fleeter daemon as a launchd service (macOS)
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

const PLIST_NAME = 'com.fleeter.daemon.plist';
const LAUNCH_AGENTS_DIR = join(homedir(), 'Library', 'LaunchAgents');
const FLEETER_DIR = join(homedir(), '.fleeter');
const LOGS_DIR = join(FLEETER_DIR, 'logs');
const PLIST_PATH = join(LAUNCH_AGENTS_DIR, PLIST_NAME);

async function main() {
  // Find bun executable
  const bunPath = Bun.which('bun');
  if (!bunPath) {
    console.error('Error: bun not found in PATH');
    process.exit(1);
  }

  // Build first to ensure we have latest code
  const rootDir = dirname(import.meta.dir);
  console.log('Building daemon...');
  const buildResult = spawnSync('bun', ['run', 'build'], { cwd: rootDir, stdio: 'inherit' });
  if (buildResult.status !== 0) {
    console.error('Failed to build daemon');
    process.exit(1);
  }

  // Get the daemon script path
  const daemonDir = join(rootDir, 'packages', 'fleeter-daemon');
  const daemonScript = join(daemonDir, 'dist', 'bin', 'daemon.js');

  if (!existsSync(daemonScript)) {
    console.error(`Error: Daemon not built.`);
    console.error(`Expected: ${daemonScript}`);
    process.exit(1);
  }

  // Ensure directories exist
  if (!existsSync(LAUNCH_AGENTS_DIR)) {
    mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  }
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }

  const logPath = join(LOGS_DIR, 'launchd.log');

  // Generate plist content
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.fleeter.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>${bunPath}</string>
        <string>run</string>
        <string>${daemonScript}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>FLEETER_PORT</key>
        <string>9877</string>
        <key>PATH</key>
        <string>${process.env.PATH}</string>
        <key>HOME</key>
        <string>${homedir()}</string>
    </dict>
</dict>
</plist>
`;

  // Unload existing service if present
  if (existsSync(PLIST_PATH)) {
    console.log('Unloading existing service...');
    spawnSync('launchctl', ['unload', PLIST_PATH], { stdio: 'inherit' });
  }

  // Write the plist file
  writeFileSync(PLIST_PATH, plistContent);
  console.log(`✓ Created ${PLIST_PATH}`);

  // Load the service
  const loadResult = spawnSync('launchctl', ['load', PLIST_PATH], { stdio: 'inherit' });
  if (loadResult.status !== 0) {
    console.error('Failed to load service');
    process.exit(1);
  }
  console.log('✓ Service loaded');

  // Verify it's running
  await Bun.sleep(500);
  try {
    execSync('launchctl list | grep com.fleeter.daemon', { encoding: 'utf-8' });
    console.log('✓ Fleeter daemon is running');
    console.log(`\nLogs: ~/.fleeter/logs/`);
    console.log('View logs: bun run logs:daemon');
  } catch {
    console.log('⚠ Service loaded but may not be running. Check logs:');
    console.log(`  tail -f ${logPath}`);
  }
}

main().catch(console.error);
