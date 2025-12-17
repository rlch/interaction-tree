/**
 * Monitoring event types for interaction-tree-server.
 */
export type EventSource = 'flutter' | 'vm' | 'agent' | 'mcp' | 'interaction_tree';
export type EventLevel = 'debug' | 'info' | 'warn' | 'error';
export interface MonitoringEvent {
    ts: string;
    source: EventSource;
    instanceId: string;
    type: string;
    level?: EventLevel;
    payload: unknown;
}
export interface FlutterLogEvent extends MonitoringEvent {
    source: 'flutter';
    type: 'flutter.log';
    payload: {
        line: string;
        stderr: boolean;
    };
}
export interface FlutterLifecycleEvent extends MonitoringEvent {
    source: 'flutter';
    type: 'flutter.lifecycle';
    payload: {
        status: 'starting' | 'running' | 'stopped' | 'error';
        projectPath?: string;
        device?: string;
        vmServiceUri?: string;
        pid?: number;
        error?: string;
    };
}
export interface AgentToolCallEvent extends MonitoringEvent {
    source: 'agent';
    type: 'agent.tool_call';
    payload: {
        toolName: string;
        args: Record<string, unknown>;
        conversationId?: string;
    };
}
export interface AgentToolResultEvent extends MonitoringEvent {
    source: 'agent';
    type: 'agent.tool_result';
    payload: {
        toolName: string;
        durationMs: number;
        status: 'success' | 'error';
        error?: string;
        summary?: string;
    };
}
export interface McpRequestEvent extends MonitoringEvent {
    source: 'mcp';
    type: 'mcp.request';
    payload: {
        method: string;
        toolName?: string;
        args?: Record<string, unknown>;
    };
}
export interface McpResponseEvent extends MonitoringEvent {
    source: 'mcp';
    type: 'mcp.response';
    payload: {
        method: string;
        toolName?: string;
        durationMs: number;
        success: boolean;
        error?: string;
    };
}
export interface InteractionTreeSnapshotEvent extends MonitoringEvent {
    source: 'interaction_tree';
    type: 'interaction_tree.snapshot';
    payload: {
        nodeCount: number;
        rootIds: string[];
        tree?: unknown;
    };
}
export interface InteractionTreeDiffEvent extends MonitoringEvent {
    source: 'interaction_tree';
    type: 'interaction_tree.diff';
    payload: {
        added: string[];
        removed: string[];
        changed: string[];
    };
}
export interface VMConnectionEvent extends MonitoringEvent {
    source: 'vm';
    type: 'vm.connected' | 'vm.disconnected';
    payload: {
        uri?: string;
    };
}
export interface VMErrorEvent extends MonitoringEvent {
    source: 'vm';
    type: 'vm.error';
    payload: {
        message: string;
        stack?: string;
    };
}
export declare function isFlutterLogEvent(event: MonitoringEvent): event is FlutterLogEvent;
export declare function isFlutterLifecycleEvent(event: MonitoringEvent): event is FlutterLifecycleEvent;
export declare function isAgentToolCallEvent(event: MonitoringEvent): event is AgentToolCallEvent;
export declare function isAgentToolResultEvent(event: MonitoringEvent): event is AgentToolResultEvent;
export type CommandAction = 'hot_reload' | 'hot_restart' | 'run' | 'stop' | 'flutter_key' | 'get_status' | 'get_tree' | 'create_session' | 'destroy_session' | 'list_sessions' | 'connect';
export interface Command {
    type: 'command';
    id?: string;
    action: CommandAction;
    key?: string;
    data?: Record<string, unknown>;
}
export interface AgentMessage {
    type: 'agent_message';
    id?: string;
    intent: string;
    context?: string[];
    conversationId?: string;
}
export type ClientMessage = Command | AgentMessage;
export interface CommandResponse {
    type: 'command_response';
    id?: string;
    success: boolean;
    error?: string;
    data?: unknown;
}
export interface AgentResponse {
    type: 'agent_response';
    id?: string;
    status: 'success' | 'failed' | 'needs_context';
    summary?: string;
    error?: string;
    question?: string;
    suggestions?: string[];
    conversationId?: string;
}
export type ServerResponse = CommandResponse | AgentResponse;
export declare function isCommand(msg: unknown): msg is Command;
export declare function isAgentMessage(msg: unknown): msg is AgentMessage;
//# sourceMappingURL=types.d.ts.map