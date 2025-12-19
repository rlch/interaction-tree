//! Chat message types.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub role: Role,
    pub content: MessageContent,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    ToolUse { calls: Vec<ToolCall> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: Value,
    pub status: ToolStatus,
    pub output: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolStatus {
    Running,
    Success,
    Failed,
}

impl Message {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            role: Role::User,
            content: MessageContent::Text(content.into()),
            timestamp: Utc::now(),
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            role: Role::Assistant,
            content: MessageContent::Text(content.into()),
            timestamp: Utc::now(),
        }
    }

    pub fn assistant_tool_use(calls: Vec<ToolCall>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            role: Role::Assistant,
            content: MessageContent::ToolUse { calls },
            timestamp: Utc::now(),
        }
    }
}

impl ToolCall {
    pub fn new(id: impl Into<String>, name: impl Into<String>, args: Value) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            args,
            status: ToolStatus::Running,
            output: None,
        }
    }

    pub fn with_status(mut self, status: ToolStatus) -> Self {
        self.status = status;
        self
    }

    pub fn with_output(mut self, output: impl Into<String>) -> Self {
        self.output = Some(output.into());
        self
    }
}
