/**
 * WebSocket protocol types for fleeter-daemon.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────
export function isClientHello(msg) {
    return typeof msg === 'object' && msg !== null && msg.type === 'hello';
}
export function isCommandMessage(msg) {
    return typeof msg === 'object' && msg !== null && msg.type === 'command';
}
export function isAgentToolCall(msg) {
    return typeof msg === 'object' && msg !== null && msg.type === 'agent_tool_call';
}
//# sourceMappingURL=protocol.js.map