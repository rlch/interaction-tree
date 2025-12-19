//! Application state and event handling.

use agent_backend::Backend;
use agent_protocol::{AgentEvent, Message, MessageContent, Role, ToolCall, ToolStatus};
use anyhow::Result;
use chrono::Utc;
use uuid::Uuid;

use crate::composer::Composer;

/// Streaming state during agent response.
pub struct StreamingState {
    pub text_buffer: String,
    pub tool_calls: Vec<ToolCall>,
}

impl StreamingState {
    pub fn new() -> Self {
        Self {
            text_buffer: String::new(),
            tool_calls: Vec::new(),
        }
    }
}

/// Application state.
pub struct App<B: Backend> {
    pub backend: B,
    pub messages: Vec<Message>,
    pub streaming: Option<StreamingState>,
    pub composer: Composer,
    pub scroll: u16,
    pub should_quit: bool,
    pub needs_context: Option<NeedsContextState>,
}

pub struct NeedsContextState {
    pub question: String,
    pub suggestions: Vec<String>,
}

impl<B: Backend> App<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            messages: Vec::new(),
            streaming: None,
            composer: Composer::new(),
            scroll: 0,
            should_quit: false,
            needs_context: None,
        }
    }
    
    /// Submit the current message.
    pub async fn submit(&mut self) -> Result<()> {
        let text = self.composer.clear();
        if text.is_empty() {
            return Ok(());
        }
        
        // Check if we're answering a question
        if let Some(_context) = self.needs_context.take() {
            // Just send as regular message with context
            self.backend.send_message(text.clone()).await?;
        } else {
            self.backend.send_message(text.clone()).await?;
        }
        
        // Add user message to history
        self.messages.push(Message {
            id: Uuid::new_v4().to_string(),
            role: Role::User,
            content: MessageContent::Text(text),
            timestamp: Utc::now(),
        });
        
        // Start streaming state
        self.streaming = Some(StreamingState::new());
        
        Ok(())
    }
    
    /// Handle an agent event.
    pub fn handle_agent_event(&mut self, event: AgentEvent) {
        match event {
            AgentEvent::TaskStarted => {
                if self.streaming.is_none() {
                    self.streaming = Some(StreamingState::new());
                }
            }
            AgentEvent::TextDelta(delta) => {
                if let Some(streaming) = &mut self.streaming {
                    streaming.text_buffer.push_str(&delta);
                }
            }
            AgentEvent::TextComplete(text) => {
                // Finalize streaming text into a message
                self.messages.push(Message {
                    id: Uuid::new_v4().to_string(),
                    role: Role::Assistant,
                    content: MessageContent::Text(text),
                    timestamp: Utc::now(),
                });
                self.streaming = None;
            }
            AgentEvent::ToolCallStarted { id, name, args } => {
                if let Some(streaming) = &mut self.streaming {
                    streaming.tool_calls.push(ToolCall {
                        id,
                        name,
                        args,
                        status: ToolStatus::Running,
                        output: None,
                    });
                }
            }
            AgentEvent::ToolOutputDelta { id, delta } => {
                if let Some(streaming) = &mut self.streaming {
                    if let Some(call) = streaming.tool_calls.iter_mut().find(|c| c.id == id) {
                        let output = call.output.get_or_insert_with(String::new);
                        output.push_str(&delta);
                    }
                }
            }
            AgentEvent::ToolCallComplete { id, result } => {
                if let Some(streaming) = &mut self.streaming {
                    if let Some(call) = streaming.tool_calls.iter_mut().find(|c| c.id == id) {
                        call.status = ToolStatus::Success;
                        if let Some(r) = result {
                            call.output = Some(r);
                        }
                    }
                }
            }
            AgentEvent::NeedsContext { question, suggestions } => {
                self.needs_context = Some(NeedsContextState { question, suggestions });
                // Don't clear streaming - show the question
            }
            AgentEvent::TaskComplete => {
                // If there's remaining streaming content, finalize it
                if let Some(streaming) = self.streaming.take() {
                    if !streaming.text_buffer.is_empty() {
                        self.messages.push(Message {
                            id: Uuid::new_v4().to_string(),
                            role: Role::Assistant,
                            content: MessageContent::Text(streaming.text_buffer),
                            timestamp: Utc::now(),
                        });
                    }
                    if !streaming.tool_calls.is_empty() {
                        self.messages.push(Message {
                            id: Uuid::new_v4().to_string(),
                            role: Role::Assistant,
                            content: MessageContent::ToolUse { calls: streaming.tool_calls },
                            timestamp: Utc::now(),
                        });
                    }
                }
            }
            AgentEvent::Error(msg) => {
                // Add error as assistant message
                self.messages.push(Message {
                    id: Uuid::new_v4().to_string(),
                    role: Role::Assistant,
                    content: MessageContent::Text(format!("Error: {}", msg)),
                    timestamp: Utc::now(),
                });
                self.streaming = None;
            }
        }
        
        // Auto-scroll to bottom
        self.scroll_to_bottom();
    }
    
    pub fn scroll_up(&mut self) {
        self.scroll = self.scroll.saturating_sub(3);
    }
    
    pub fn scroll_down(&mut self) {
        self.scroll = self.scroll.saturating_add(3);
    }
    
    pub fn scroll_to_bottom(&mut self) {
        // This will be clamped during rendering
        self.scroll = u16::MAX;
    }
    
    pub fn is_streaming(&self) -> bool {
        self.streaming.is_some()
    }
    
    pub fn streaming_text(&self) -> Option<&str> {
        self.streaming.as_ref().map(|s| s.text_buffer.as_str())
    }
}
