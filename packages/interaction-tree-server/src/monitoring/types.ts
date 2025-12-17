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

// Flutter events
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

// Agent events
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

// MCP events
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

// Interaction tree events
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

// VM events
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

// Type guards
export function isFlutterLogEvent(event: MonitoringEvent): event is FlutterLogEvent {
  return event.source === 'flutter' && event.type === 'flutter.log';
}

export function isFlutterLifecycleEvent(event: MonitoringEvent): event is FlutterLifecycleEvent {
  return event.source === 'flutter' && event.type === 'flutter.lifecycle';
}

export function isAgentToolCallEvent(event: MonitoringEvent): event is AgentToolCallEvent {
  return event.source === 'agent' && event.type === 'agent.tool_call';
}

export function isAgentToolResultEvent(event: MonitoringEvent): event is AgentToolResultEvent {
  return event.source === 'agent' && event.type === 'agent.tool_result';
}

// ─────────────────────────────────────────────────────────────────────────────
// Client → Server Commands
// ─────────────────────────────────────────────────────────────────────────────

export type CommandAction =
  | 'hot_reload'
  | 'hot_restart'
  | 'stop'
  | 'flutter_key'
  | 'get_status'
  | 'get_tree';

export interface Command {
  type: 'command';
  id?: string;
  action: CommandAction;
  key?: string;
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

export function isCommand(msg: unknown): msg is Command {
  return typeof msg === 'object' && msg !== null && (msg as Command).type === 'command';
}

export function isAgentMessage(msg: unknown): msg is AgentMessage {
  return typeof msg === 'object' && msg !== null && (msg as AgentMessage).type === 'agent_message';
}
