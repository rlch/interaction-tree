/**
 * Tool handlers - implementations that interact with Flutter app instances.
 */
import { type RunOptions, type RebuildOptions } from '../flutter/app-manager.js';
import type { BatchStep, GetTreeOptions } from '../types/interaction-tree.js';
type ToolResult = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
};
export declare function handleRun(args: RunOptions): Promise<ToolResult>;
export declare function handleStop(args: {
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleList(): Promise<ToolResult>;
export declare function handleRebuild(args: RebuildOptions & {
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleGetStatus(args: {
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleGetTree(args: GetTreeOptions & {
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleTap(args: {
    id: string;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleDoubleTap(args: {
    id: string;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleLongPress(args: {
    id: string;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleEnterText(args: {
    id: string;
    text: string;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleClearText(args: {
    id: string;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleScroll(args: {
    id: string;
    dx?: number;
    dy?: number;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleDrag(args: {
    id: string;
    dx?: number;
    dy?: number;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleScrollIntoView(args: {
    id: string;
    alignment?: number;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleWaitFor(args: {
    id: string;
    condition?: 'exists' | 'notExists' | 'visible' | 'notVisible';
    timeoutMs?: number;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleGetState(args: {
    id: string;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleExecuteAction(args: {
    id: string;
    actionName: string;
    args?: Record<string, unknown>;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleBatch(args: {
    steps: BatchStep[];
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleHotReload(args: {
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleHotRestart(args: {
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleGetLogs(args: {
    maxLines?: number;
    instanceId?: string;
}): Promise<ToolResult>;
export declare function handleGetErrors(args: {
    instanceId?: string;
}): Promise<ToolResult>;
export {};
//# sourceMappingURL=handlers.d.ts.map