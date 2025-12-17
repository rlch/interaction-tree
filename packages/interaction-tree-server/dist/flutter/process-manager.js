/**
 * Flutter process manager - handles spawning, monitoring, and controlling Flutter apps.
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { getVMClient } from '../vm/client.js';
import { getMonitor } from '../monitoring/index.js';
const VM_SERVICE_URI_REGEX = /Observatory\s+(?:listening\s+on|debugger\s+and\s+profiler\s+available\s+at)\s+(wss?:\/\/\S+)/i;
const FLUTTER_RUN_READY_REGEX = /Flutter run key commands|An Observatory debugger/i;
class FlutterProcessManager extends EventEmitter {
    process = null;
    state = null;
    logBuffer = [];
    maxLogs = 1000;
    get currentState() {
        return this.state;
    }
    get isRunning() {
        return this.state?.status === 'running';
    }
    /**
     * Run a Flutter app.
     */
    async run(options) {
        // Stop any existing process
        if (this.process) {
            await this.stop();
        }
        this.state = {
            status: 'starting',
            projectPath: options.projectPath,
            device: options.device,
            logs: [],
        };
        this.logBuffer = [];
        getMonitor().flutter.lifecycle('starting', {
            projectPath: options.projectPath,
            device: options.device,
        });
        const args = ['run', '--machine'];
        if (options.device) {
            args.push('-d', options.device);
        }
        if (options.flavor) {
            args.push('--flavor', options.flavor);
        }
        if (options.target) {
            args.push('-t', options.target);
        }
        if (options.dartDefines) {
            for (const [key, value] of Object.entries(options.dartDefines)) {
                args.push('--dart-define', `${key}=${value}`);
            }
        }
        if (options.additionalArgs) {
            args.push(...options.additionalArgs);
        }
        return new Promise((resolve, reject) => {
            console.error(`[flutter-process] Starting: flutter ${args.join(' ')}`);
            console.error(`[flutter-process] Working directory: ${options.projectPath}`);
            this.process = spawn('flutter', args, {
                cwd: options.projectPath,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            this.state.pid = this.process.pid;
            let vmServiceUri = null;
            let resolved = false;
            const handleOutput = (data, isStderr) => {
                const text = data.toString();
                const lines = text.split('\n');
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    this.addLog(line, isStderr);
                    // Log to stderr for debugging
                    if (isStderr || !line.startsWith('[{')) {
                        console.error(`[flutter] ${line}`);
                    }
                    // Try to parse machine-readable output
                    if (line.startsWith('[{') || line.startsWith('{')) {
                        try {
                            const events = line.startsWith('[') ? JSON.parse(line) : [JSON.parse(line)];
                            for (const event of events) {
                                this.handleFlutterEvent(event);
                                // Check for VM service URI in event
                                if (event.params?.wsUri) {
                                    vmServiceUri = event.params.wsUri;
                                }
                                else if (event.params?.uri && !vmServiceUri) {
                                    vmServiceUri = event.params.uri;
                                }
                            }
                        }
                        catch {
                            // Not JSON, continue
                        }
                    }
                    // Fallback: regex match for VM service URI
                    if (!vmServiceUri) {
                        const match = line.match(VM_SERVICE_URI_REGEX);
                        if (match) {
                            vmServiceUri = match[1];
                        }
                    }
                    // Check if ready to connect
                    if (vmServiceUri && !resolved && (FLUTTER_RUN_READY_REGEX.test(line) ||
                        line.includes('Syncing files') ||
                        this.state?.status === 'running')) {
                        resolved = true;
                        this.connectToApp(vmServiceUri).then(() => {
                            resolve(this.state);
                        }).catch(reject);
                    }
                }
            };
            this.process.stdout?.on('data', (data) => handleOutput(data, false));
            this.process.stderr?.on('data', (data) => handleOutput(data, true));
            this.process.on('error', (err) => {
                console.error(`[flutter-process] Error: ${err.message}`);
                this.state = {
                    ...this.state,
                    status: 'error',
                    error: err.message,
                };
                getMonitor().flutter.lifecycle('error', {
                    projectPath: options.projectPath,
                    error: err.message,
                });
                if (!resolved) {
                    resolved = true;
                    reject(err);
                }
            });
            this.process.on('exit', (code, signal) => {
                console.error(`[flutter-process] Exited with code ${code}, signal ${signal}`);
                this.state = {
                    ...this.state,
                    status: 'stopped',
                };
                getMonitor().flutter.lifecycle('stopped', {
                    projectPath: options.projectPath,
                });
                this.process = null;
                this.emit('exit', code, signal);
            });
            // Timeout if we don't get a VM service URI
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (vmServiceUri) {
                        // We have URI but didn't detect ready - try to connect anyway
                        this.connectToApp(vmServiceUri).then(() => {
                            resolve(this.state);
                        }).catch(reject);
                    }
                    else {
                        reject(new Error('Timeout waiting for Flutter app to start'));
                    }
                }
            }, 120000); // 2 minute timeout
        });
    }
    /**
     * Stop the running Flutter app.
     */
    async stop() {
        if (!this.process) {
            return;
        }
        console.error('[flutter-process] Stopping app...');
        // Disconnect VM client first
        const client = getVMClient();
        if (client.isConnected) {
            await client.disconnect();
        }
        // Send 'q' to gracefully quit
        this.process.stdin?.write('q\n');
        // Wait for graceful shutdown
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (this.process) {
                    console.error('[flutter-process] Force killing...');
                    this.process.kill('SIGKILL');
                }
                resolve();
            }, 5000);
            this.process?.on('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
        this.process = null;
        this.state = null;
    }
    /**
     * Hot reload the app (apply code changes, preserve state).
     */
    async hotReload() {
        const client = getVMClient();
        if (!client.isConnected) {
            return { success: false, error: 'Not connected to app' };
        }
        // Send 'r' for hot reload
        if (this.process?.stdin) {
            this.process.stdin.write('r');
        }
        // Also trigger via VM service
        return await client.hotReload();
    }
    /**
     * Hot restart the app (reset state, same process).
     */
    async hotRestart() {
        const client = getVMClient();
        if (!client.isConnected) {
            return { success: false, error: 'Not connected to app' };
        }
        // Send 'R' for hot restart
        if (this.process?.stdin) {
            this.process.stdin.write('R');
        }
        return await client.hotRestart();
    }
    /**
     * Full rebuild - stop, optionally clean, and run again.
     */
    async rebuild(options) {
        console.error('[flutter-process] Rebuilding app...');
        // Stop the current app
        await this.stop();
        // Clean if requested
        if (options.clean) {
            console.error('[flutter-process] Running flutter clean...');
            await new Promise((resolve, reject) => {
                const clean = spawn('flutter', ['clean'], {
                    cwd: options.projectPath,
                    stdio: 'inherit',
                });
                clean.on('exit', (code) => {
                    if (code === 0)
                        resolve();
                    else
                        reject(new Error(`flutter clean failed with code ${code}`));
                });
                clean.on('error', reject);
            });
        }
        // Run again
        return this.run(options);
    }
    /**
     * Get recent logs.
     */
    getLogs(maxLines) {
        const count = maxLines ?? 100;
        return this.logBuffer.slice(-count);
    }
    /**
     * Send a custom command to the Flutter process.
     */
    sendCommand(command) {
        if (this.process?.stdin) {
            this.process.stdin.write(command);
        }
    }
    async connectToApp(uri) {
        console.error(`[flutter-process] Connecting to VM service at ${uri}`);
        const client = getVMClient();
        await client.connect(uri);
        getMonitor().vm.connected(uri);
        this.state = {
            ...this.state,
            status: 'running',
            vmServiceUri: uri,
            startedAt: new Date(),
        };
        getMonitor().flutter.lifecycle('running', {
            projectPath: this.state.projectPath,
            device: this.state.device,
            vmServiceUri: uri,
            pid: this.state.pid,
        });
        console.error('[flutter-process] Connected successfully');
    }
    handleFlutterEvent(event) {
        switch (event.event) {
            case 'app.started':
                console.error('[flutter-process] App started');
                break;
            case 'app.debugPort':
                console.error(`[flutter-process] Debug port: ${event.params?.port}`);
                break;
            case 'app.stop':
                console.error('[flutter-process] App stopped');
                this.state = { ...this.state, status: 'stopped' };
                break;
        }
        this.emit('flutter-event', event);
    }
    addLog(line, stderr = false) {
        this.logBuffer.push(line);
        if (this.logBuffer.length > this.maxLogs) {
            this.logBuffer.shift();
        }
        this.state?.logs.push(line);
        getMonitor().flutter.log(line, stderr);
    }
}
// Singleton instance
let manager = null;
export function getFlutterProcessManager() {
    if (!manager) {
        manager = new FlutterProcessManager();
    }
    return manager;
}
//# sourceMappingURL=process-manager.js.map