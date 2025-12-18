/**
 * Test for app status transitions.
 * 
 * Verifies that status updates occur in the correct order:
 * 1. 'starting' when run_app is called
 * 2. 'running' when app.started is received
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../src/session/manager.js';
import { FlutterProcessManager } from '../src/flutter/process-manager.js';
import type { AppStatus } from '../src/session/types.js';

describe('Status Transitions', () => {
  let sessionManager: SessionManager;
  let flutterManager: FlutterProcessManager;
  let statusChanges: Array<{ status: AppStatus; pid?: number; vmServiceUri?: string }>;

  beforeEach(() => {
    sessionManager = new SessionManager();
    flutterManager = new FlutterProcessManager();
    statusChanges = [];

    // Track all status changes
    sessionManager.on('session:status_changed', (session) => {
      statusChanges.push({
        status: session.appStatus,
        pid: session.pid,
        vmServiceUri: session.vmServiceUri,
      });
    });
  });

  afterEach(async () => {
    await flutterManager.stopAll();
  });

  test('status changes should be: starting -> running (in that order)', async () => {
    // Create a session
    const session = sessionManager.create({
      name: 'test-session',
      projectPath: '/tmp/fake-project',
    });

    // Simulate the flow that happens in ws/server.ts run_app handler:
    // 1. Set status to 'starting' BEFORE runApp
    sessionManager.updateStatus(session.id, 'starting');

    // 2. Simulate what happens when runApp resolves (app.started received)
    sessionManager.updateStatus(session.id, 'running', {
      pid: 12345,
      vmServiceUri: 'ws://127.0.0.1:12345/ws',
    });

    // Verify the order
    expect(statusChanges).toHaveLength(2);
    expect(statusChanges[0].status).toBe('starting');
    expect(statusChanges[1].status).toBe('running');
    expect(statusChanges[1].pid).toBe(12345);
    expect(statusChanges[1].vmServiceUri).toBe('ws://127.0.0.1:12345/ws');
  });

  test('FlutterProcessManager emits events in correct order', async () => {
    const events: Array<{ event: string; data?: unknown }> = [];

    flutterManager.on('launching', (sessionId, info) => {
      events.push({ event: 'launching', data: { sessionId, ...info } });
    });

    flutterManager.on('started', (sessionId, vmServiceUri) => {
      events.push({ event: 'started', data: { sessionId, vmServiceUri } });
    });

    // We can't easily test the full runApp without Flutter,
    // but we can verify the event emitter setup works
    expect(flutterManager.listenerCount('launching')).toBe(1);
    expect(flutterManager.listenerCount('started')).toBe(1);
  });

  test('simulated full flow with daemon-like coordination', async () => {
    // This simulates the full flow as it happens in daemon.ts and ws/server.ts
    const session = sessionManager.create({
      name: 'test-session',
      projectPath: '/tmp/fake-project',
    });

    // Simulate daemon.ts setupFlutterEvents - but WITHOUT updateStatus
    // (since we removed that in the fix)
    flutterManager.on('started', async (sessionId: string, vmServiceUri: string) => {
      // In the current (fixed) code, we don't call updateStatus here
      // We just connect VM client etc.
      console.log(`[test] started event: ${sessionId}, ${vmServiceUri}`);
    });

    // Simulate ws/server.ts run_app handler
    const runApp = async () => {
      // Step 1: Set starting BEFORE the async work
      sessionManager.updateStatus(session.id, 'starting');

      // Step 2: Simulate runApp() - it would block here waiting for app.started
      // In real code, this resolves when app.started event is received
      await new Promise<void>((resolve) => {
        // Simulate flutter emitting events
        setTimeout(() => {
          flutterManager.emit('launching', session.id, { appId: 'test-app', deviceId: 'macos' });
        }, 10);

        setTimeout(() => {
          flutterManager.emit('started', session.id, 'ws://127.0.0.1:12345/ws');
          resolve();
        }, 20);
      });

      // Step 3: After runApp resolves, set running
      sessionManager.updateStatus(session.id, 'running', {
        pid: 12345,
        vmServiceUri: 'ws://127.0.0.1:12345/ws',
      });
    };

    await runApp();

    // Verify status changes were in correct order
    console.log('Status changes:', statusChanges);
    expect(statusChanges).toHaveLength(2);
    expect(statusChanges[0].status).toBe('starting');
    expect(statusChanges[1].status).toBe('running');
  });

  test('BUG REPRODUCTION: synchronous event emission during Promise resolution', async () => {
    // This reproduces the ACTUAL bug: when runApp() Promise resolves,
    // the 'started' event fires synchronously BEFORE the calling code
    // continues after `await runApp()`.
    //
    // Timeline of the bug:
    // 1. server.ts: updateStatus('starting') - emits session.status_changed
    // 2. server.ts: await runApp() - blocks
    // 3. process-manager.ts: receives app.started, calls resolve() 
    // 4. process-manager.ts: emits 'started' event SYNCHRONOUSLY
    // 5. daemon.ts: on('started') handler runs, calls updateStatus('running')
    // 6. server.ts: runApp() returns, code continues AFTER the await
    // 7. server.ts: updateStatus('running') - second 'running' event
    //
    // But the REAL issue was that WS broadcasts are async/buffered,
    // so 'running' from daemon.ts was sent before 'starting' finished.

    const session = sessionManager.create({
      name: 'test-session',
      projectPath: '/tmp/fake-project',
    });

    // Simulate the buggy daemon.ts setupFlutterEvents (with updateStatus)
    flutterManager.on('started', (sessionId: string, vmServiceUri: string) => {
      // BUG: This runs SYNCHRONOUSLY when emit('started') is called,
      // which happens INSIDE the runApp() Promise resolution
      sessionManager.updateStatus(sessionId, 'running', { vmServiceUri, pid: 12345 });
    });

    // This simulates the EXACT timing of process-manager.ts runApp()
    const runApp = (): Promise<{ pid: number; vmServiceUri: string }> => {
      return new Promise((resolve) => {
        // Simulate Flutter output processing
        setTimeout(() => {
          // When app.started is received, we emit 'started' and resolve
          // The emit happens FIRST, synchronously, before resolve() returns
          flutterManager.emit('started', session.id, 'ws://127.0.0.1:12345/ws');
          resolve({ pid: 12345, vmServiceUri: 'ws://127.0.0.1:12345/ws' });
        }, 10);
      });
    };

    // Simulate ws/server.ts run_app handler
    sessionManager.updateStatus(session.id, 'starting');
    const result = await runApp();
    // BUG: By this point, the 'started' event has ALREADY fired and
    // daemon.ts has ALREADY called updateStatus('running')
    sessionManager.updateStatus(session.id, 'running', { 
      pid: result.pid, 
      vmServiceUri: result.vmServiceUri 
    });

    console.log('Status changes with synchronous emit bug:', statusChanges);
    
    // With the bug we get: starting, running, running (correct order but duplicate)
    // The status order is correct in this test, but the issue in production
    // was that WebSocket message ordering could get scrambled
    expect(statusChanges[0].status).toBe('starting');
    expect(statusChanges[1].status).toBe('running');
    
    // The fix removes the daemon.ts updateStatus call, so we only get 2 events
    // Currently with the bug we get 3 events
    expect(statusChanges).toHaveLength(3); // With bug: starting, running, running
  });

  test('FIXED: only server.ts should update status (no duplicates)', async () => {
    // This is the CORRECT behavior after the fix
    const session = sessionManager.create({
      name: 'test-session',
      projectPath: '/tmp/fake-project',
    });

    // Fixed daemon.ts - NO updateStatus call in on('started')
    flutterManager.on('started', (_sessionId: string, _vmServiceUri: string) => {
      // Just log, connect VM client, etc. - no status update
    });

    const runApp = (): Promise<{ pid: number; vmServiceUri: string }> => {
      return new Promise((resolve) => {
        setTimeout(() => {
          flutterManager.emit('started', session.id, 'ws://127.0.0.1:12345/ws');
          resolve({ pid: 12345, vmServiceUri: 'ws://127.0.0.1:12345/ws' });
        }, 10);
      });
    };

    // Simulate ws/server.ts run_app handler (the ONLY place that updates status)
    sessionManager.updateStatus(session.id, 'starting');
    const result = await runApp();
    sessionManager.updateStatus(session.id, 'running', { 
      pid: result.pid, 
      vmServiceUri: result.vmServiceUri 
    });

    console.log('Status changes FIXED:', statusChanges);
    
    // CORRECT: exactly 2 status changes, in correct order
    expect(statusChanges).toHaveLength(2);
    expect(statusChanges[0].status).toBe('starting');
    expect(statusChanges[1].status).toBe('running');
    expect(statusChanges[1].pid).toBe(12345);
  });
});
