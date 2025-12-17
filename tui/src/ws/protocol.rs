use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringEvent {
    pub ts: String,
    pub source: String,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    #[serde(rename = "instanceId")]
    pub instance_id: String,
    pub name: String,
    #[serde(rename = "projectPath")]
    pub project_path: String,
    pub status: String,
    #[serde(default)]
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutgoingMessage {
    Command {
        id: String,
        action: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        key: Option<String>,
    },
    AgentMessage {
        id: String,
        intent: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        answer: Option<String>,
        #[serde(rename = "conversationId", skip_serializing_if = "Option::is_none")]
        conversation_id: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum IncomingMessage {
    CommandResponse(CommandResponse),
    AgentResponse(AgentResponse),
    #[serde(untagged)]
    Event(MonitoringEvent),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponse {
    pub id: String,
    pub success: bool,
    #[serde(default)]
    pub data: serde_json::Value,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponse {
    pub id: String,
    pub status: AgentStatus,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub question: Option<String>,
    #[serde(rename = "conversationId", default)]
    pub conversation_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Success,
    NeedsContext,
    Error,
}

impl AgentResponse {
    pub fn to_monitoring_event(&self) -> MonitoringEvent {
        let (event_type, payload) = match self.status {
            AgentStatus::Success => (
                "agent_success".to_string(),
                serde_json::json!({
                    "summary": self.summary,
                }),
            ),
            AgentStatus::NeedsContext => (
                "agent_needs_context".to_string(),
                serde_json::json!({
                    "question": self.question,
                }),
            ),
            AgentStatus::Error => (
                "agent_error".to_string(),
                serde_json::json!({
                    "error": self.summary,
                }),
            ),
        };

        MonitoringEvent {
            ts: chrono::Utc::now().to_rfc3339(),
            source: "agent".to_string(),
            event_type,
            payload,
        }
    }
}
