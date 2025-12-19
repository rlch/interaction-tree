//! Backend trait definition.

use agent_protocol::AgentEvent;
use anyhow::Result;
use async_trait::async_trait;

/// Backend trait for agent communication.
/// Implementations receive streaming events from the agent.
#[async_trait]
pub trait Backend: Send + Sync {
    /// Send a user message to the agent
    async fn send_message(&self, content: String) -> Result<()>;

    /// Send a follow-up answer (for needs_context)
    async fn send_answer(&self, answer: String, conversation_id: String) -> Result<()>;

    /// Receive next event from agent (streaming)
    /// Returns None when the agent turn is complete
    async fn next_event(&mut self) -> Result<Option<AgentEvent>>;

    /// Get current session ID
    fn session_id(&self) -> &str;

    /// Check if connected
    fn is_connected(&self) -> bool;
}
