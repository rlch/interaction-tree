//! WebSocket protocol types for communication with the daemon.

use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Client Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientType {
    Mcp,
    Tui,
}

// ─────────────────────────────────────────────────────────────────────────────
// Client → Daemon Messages
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientHello {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(rename = "clientType")]
    pub client_type: ClientType,
    #[serde(rename = "clientId")]
    pub client_id: String,
    pub version: String,
}

impl ClientHello {
    pub const MSG_TYPE: &'static str = "hello";

    pub fn new(client_id: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            msg_type: Self::MSG_TYPE.to_string(),
            client_type: ClientType::Tui,
            client_id: client_id.into(),
            version: version.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: String,
    #[serde(rename = "clientId")]
    pub client_id: String,
    pub action: CommandAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl CommandMessage {
    pub const MSG_TYPE: &'static str = "command";

    pub fn new(
        id: impl Into<String>,
        client_id: impl Into<String>,
        action: CommandAction,
    ) -> Self {
        Self {
            msg_type: Self::MSG_TYPE.to_string(),
            id: id.into(),
            client_id: client_id.into(),
            action,
            data: None,
        }
    }

    pub fn with_data(mut self, data: serde_json::Value) -> Self {
        self.data = Some(data);
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandAction {
    CreateSession,
    DestroySession,
    ListSessions,
    ConnectSession,
    DisconnectSession,
    RunApp,
    StopApp,
    HotReload,
    HotRestart,
    GetTree,
    ExecuteInteraction,
    GetLogs,
    AgentMessage,
    GetStatus,
    HealthCheck,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentToolCall {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: String,
    #[serde(rename = "clientId")]
    pub client_id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub intent: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<Vec<String>>,
    #[serde(rename = "conversationId", skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
}

impl AgentToolCall {
    pub const MSG_TYPE: &'static str = "agent_tool_call";

    pub fn new(
        id: impl Into<String>,
        client_id: impl Into<String>,
        session_id: impl Into<String>,
        intent: impl Into<String>,
    ) -> Self {
        Self {
            msg_type: Self::MSG_TYPE.to_string(),
            id: id.into(),
            client_id: client_id.into(),
            session_id: session_id.into(),
            intent: intent.into(),
            context: None,
            conversation_id: None,
        }
    }

    pub fn with_context(mut self, context: Vec<String>) -> Self {
        self.context = Some(context);
        self
    }

    pub fn with_conversation_id(mut self, id: impl Into<String>) -> Self {
        self.conversation_id = Some(id.into());
        self
    }
}

/// Union of all client messages.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ClientMessage {
    Hello(ClientHello),
    Command(CommandMessage),
    AgentToolCall(AgentToolCall),
}

// ─────────────────────────────────────────────────────────────────────────────
// Daemon → Client Messages
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerHello {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(rename = "daemonVersion")]
    pub daemon_version: String,
    pub sessions: Vec<SessionSummary>,
}

impl ServerHello {
    pub const MSG_TYPE: &'static str = "hello_ack";
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub name: String,
    #[serde(rename = "projectPath")]
    pub project_path: String,
    #[serde(rename = "appStatus")]
    pub app_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl CommandResponse {
    pub const MSG_TYPE: &'static str = "command_response";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentResponseStatus {
    Success,
    Failed,
    NeedsContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: String,
    pub status: AgentResponseStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub question: Option<String>,
    #[serde(rename = "conversationId", skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
}

impl AgentResponse {
    pub const MSG_TYPE: &'static str = "agent_response";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventSource {
    Flutter,
    Vm,
    Agent,
    Daemon,
    Session,
    Tree,
    Interaction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringEvent {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub ts: String,
    pub source: EventSource,
    #[serde(rename = "eventType")]
    pub event_type: String,
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub payload: serde_json::Value,
}

impl MonitoringEvent {
    pub const MSG_TYPE: &'static str = "event";
}

/// Union of all server messages.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "hello_ack")]
    Hello(ServerHelloData),
    #[serde(rename = "command_response")]
    CommandResponse(CommandResponseData),
    #[serde(rename = "agent_response")]
    AgentResponse(AgentResponseData),
    #[serde(rename = "event")]
    MonitoringEvent(MonitoringEventData),
    #[serde(rename = "agent_stream")]
    AgentStream(AgentStreamData),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerHelloData {
    #[serde(rename = "daemonVersion")]
    pub daemon_version: String,
    pub sessions: Vec<SessionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResponseData {
    pub id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponseData {
    pub id: String,
    pub status: AgentResponseStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub question: Option<String>,
    #[serde(rename = "conversationId", skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringEventData {
    pub ts: String,
    pub source: EventSource,
    #[serde(rename = "eventType")]
    pub event_type: String,
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStreamData {
    pub id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub event: super::events::AgentEventType,
}
