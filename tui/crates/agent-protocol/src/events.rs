//! Streaming events from daemon.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Agent event types matching the daemon's AgentEventType.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AgentEventType {
    TextDelta { text: String },
    ToolCallStart {
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
    },
    ToolCallEnd {
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        result: Option<String>,
    },
    TaskComplete { summary: String },
    Error { message: String },
}

/// Streaming event from daemon matching AgentStreamEvent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStreamEvent {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub event: AgentEventType,
}

impl AgentStreamEvent {
    pub const MSG_TYPE: &'static str = "agent_stream";
}

/// Simplified agent events for TUI consumption (what Backend trait produces).
#[derive(Debug, Clone)]
pub enum AgentEvent {
    TaskStarted,
    TextDelta(String),
    TextComplete(String),
    ToolCallStarted {
        id: String,
        name: String,
        args: Value,
    },
    ToolOutputDelta {
        id: String,
        delta: String,
    },
    ToolCallComplete {
        id: String,
        result: Option<String>,
    },
    NeedsContext {
        question: String,
        suggestions: Vec<String>,
    },
    TaskComplete,
    Error(String),
}

impl From<AgentEventType> for AgentEvent {
    fn from(event: AgentEventType) -> Self {
        match event {
            AgentEventType::TextDelta { text } => AgentEvent::TextDelta(text),
            AgentEventType::ToolCallStart {
                tool_name,
                tool_call_id,
            } => AgentEvent::ToolCallStarted {
                id: tool_call_id,
                name: tool_name,
                args: Value::Null,
            },
            AgentEventType::ToolCallEnd {
                tool_call_id,
                result,
                ..
            } => AgentEvent::ToolCallComplete {
                id: tool_call_id,
                result,
            },
            AgentEventType::TaskComplete { .. } => AgentEvent::TaskComplete,
            AgentEventType::Error { message } => AgentEvent::Error(message),
        }
    }
}
