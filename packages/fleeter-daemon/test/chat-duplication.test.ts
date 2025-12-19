import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/session/manager.js';

describe('chat message duplication', () => {
  let sessionManager: SessionManager;
  let sessionId: string;

  beforeEach(() => {
    sessionManager = new SessionManager();
    const session = sessionManager.create({
      name: 'test-session',
      projectPath: '/tmp/test',
    });
    sessionId = session.id;
  });

  it('should not have duplicate messages after task_complete + execute return', () => {
    // Simulate user message
    sessionManager.addChatMessage(sessionId, {
      role: 'user',
      content: { type: 'text', text: 'hello' },
      timestamp: new Date().toISOString(),
    });

    // Simulate task_complete saving the text
    const textBuffer = 'Hello! I am Claude.';
    sessionManager.addChatMessage(sessionId, {
      role: 'assistant',
      content: { type: 'text', text: textBuffer },
      timestamp: new Date().toISOString(),
    });

    const history = sessionManager.getChatHistory(sessionId);
    
    // Count assistant text messages
    const assistantTextMessages = history.filter(
      m => m.role === 'assistant' && m.content.type === 'text'
    );
    
    expect(assistantTextMessages.length).toBe(1);
    expect(history.length).toBe(2); // 1 user + 1 assistant
  });

  it('reproduces duplication when same message added twice', () => {
    const timestamp = new Date().toISOString();
    const message = {
      role: 'assistant' as const,
      content: { type: 'text' as const, text: 'Hello! I am Claude.' },
      timestamp,
    };

    // Add same message twice (simulating the bug)
    sessionManager.addChatMessage(sessionId, message);
    sessionManager.addChatMessage(sessionId, message);

    const history = sessionManager.getChatHistory(sessionId);
    console.log('Duplicated history:', history.length, 'messages');
    
    // This SHOULD be 1 if we have deduplication, but will be 2 showing the bug
    expect(history.length).toBe(1);
  });
});
