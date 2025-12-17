/**
 * Tool handlers - implementations that use SessionManager.
 */
import type { RunAppOptions, RebuildAppOptions } from '../session/index.js';
import type { BatchStep, GetTreeOptions } from '../types/interaction-tree.js';
type ToolResult = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
};
export declare function handleCreateSession(args: {
    name: string;
    projectPath: string;
}): Promise<ToolResult>;
export declare function handleDestroySession(args: {
    session: string;
}): Promise<ToolResult>;
export declare function handleListSessions(): Promise<ToolResult>;
export declare function handleConnect(args: {
    session: string;
}): Promise<ToolResult>;
export declare function handleDisconnect(): Promise<ToolResult>;
export declare function handleRun(args: RunAppOptions): Promise<ToolResult>;
export declare function handleStop(): Promise<ToolResult>;
export declare function handleRebuild(args: RebuildAppOptions): Promise<ToolResult>;
export declare function handleGetStatus(): Promise<ToolResult>;
export declare function handleHotReload(): Promise<ToolResult>;
export declare function handleHotRestart(): Promise<ToolResult>;
export declare function handleGetLogs(args: {
    maxLines?: number;
}): Promise<ToolResult>;
export declare function handleGetErrors(): Promise<ToolResult>;
export declare function handleGetTree(args: GetTreeOptions): Promise<ToolResult>;
export declare function handleTap(args: {
    id: string;
}): Promise<ToolResult>;
export declare function handleDoubleTap(args: {
    id: string;
}): Promise<ToolResult>;
export declare function handleLongPress(args: {
    id: string;
}): Promise<ToolResult>;
export declare function handleEnterText(args: {
    id: string;
    text: string;
}): Promise<ToolResult>;
export declare function handleClearText(args: {
    id: string;
}): Promise<ToolResult>;
export declare function handleScroll(args: {
    id: string;
    dx?: number;
    dy?: number;
}): Promise<ToolResult>;
export declare function handleDrag(args: {
    id: string;
    dx?: number;
    dy?: number;
}): Promise<ToolResult>;
export declare function handleScrollIntoView(args: {
    id: string;
    alignment?: number;
}): Promise<ToolResult>;
export declare function handleWaitFor(args: {
    id: string;
    condition?: 'exists' | 'notExists' | 'visible' | 'notVisible';
    timeoutMs?: number;
}): Promise<ToolResult>;
export declare function handleGetState(args: {
    id: string;
}): Promise<ToolResult>;
export declare function handleExecuteAction(args: {
    id: string;
    actionName: string;
    args?: Record<string, unknown>;
}): Promise<ToolResult>;
export declare function handleBatch(args: {
    steps: BatchStep[];
}): Promise<ToolResult>;
export {};
//# sourceMappingURL=handlers.d.ts.map