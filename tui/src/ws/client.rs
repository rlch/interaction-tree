use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::ws::protocol::{IncomingMessage, OutgoingMessage};

#[derive(Debug, Clone)]
pub enum WsEvent {
    Connected { instance_id: Option<String> },
    Message(IncomingMessage),
    Disconnected,
    Error(String),
}

pub struct WsClient {
    tx: mpsc::Sender<OutgoingMessage>,
}

impl WsClient {
    pub async fn connect(uri: &str, event_tx: mpsc::Sender<WsEvent>) -> Result<Self> {
        let (ws_stream, _) = connect_async(uri).await?;
        let (mut write, mut read) = ws_stream.split();

        let (tx, mut rx) = mpsc::channel::<OutgoingMessage>(32);

        // Spawn task to handle outgoing messages
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                let json = match serde_json::to_string(&msg) {
                    Ok(j) => j,
                    Err(_) => continue,
                };
                if write.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        });

        // Spawn task to handle incoming messages
        let event_tx_clone = event_tx.clone();
        tokio::spawn(async move {
            let mut connected_sent = false;

            while let Some(result) = read.next().await {
                match result {
                    Ok(Message::Text(text)) => {
                        // Try to extract instance_id from monitoring.connected event
                        if !connected_sent {
                            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                                if value.get("type").and_then(|v| v.as_str())
                                    == Some("monitoring.connected")
                                {
                                    let instance_id = value
                                        .get("payload")
                                        .and_then(|p| p.get("instanceId"))
                                        .and_then(|v| v.as_str())
                                        .map(String::from);

                                    let _ = event_tx_clone
                                        .send(WsEvent::Connected { instance_id })
                                        .await;
                                    connected_sent = true;
                                    continue;
                                }
                            }
                        }

                        // Parse as IncomingMessage
                        if let Ok(msg) = serde_json::from_str::<IncomingMessage>(&text) {
                            let _ = event_tx_clone.send(WsEvent::Message(msg)).await;
                        }
                    }
                    Ok(Message::Close(_)) => {
                        let _ = event_tx_clone.send(WsEvent::Disconnected).await;
                        break;
                    }
                    Ok(Message::Ping(_)) => {}
                    Ok(_) => {}
                    Err(e) => {
                        let _ = event_tx_clone
                            .send(WsEvent::Error(e.to_string()))
                            .await;
                        let _ = event_tx_clone.send(WsEvent::Disconnected).await;
                        break;
                    }
                }
            }
        });

        Ok(Self { tx })
    }

    pub async fn send(&self, msg: OutgoingMessage) -> Result<()> {
        self.tx
            .send(msg)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send message: {}", e))
    }
}
