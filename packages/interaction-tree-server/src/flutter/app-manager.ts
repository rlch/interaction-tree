/**
 * Manages multiple Flutter app instances.
 * Each instance has its own process, VM connection, and dedicated agent.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { VMServiceClient } from '../vm/client.js';

export interface AppInstance {
  id: string;
  name?: string;
  projectPath: string;
  device?: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  vmServiceUri?: string;
  pid?: number;
  startedAt?: Date;
  error?: string;
}

export interface RunOptions {
  projectPath: string;
  name?: string;
  device?: string;
  flavor?: string;
  target?: string;
  dartDefines?: Record<string, string>;
  additionalArgs?: string[];
}

export interface RebuildOptions extends RunOptions {
  clean?: boolean;
}

interface ManagedInstance {
  info: AppInstance;
  process: ChildProcess | null;
  vmClient: VMServiceClient;
  logs: string[];
}

const VM_SERVICE_URI_REGEX =
  /Observatory\s+(?:listening\s+on|debugger\s+and\s+profiler\s+available\s+at)\s+(wss?:\/\/\S+)/i;

class AppManager extends EventEmitter {
  private instances = new Map<string, ManagedInstance>();
  private readonly maxLogs = 1000;

  /**
   * List all app instances.
   */
  list(): AppInstance[] {
    return Array.from(this.instances.values()).map((i) => ({ ...i.info }));
  }

  /**
   * Get an instance by ID or name.
   */
  get(idOrName: string): ManagedInstance | undefined {
    // Try by ID first
    if (this.instances.has(idOrName)) {
      return this.instances.get(idOrName);
    }
    // Try by name
    for (const instance of this.instances.values()) {
      if (instance.info.name === idOrName) {
        return instance;
      }
    }
    return undefined;
  }

  /**
   * Get instance info by ID or name.
   */
  getInfo(idOrName: string): AppInstance | undefined {
    const instance = this.get(idOrName);
    return instance ? { ...instance.info } : undefined;
  }

  /**
   * Run a new Flutter app instance.
   */
  async run(options: RunOptions): Promise<AppInstance> {
    const id = uuidv4();
    const vmClient = new VMServiceClient();

    const instance: ManagedInstance = {
      info: {
        id,
        name: options.name,
        projectPath: options.projectPath,
        device: options.device,
        status: 'starting',
      },
      process: null,
      vmClient,
      logs: [],
    };

    this.instances.set(id, instance);

    try {
      await this.startProcess(instance, options);
      return { ...instance.info };
    } catch (err) {
      instance.info.status = 'error';
      instance.info.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Stop an instance by ID or name.
   */
  async stop(idOrName: string): Promise<void> {
    const instance = this.get(idOrName);
    if (!instance) {
      throw new Error(`Instance not found: ${idOrName}`);
    }

    console.error(`[app-manager] Stopping instance ${instance.info.id}`);

    // Disconnect VM client
    if (instance.vmClient.isConnected) {
      await instance.vmClient.disconnect();
    }

    // Stop process
    if (instance.process) {
      instance.process.stdin?.write('q\n');

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (instance.process) {
            instance.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        instance.process?.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    instance.info.status = 'stopped';
    instance.process = null;
  }

  /**
   * Remove an instance (must be stopped first).
   */
  remove(idOrName: string): boolean {
    const instance = this.get(idOrName);
    if (!instance) return false;

    if (instance.info.status === 'running' || instance.info.status === 'starting') {
      throw new Error('Cannot remove running instance. Stop it first.');
    }

    return this.instances.delete(instance.info.id);
  }

  /**
   * Hot reload an instance.
   */
  async hotReload(idOrName: string): Promise<{ success: boolean; error?: string }> {
    const instance = this.get(idOrName);
    if (!instance) {
      return { success: false, error: `Instance not found: ${idOrName}` };
    }

    if (!instance.vmClient.isConnected) {
      return { success: false, error: 'Not connected to app' };
    }

    // Send 'r' for hot reload
    if (instance.process?.stdin) {
      instance.process.stdin.write('r');
    }

    return await instance.vmClient.hotReload();
  }

  /**
   * Hot restart an instance.
   */
  async hotRestart(idOrName: string): Promise<{ success: boolean; error?: string }> {
    const instance = this.get(idOrName);
    if (!instance) {
      return { success: false, error: `Instance not found: ${idOrName}` };
    }

    if (!instance.vmClient.isConnected) {
      return { success: false, error: 'Not connected to app' };
    }

    // Send 'R' for hot restart
    if (instance.process?.stdin) {
      instance.process.stdin.write('R');
    }

    return await instance.vmClient.hotRestart();
  }

  /**
   * Rebuild an instance (stop, optionally clean, restart).
   */
  async rebuild(idOrName: string, options: RebuildOptions): Promise<AppInstance> {
    const instance = this.get(idOrName);
    if (!instance) {
      throw new Error(`Instance not found: ${idOrName}`);
    }

    console.error(`[app-manager] Rebuilding instance ${instance.info.id}`);

    // Stop current process
    await this.stop(idOrName);

    // Clean if requested
    if (options.clean) {
      console.error('[app-manager] Running flutter clean...');
      await new Promise<void>((resolve, reject) => {
        const clean = spawn('flutter', ['clean'], {
          cwd: options.projectPath,
          stdio: 'inherit',
        });
        clean.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`flutter clean failed with code ${code}`));
        });
        clean.on('error', reject);
      });
    }

    // Restart
    instance.info.status = 'starting';
    instance.info.error = undefined;

    try {
      await this.startProcess(instance, options);
      return { ...instance.info };
    } catch (err) {
      instance.info.status = 'error';
      instance.info.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Get logs for an instance.
   */
  getLogs(idOrName: string, maxLines?: number): string[] {
    const instance = this.get(idOrName);
    if (!instance) return [];
    const count = maxLines ?? 100;
    return instance.logs.slice(-count);
  }

  /**
   * Get VM client for an instance.
   */
  getVMClient(idOrName: string): VMServiceClient | undefined {
    return this.get(idOrName)?.vmClient;
  }

  private async startProcess(
    instance: ManagedInstance,
    options: RunOptions
  ): Promise<void> {
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
      console.error(
        `[app-manager] Starting instance ${instance.info.id}: flutter ${args.join(' ')}`
      );
      console.error(`[app-manager] Working directory: ${options.projectPath}`);

      instance.process = spawn('flutter', args, {
        cwd: options.projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      instance.info.pid = instance.process.pid;

      let vmServiceUri: string | null = null;
      let resolved = false;

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;

          this.addLog(instance, line);

          // Try to parse machine-readable output
          if (line.startsWith('[{') || line.startsWith('{')) {
            try {
              const events = line.startsWith('[')
                ? JSON.parse(line)
                : [JSON.parse(line)];
              for (const event of events) {
                // Check for VM service URI
                if (event.params?.wsUri) {
                  vmServiceUri = event.params.wsUri as string;
                } else if (event.params?.uri && !vmServiceUri) {
                  vmServiceUri = event.params.uri as string;
                }

                // Check for app.started
                if (event.event === 'app.started' && vmServiceUri && !resolved) {
                  resolved = true;
                  this.connectToApp(instance, vmServiceUri)
                    .then(() => resolve())
                    .catch(reject);
                }
              }
            } catch {
              // Not JSON
            }
          }

          // Fallback: regex match
          if (!vmServiceUri) {
            const match = line.match(VM_SERVICE_URI_REGEX);
            if (match) {
              vmServiceUri = match[1];
            }
          }
        }
      };

      instance.process.stdout?.on('data', handleOutput);
      instance.process.stderr?.on('data', handleOutput);

      instance.process.on('error', (err) => {
        console.error(`[app-manager] Process error: ${err.message}`);
        instance.info.status = 'error';
        instance.info.error = err.message;
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      instance.process.on('exit', (code, signal) => {
        console.error(
          `[app-manager] Instance ${instance.info.id} exited: code=${code}, signal=${signal}`
        );
        instance.info.status = 'stopped';
        instance.process = null;
        this.emit('exit', instance.info.id, code, signal);
      });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (vmServiceUri) {
            this.connectToApp(instance, vmServiceUri)
              .then(() => resolve())
              .catch(reject);
          } else {
            reject(new Error('Timeout waiting for app to start'));
          }
        }
      }, 120000);
    });
  }

  private async connectToApp(
    instance: ManagedInstance,
    uri: string
  ): Promise<void> {
    console.error(
      `[app-manager] Connecting instance ${instance.info.id} to ${uri}`
    );

    await instance.vmClient.connect(uri);

    instance.info.status = 'running';
    instance.info.vmServiceUri = uri;
    instance.info.startedAt = new Date();

    console.error(`[app-manager] Instance ${instance.info.id} connected`);
  }

  private addLog(instance: ManagedInstance, line: string): void {
    instance.logs.push(line);
    if (instance.logs.length > this.maxLogs) {
      instance.logs.shift();
    }
  }
}

// Singleton
let manager: AppManager | null = null;

export function getAppManager(): AppManager {
  if (!manager) {
    manager = new AppManager();
  }
  return manager;
}
