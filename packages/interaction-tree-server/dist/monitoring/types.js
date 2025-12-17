/**
 * Monitoring event types for interaction-tree-server.
 */
// Type guards
export function isFlutterLogEvent(event) {
    return event.source === 'flutter' && event.type === 'flutter.log';
}
export function isFlutterLifecycleEvent(event) {
    return event.source === 'flutter' && event.type === 'flutter.lifecycle';
}
export function isAgentToolCallEvent(event) {
    return event.source === 'agent' && event.type === 'agent.tool_call';
}
export function isAgentToolResultEvent(event) {
    return event.source === 'agent' && event.type === 'agent.tool_result';
}
export function isCommand(msg) {
    return typeof msg === 'object' && msg !== null && msg.type === 'command';
}
export function isAgentMessage(msg) {
    return typeof msg === 'object' && msg !== null && msg.type === 'agent_message';
}
//# sourceMappingURL=types.js.map