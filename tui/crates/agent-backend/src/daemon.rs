//! Daemon backend implementation.

use crate::backend::Backend;
use agent_protocol::{
    AgentEvent, AgentResponseStatus, AgentStreamEvent, AgentToolCall, ClientHello, ServerHello,
    ServerMessage,
};
use anyhow::{Context, Result};
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

/// Backend that connects to the fleeter daemon.
pub struct DaemonBackend {
    url: String,
    client_id: String,
    session_id: String,
    tx: Option<mpsc::Sender<String>>,
    event_rx: Option<mpsc::Receiver<AgentEvent>>,
    connected: bool,
}

impl DaemonBackend {
    pub fn new(url: impl Into<String>, session_id: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            client_id: format!("agent-tui-{}", Uuid::new_v4()),
            session_id: session_id.into(),
            tx: None,
            event_rx: None,
            connected: false,
        }
    }

    pub async fn connect(&mut self) -> Result<()> {
        let (ws_stream, _) = connect_async(&self.url).await?;
        let (mut write, mut read) = ws_stream.split();

        // Send hello
        let hello = ClientHello::new(&self.client_id, env!("CARGO_PKG_VERSION"));
        write
            .send(Message::Text(serde_json::to_string(&hello)?.into()))
            .await?;

        // Wait for hello_ack
        while let Some(msg) = read.next().await {
            if let Message::Text(text) = msg? {
                if let Ok(hello) = serde_json::from_str::<ServerHello>(&text) {
                    if hello.msg_type == ServerHello::MSG_TYPE {
                        tracing::info!("Connected to daemon v{}", hello.daemon_version);
                        break;
                    }
                }
            }
        }

        // Set up channels
        let (tx, mut cmd_rx) = mpsc::channel::<String>(32);
        let (event_tx, event_rx) = mpsc::channel::<AgentEvent>(32);

        // Spawn write task
        tokio::spawn(async move {
            while let Some(json) = cmd_rx.recv().await {
                if write.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        });

        // Spawn read task - parse incoming messages and convert to AgentEvent
        let session_id = self.session_id.clone();
        tokio::spawn(async move {
            while let Some(Ok(Message::Text(text))) = read.next().await {
                // Try to parse as ServerMessage enum (tagged union)
                if let Ok(server_msg) = serde_json::from_str::<ServerMessage>(&text) {
                    match server_msg {
                        ServerMessage::AgentStream(data) => {
                            if data.session_id == session_id {
                                let event: AgentEvent = data.event.into();
                                let _ = event_tx.send(event).await;
                            }
                        }
                        ServerMessage::AgentResponse(data) => {
                            match data.status {
                                AgentResponseStatus::Success => {
                                    if let Some(summary) = data.summary {
                                        let _ =
                                            event_tx.send(AgentEvent::TextComplete(summary)).await;
                                    }
                                    let _ = event_tx.send(AgentEvent::TaskComplete).await;
                                }
                                AgentResponseStatus::NeedsContext => {
                                    let _ = event_tx
                                        .send(AgentEvent::NeedsContext {
                                            question: data.question.unwrap_or_default(),
                                            suggestions: vec![],
                                        })
                                        .await;
                                }
                                AgentResponseStatus::Failed => {
                                    let _ = event_tx
                                        .send(AgentEvent::Error(
                                            data.error.unwrap_or_else(|| "Unknown error".into()),
                                        ))
                                        .await;
                                }
                            }
                        }
                        _ => {}
                    }
                }
                // Fallback: Try legacy AgentStreamEvent format
                else if let Ok(stream_event) = serde_json::from_str::<AgentStreamEvent>(&text) {
                    if stream_event.session_id == session_id {
                        let event: AgentEvent = stream_event.event.into();
                        let _ = event_tx.send(event).await;
                    }
                }
            }
        });

        self.tx = Some(tx);
        self.event_rx = Some(event_rx);
        self.connected = true;
        Ok(())
    }
}

#[async_trait]
impl Backend for DaemonBackend {
    async fn send_message(&self, content: String) -> Result<()> {
        let tx = self.tx.as_ref().context("Not connected")?;
        let msg = AgentToolCall::new(
            Uuid::new_v4().to_string(),
            &self.client_id,
            &self.session_id,
            content,
        );
        tx.send(serde_json::to_string(&msg)?).await?;
        Ok(())
    }

    async fn send_answer(&self, answer: String, conversation_id: String) -> Result<()> {
        let tx = self.tx.as_ref().context("Not connected")?;
        let msg = AgentToolCall::new(
            Uuid::new_v4().to_string(),
            &self.client_id,
            &self.session_id,
            answer,
        )
        .with_conversation_id(conversation_id);
        tx.send(serde_json::to_string(&msg)?).await?;
        Ok(())
    }

    async fn next_event(&mut self) -> Result<Option<AgentEvent>> {
        if let Some(rx) = self.event_rx.as_mut() {
            Ok(rx.recv().await)
        } else {
            Ok(None)
        }
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }

    fn is_connected(&self) -> bool {
        self.connected
    }
}
