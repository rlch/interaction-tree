/**
 * Flutter process manager - handles spawning and managing flutter run processes.
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
const VM_SERVICE_URI_REGEX = /Observatory\s+(?:listening\s+on|debugger\s+and\s+profiler\s+available\s+at)\s+(wss?:\/\/\S+)/i;
const MAX_LOGS = 1000;
/**
 * Find the Flutter executable using Bun's native which() function.
 * Falls back to checking common installation paths when running under
 * environments without full PATH (e.g., launchd).
 */
function findFlutterExecutable() {
    // Use Bun's native which() - handles PATH resolution properly
    const flutterPath = Bun.which('flutter');
    if (flutterPath) {
        return flutterPath;
    }
    // Fallback: check common installation paths for environments without PATH
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
export class FlutterProcessManager extends EventEmitter {
    processes = new Map();
    async runApp(sessionId, projectPath, options = {}) {
        if (this.processes.has(sessionId)) {
            throw new Error('App already running for this session');
        }
        const args = ['run', '--machine'];
        if (options.device)
            args.push('-d', options.device);
        if (options.flavor)
            args.push('--flavor', options.flavor);
        if (options.target)
            args.push('-t', options.target);
        if (options.dartDefines) {
            for (const [key, value] of Object.entries(options.dartDefines)) {
                args.push('--dart-define', `${key}=${value}`);
            }
        }
        if (options.additionalArgs)
            args.push(...options.additionalArgs);
        return new Promise((resolve, reject) => {
            const flutterCmd = findFlutterExecutable();
            console.error(`[flutter] Starting app: ${flutterCmd} ${args.join(' ')}`);
            console.error(`[flutter] Working directory: ${projectPath}`);
            const proc = spawn(flutterCmd, args, {
                cwd: projectPath,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: process.env,
            });
            const flutterProcess = {
                process: proc,
                pid: proc.pid,
                logs: [],
            };
            this.processes.set(sessionId, flutterProcess);
            let vmServiceUri = null;
            let resolved = false;
            const handleOutput = (data) => {
                const text = data.toString();
                const lines = text.split('\n');
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    this.addLog(sessionId, line);
                    this.emit('log', sessionId, line);
                    // Parse machine output for VM service URI
                    if (line.startsWith('[{') || line.startsWith('{')) {
                        try {
                            const events = line.startsWith('[') ? JSON.parse(line) : [JSON.parse(line)];
                            for (const event of events) {
                                if (event.params?.wsUri) {
                                    vmServiceUri = event.params.wsUri;
                                }
                                else if (event.params?.uri && !vmServiceUri) {
                                    vmServiceUri = event.params.uri;
                                }
                                if (event.event === 'app.started' && vmServiceUri && !resolved) {
                                    resolved = true;
                                    flutterProcess.vmServiceUri = vmServiceUri;
                                    flutterProcess.startedAt = new Date();
                                    this.emit('started', sessionId, vmServiceUri);
                                    resolve(flutterProcess);
                                }
                            }
                        }
                        catch {
                            // Not JSON
                        }
                    }
                    // Fallback regex
                    if (!vmServiceUri) {
                        const match = line.match(VM_SERVICE_URI_REGEX);
                        if (match)
                            vmServiceUri = match[1];
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
                    resolved = true;
                    if (vmServiceUri) {
                        flutterProcess.vmServiceUri = vmServiceUri;
                        flutterProcess.startedAt = new Date();
                        this.emit('started', sessionId, vmServiceUri);
                        resolve(flutterProcess);
                    }
                    else {
                        this.processes.delete(sessionId);
                        reject(new Error('Timeout waiting for app to start'));
                    }
                }
            }, 120000);
        });
    }
    async stopApp(sessionId) {
        const flutterProcess = this.processes.get(sessionId);
        if (!flutterProcess)
            return;
        console.error(`[flutter] Stopping app for session ${sessionId}`);
        flutterProcess.process.stdin?.write('q\n');
        await new Promise((resolve) => {
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
    sendKey(sessionId, key) {
        const flutterProcess = this.processes.get(sessionId);
        if (!flutterProcess?.process.stdin)
            return false;
        flutterProcess.process.stdin.write(key);
        return true;
    }
    hotReload(sessionId) {
        return this.sendKey(sessionId, 'r');
    }
    hotRestart(sessionId) {
        return this.sendKey(sessionId, 'R');
    }
    getProcess(sessionId) {
        return this.processes.get(sessionId);
    }
    getLogs(sessionId, maxLines = 100) {
        const flutterProcess = this.processes.get(sessionId);
        if (!flutterProcess)
            return [];
        return flutterProcess.logs.slice(-maxLines);
    }
    addLog(sessionId, line) {
        const flutterProcess = this.processes.get(sessionId);
        if (!flutterProcess)
            return;
        flutterProcess.logs.push(line);
        if (flutterProcess.logs.length > MAX_LOGS) {
            flutterProcess.logs.shift();
        }
    }
    async stopAll() {
        const sessionIds = Array.from(this.processes.keys());
        await Promise.all(sessionIds.map((id) => this.stopApp(id)));
    }
}
//# sourceMappingURL=process-manager.js.map