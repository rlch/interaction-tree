/**
 * Tool handlers for raw mode.
 * These are the actual implementations that interact with the VM.
 */

import { getVMClient } from '../vm/client.js';
import type { BatchStep, GetTreeOptions } from '../types/interaction-tree.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

function success(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function error(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────────────────────────────────────

export async function handleConnect(args: {
  uri: string;
}): Promise<ToolResult> {
  try {
    const client = getVMClient();
    await client.connect(args.uri);
    return success({ connected: true, uri: args.uri });
  } catch (err) {
    return error(`Failed to connect: ${err}`);
  }
}

export async function handleDisconnect(): Promise<ToolResult> {
  try {
    const client = getVMClient();
    await client.disconnect();
    return success({ disconnected: true });
  } catch (err) {
    return error(`Failed to disconnect: ${err}`);
  }
}

export async function handleGetStatus(): Promise<ToolResult> {
  const client = getVMClient();
  return success(await client.getStatus());
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction Tree
// ─────────────────────────────────────────────────────────────────────────────

export async function handleGetTree(args: GetTreeOptions): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const tree = await client.getTree(args);
    return success({ targets: tree });
  } catch (err) {
    return error(`Failed to get tree: ${err}`);
  }
}

export async function handleTap(args: { id: string }): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.tap(args.id);
    return success(result);
  } catch (err) {
    return error(`Failed to tap: ${err}`);
  }
}

export async function handleDoubleTap(args: {
  id: string;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.doubleTap(args.id);
    return success(result);
  } catch (err) {
    return error(`Failed to double tap: ${err}`);
  }
}

export async function handleLongPress(args: {
  id: string;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.longPress(args.id);
    return success(result);
  } catch (err) {
    return error(`Failed to long press: ${err}`);
  }
}

export async function handleEnterText(args: {
  id: string;
  text: string;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.enterText(args.id, args.text);
    return success(result);
  } catch (err) {
    return error(`Failed to enter text: ${err}`);
  }
}

export async function handleClearText(args: {
  id: string;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.clearText(args.id);
    return success(result);
  } catch (err) {
    return error(`Failed to clear text: ${err}`);
  }
}

export async function handleScroll(args: {
  id: string;
  dx?: number;
  dy?: number;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.scroll(args.id, args.dx ?? 0, args.dy ?? 0);
    return success(result);
  } catch (err) {
    return error(`Failed to scroll: ${err}`);
  }
}

export async function handleDrag(args: {
  id: string;
  dx?: number;
  dy?: number;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.drag(args.id, args.dx ?? 0, args.dy ?? 0);
    return success(result);
  } catch (err) {
    return error(`Failed to drag: ${err}`);
  }
}

export async function handleScrollIntoView(args: {
  id: string;
  alignment?: number;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.scrollIntoView(args.id, args.alignment);
    return success(result);
  } catch (err) {
    return error(`Failed to scroll into view: ${err}`);
  }
}

export async function handleWaitFor(args: {
  id: string;
  condition?: 'exists' | 'notExists' | 'visible' | 'notVisible';
  timeoutMs?: number;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.waitFor(
      args.id,
      args.condition ?? 'exists',
      args.timeoutMs ?? 10000
    );
    return success(result);
  } catch (err) {
    return error(`Failed to wait for: ${err}`);
  }
}

export async function handleGetState(args: {
  id: string;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const state = await client.getState(args.id);
    return success(state);
  } catch (err) {
    return error(`Failed to get state: ${err}`);
  }
}

export async function handleExecuteAction(args: {
  id: string;
  actionName: string;
  args?: Record<string, unknown>;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.executeAction(
      args.id,
      args.actionName,
      args.args
    );
    return success(result);
  } catch (err) {
    return error(`Failed to execute action: ${err}`);
  }
}

export async function handleBatch(args: {
  steps: BatchStep[];
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.batch(args.steps);
    return success(result);
  } catch (err) {
    return error(`Failed to execute batch: ${err}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dart Tooling
// ─────────────────────────────────────────────────────────────────────────────

export async function handleHotReload(): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.hotReload();
    return success(result);
  } catch (err) {
    return error(`Failed to hot reload: ${err}`);
  }
}

export async function handleHotRestart(): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const result = await client.hotRestart();
    return success(result);
  } catch (err) {
    return error(`Failed to hot restart: ${err}`);
  }
}

export async function handleGetLogs(args: {
  since?: string;
}): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const logs = await client.getLogs(args.since);
    return success({ logs });
  } catch (err) {
    return error(`Failed to get logs: ${err}`);
  }
}

export async function handleGetErrors(): Promise<ToolResult> {
  const client = getVMClient();
  if (!client.isConnected) {
    return error('Not connected. Use connect tool first.');
  }

  try {
    const errors = await client.getRuntimeErrors();
    return success({ errors });
  } catch (err) {
    return error(`Failed to get errors: ${err}`);
  }
}
