//! Core protocol types.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Unique identifier for an agent session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SessionId(pub Uuid);

impl SessionId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for SessionId {
    fn default() -> Self {
        Self::new()
    }
}

/// Agent session state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: SessionId,
    pub created_at: DateTime<Utc>,
    pub status: SessionStatus,
}

/// Status of an agent session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
}
