/**
 * Flutter process manager - handles spawning and managing flutter run processes.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
import { log } from '../logger.js';

// DevTools URI may be printed as plain text even in --machine mode
const DEVTOOLS_URI_REGEX =
  /Flutter DevTools.*?available at:\s+(https?:\/\/\S+)/i;

const MAX_LOGS = 1000;

/**
 * Find the Flutter executable.
 * Uses Bun's which() if available, otherwise falls back to common paths.
 */
function findFlutterExecutable(): string {
  // Try Bun's native which() if running under Bun
  if (typeof globalThis.Bun !== 'undefined') {
    const flutterPath = globalThis.Bun.which('flutter');
    if (flutterPath) {
      return flutterPath;
    }
  }

  // Fallback: check common installation paths
  const homeDir = process.env.HOME || '';
  const commonPaths = [
    // FVM (Flutter Version Manager)
    join(homeDir, 'fvm/default/bin/flutter'),
    join(homeDir, '.fvm/default/bin/flutter'),
    // Standard Flutter install locations
    join(homeDir, 'development/flutter/bin/flutter'),
    join(homeDir, 'flutter/bin/flutter'),
    join(homeDir, '.flutter/bin/flutter'),
    // Homebrew (macOS)
    '/opt/homebrew/bin/flutter',
    '/usr/local/bin/flutter',
    // Snap (Linux)
    '/snap/bin/flutter',
    // asdf
    join(homeDir, '.asdf/shims/flutter'),
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Final fallback - let the system try to find it
  return 'flutter';
}

export interface FlutterProcess {
  process: ChildProcess;
  pid: number;
  logs: string[];
  vmServiceUri?: string;
  devToolsUri?: string;
  appId?: string;
  deviceId?: string;
  startedAt?: Date;
}

export interface RunAppOptions {
  device?: string;
  flavor?: string;
  target?: string;
  dartDefines?: Record<string, string>;
  additionalArgs?: string[];
}

export class FlutterProcessManager extends EventEmitter {
  private processes = new Map<string, FlutterProcess>();

  async runApp(sessionId: string, projectPath: string, options: RunAppOptions = {}): Promise<FlutterProcess> {
    if (this.processes.has(sessionId)) {
      throw new Error('App already running for this session');
    }

    const args = ['run', '--machine'];

    if (options.device) args.push('-d', options.device);
    if (options.flavor) args.push('--flavor', options.flavor);
    if (options.target) args.push('-t', options.target);
    if (options.dartDefines) {
      for (const [key, value] of Object.entries(options.dartDefines)) {
        args.push('--dart-define', `${key}=${value}`);
      }
    }
    if (options.additionalArgs) args.push(...options.additionalArgs);

    return new Promise((resolve, reject) => {
      const flutterCmd = findFlutterExecutable();
      console.error(`[flutter] Starting app: ${flutterCmd} ${args.join(' ')}`);
      console.error(`[flutter] Working directory: ${projectPath}`);

      const proc = spawn(flutterCmd, args, {
        cwd: projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });

      const flutterProcess: FlutterProcess = {
        process: proc,
        pid: proc.pid!,
        logs: [],
      };

      this.processes.set(sessionId, flutterProcess);
      let vmServiceUri: string | null = null;
      let resolved = false;

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          this.addLog(sessionId, line);
          this.emit('log', sessionId, line);

          // Parse machine output for VM service URI, appId, deviceId
          if (line.startsWith('[{') || line.startsWith('{')) {
            try {
              const events = line.startsWith('[') ? JSON.parse(line) : [JSON.parse(line)];
              for (const event of events) {
                // Capture appId and deviceId from app.start event
                if (event.event === 'app.start' && event.params) {
                  if (event.params.appId) flutterProcess.appId = event.params.appId as string;
                  if (event.params.deviceId) flutterProcess.deviceId = event.params.deviceId as string;
                  this.emit('launching', sessionId, {
                    appId: flutterProcess.appId,
                    deviceId: flutterProcess.deviceId,
                  });
                }

                // Capture VM service URI from app.debugPort event
                if (event.params?.wsUri) {
                  log.flutter.debug({ sessionId, wsUri: event.params.wsUri, eventType: event.event }, 'Found wsUri in event params');
                  vmServiceUri = event.params.wsUri as string;
                } else if (event.params?.uri && !vmServiceUri) {
                  log.flutter.debug({ sessionId, uri: event.params.uri, eventType: event.event }, 'Found uri in event params (fallback)');
                  vmServiceUri = event.params.uri as string;
                }

                if (event.event === 'app.started' && vmServiceUri && !resolved) {
                  log.flutter.info({ sessionId, vmServiceUri }, 'app.started event received with vmServiceUri - emitting started');
                  resolved = true;
                  flutterProcess.vmServiceUri = vmServiceUri;
                  flutterProcess.startedAt = new Date();
                  this.emit('started', sessionId, vmServiceUri);
                  resolve(flutterProcess);
                } else if (event.event === 'app.started' && !vmServiceUri) {
                  log.flutter.warn({ sessionId }, 'app.started event received but NO vmServiceUri available yet');
                } else if (event.event === 'app.started' && resolved) {
                  log.flutter.debug({ sessionId }, 'app.started event received but already resolved');
                }
              }
            } catch {
              // Not JSON
            }
          }

          // Capture DevTools URI from plain text output
          if (!flutterProcess.devToolsUri) {
            const devToolsMatch = line.match(DEVTOOLS_URI_REGEX);
            if (devToolsMatch) {
              flutterProcess.devToolsUri = devToolsMatch[1];
              this.emit('devtools', sessionId, flutterProcess.devToolsUri);
            }
          }
        }
      };

      proc.stdout?.on('data', handleOutput);
      proc.stderr?.on('data', handleOutput);

      proc.on('error', (err) => {
        console.error(`[flutter] Process error: ${err.message}`);
        this.emit('error', sessionId, err);
        if (!resolved) {
          resolved = true;
          this.processes.delete(sessionId);
          reject(err);
        }
      });

      proc.on('exit', (code, signal) => {
        console.error(`[flutter] Process exited: code=${code}, signal=${signal}`);
        this.processes.delete(sessionId);
        this.emit('exit', sessionId, code, signal);
      });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          log.flutter.warn({ sessionId, vmServiceUri }, 'Timeout reached - checking vmServiceUri');
          resolved = true;
          if (vmServiceUri) {
            log.flutter.info({ sessionId, vmServiceUri }, 'Timeout fallback: emitting started with vmServiceUri');
            flutterProcess.vmServiceUri = vmServiceUri;
            flutterProcess.startedAt = new Date();
            this.emit('started', sessionId, vmServiceUri);
            resolve(flutterProcess);
          } else {
            log.flutter.error({ sessionId }, 'Timeout fallback: NO vmServiceUri - rejecting');
            this.processes.delete(sessionId);
            reject(new Error('Timeout waiting for app to start'));
          }
        }
      }, 120000);
    });
  }

  async stopApp(sessionId: string): Promise<void> {
    const flutterProcess = this.processes.get(sessionId);
    if (!flutterProcess) return;

    console.error(`[flutter] Stopping app for session ${sessionId}`);

    flutterProcess.process.stdin?.write('q\n');

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        flutterProcess.process.kill('SIGKILL');
        resolve();
      }, 5000);

      flutterProcess.process.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.processes.delete(sessionId);
  }

  sendKey(sessionId: string, key: string): boolean {
    const flutterProcess = this.processes.get(sessionId);
    if (!flutterProcess?.process.stdin) return false;
    flutterProcess.process.stdin.write(key);
    return true;
  }

  hotReload(sessionId: string): boolean {
    return this.sendKey(sessionId, 'r');
  }

  hotRestart(sessionId: string): boolean {
    return this.sendKey(sessionId, 'R');
  }

  getProcess(sessionId: string): FlutterProcess | undefined {
    return this.processes.get(sessionId);
  }

  getLogs(sessionId: string, maxLines = 100): string[] {
    const flutterProcess = this.processes.get(sessionId);
    if (!flutterProcess) return [];
    return flutterProcess.logs.slice(-maxLines);
  }

  private addLog(sessionId: string, line: string): void {
    const flutterProcess = this.processes.get(sessionId);
    if (!flutterProcess) return;
    flutterProcess.logs.push(line);
    if (flutterProcess.logs.length > MAX_LOGS) {
      flutterProcess.logs.shift();
    }
  }

  async stopAll(): Promise<void> {
    const sessionIds = Array.from(this.processes.keys());
    await Promise.all(sessionIds.map((id) => this.stopApp(id)));
  }
}
