//! Chat message types and rendering for the Agent pane.

use chrono::{DateTime, Utc};
use serde_json::Value;

/// A chat message in the conversation.
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub id: String,
    pub role: ChatRole,
    pub content: ChatContent,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatRole {
    User,
    Assistant,
}

#[derive(Debug, Clone)]
pub enum ChatContent {
    Text(String),
    ToolCalls(Vec<ToolCall>),
}

#[derive(Debug, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: Value,
    pub status: ToolStatus,
    pub output: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolStatus {
    Running,
    Success,
    Failed,
}

/// Streaming state during agent response.
#[derive(Debug, Clone, Default)]
pub struct StreamingState {
    pub text_buffer: String,
    pub tool_calls: Vec<ToolCall>,
}

impl ChatMessage {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            role: ChatRole::User,
            content: ChatContent::Text(content.into()),
            timestamp: Utc::now(),
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            role: ChatRole::Assistant,
            content: ChatContent::Text(content.into()),
            timestamp: Utc::now(),
        }
    }

    pub fn assistant_tools(calls: Vec<ToolCall>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            role: ChatRole::Assistant,
            content: ChatContent::ToolCalls(calls),
            timestamp: Utc::now(),
        }
    }
}
