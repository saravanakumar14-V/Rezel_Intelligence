use futures_util::{SinkExt, StreamExt};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot, RwLock};
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

/// The default authoritative port for the IPC server
pub const IPC_PORT: u16 = 49211;

/// Shared state for the IPC server
#[derive(Clone)]
pub struct IpcState {
    /// Active client connections. A client entry is removed only by the exact
    /// WebSocket connection that created it.
    pub clients: Arc<RwLock<HashMap<String, ConnectedClient>>>,
    /// Pending requests are tied to the WebSocket connection that received the
    /// command. This lets a disconnect fail them immediately instead of
    /// waiting for the command timeout.
    pub pending_requests: Arc<RwLock<HashMap<String, PendingIpcRequest>>>,
    /// The one Blender process launched by this Rezel instance that is allowed
    /// to claim the canonical `blender` client route.
    pub managed_blender: Arc<RwLock<Option<ManagedBlenderSession>>>,
    // A simple static auth token for Milestone 9.1
    pub auth_token: String,
}

impl IpcState {
    pub fn new(auth_token: String) -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            pending_requests: Arc::new(RwLock::new(HashMap::new())),
            managed_blender: Arc::new(RwLock::new(None)),
            auth_token,
        }
    }

    /// Makes a newly spawned Blender child the sole managed Blender launch.
    /// Any request in flight on a superseded connection fails immediately.
    pub async fn activate_managed_blender(&self, launch_id: String, process_id: u32) {
        let replaced_connection = {
            let mut managed = self.managed_blender.write().await;
            *managed = Some(ManagedBlenderSession {
                launch_id: launch_id.clone(),
                process_id,
            });

            self.clients.write().await.remove("blender")
        };

        if let Some(client) = replaced_connection {
            self.fail_pending_for_connection(
                &client.connection_id,
                "IPC_CONNECTION_SUPERSEDED: Blender launch was replaced by a newer managed launch.",
            )
            .await;
        }

        info!(
            "[IPC] Managed Blender launch activated: launch_id={}, pid={}",
            launch_id, process_id
        );
    }

    pub async fn is_expected_blender_launch(
        &self,
        launch_id: Option<&str>,
        process_id: Option<u32>,
    ) -> bool {
        let managed = self.managed_blender.read().await;
        matches!(
            managed.as_ref(),
            Some(session)
                if launch_id == Some(session.launch_id.as_str())
                    && process_id == Some(session.process_id)
        )
    }

    async fn fail_pending_for_connection(&self, connection_id: &str, message: &str) {
        let pending = {
            let mut requests = self.pending_requests.write().await;
            let ids: Vec<String> = requests
                .iter()
                .filter_map(|(id, request)| {
                    (request.connection_id == connection_id).then(|| id.clone())
                })
                .collect();
            ids.into_iter()
                .filter_map(|id| requests.remove(&id))
                .collect::<Vec<_>>()
        };

        for request in pending {
            let _ = request.responder.send(IpcResponse {
                correlation_id: request.correlation_id,
                success: false,
                result: None,
                error: Some(message.to_string()),
            });
        }
    }

    async fn remove_connection_if_current(&self, client_id: &str, connection_id: &str) -> bool {
        let removed = {
            let mut clients = self.clients.write().await;
            let is_current = clients
                .get(client_id)
                .map(|client| client.connection_id == connection_id)
                .unwrap_or(false);
            if is_current {
                clients.remove(client_id);
            }
            is_current
        };

        self.fail_pending_for_connection(
            connection_id,
            "IPC_CONNECTION_LOST: The application IPC connection closed before it responded.",
        )
        .await;
        removed
    }
}

#[derive(Clone)]
pub struct ConnectedClient {
    pub sender: mpsc::Sender<Message>,
    pub connection_id: String,
}

pub struct PendingIpcRequest {
    pub correlation_id: String,
    pub connection_id: String,
    pub responder: oneshot::Sender<IpcResponse>,
}

#[derive(Clone, Debug)]
pub struct ManagedBlenderSession {
    pub launch_id: String,
    pub process_id: u32,
}

// ─── Protocol Definitions ──────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
pub enum IpcClientMessage {
    #[serde(rename = "auth")]
    Auth {
        token: String,
        client_id: String,
        capabilities: Vec<serde_json::Value>,
        #[serde(default)]
        launch_id: Option<String>,
        #[serde(default)]
        process_id: Option<u32>,
    },
    #[serde(rename = "response")]
    Response(IpcResponse),
    #[serde(rename = "error")]
    Error {
        correlation_id: String,
        message: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IpcResponse {
    pub correlation_id: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(tag = "type")]
pub enum IpcServerMessage {
    #[serde(rename = "auth_response")]
    AuthResponse {
        success: bool,
        error: Option<String>,
    },
    #[serde(rename = "command")]
    Command {
        correlation_id: String,
        command: String,
        args: serde_json::Value,
    },
}

// ─── Server Logic ─────────────────────────────────────────────────────────────

pub async fn start_ipc_server(state: IpcState, port: u16, app_handle: tauri::AppHandle) {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr)
        .await
        .expect("Failed to bind IPC server");
    info!("[IPC] Server listening on {}", addr);

    while let Ok((stream, _)) = listener.accept().await {
        let state_clone = state.clone();
        let app_handle_clone = app_handle.clone();
        tokio::spawn(handle_connection(stream, state_clone, app_handle_clone));
    }
}

async fn handle_connection(stream: TcpStream, state: IpcState, app_handle: tauri::AppHandle) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("[IPC] WebSocket handshake failed: {}", e);
            return;
        }
    };

    info!("[IPC] New WebSocket connection established");

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (tx, mut rx) = mpsc::channel::<Message>(32);

    // Spawn a task to forward messages from the mpsc channel to the websocket
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    let mut authenticated_client_id: Option<String> = None;
    let connection_id = Uuid::new_v4().to_string();

    while let Some(msg_result) = ws_receiver.next().await {
        let msg = match msg_result {
            Ok(msg) => msg,
            Err(e) => {
                warn!("[IPC] Connection error: {}", e);
                break;
            }
        };

        if let Message::Text(text) = msg {
            // Parse message
            let client_msg: Result<IpcClientMessage, _> = serde_json::from_str(&text);

            match client_msg {
                Ok(IpcClientMessage::Auth {
                    token,
                    client_id,
                    capabilities,
                    launch_id,
                    process_id,
                }) => {
                    // For milestone 10.2, enforce application identity: only 'blender' or 'ae' clients are expected.
                    if token == state.auth_token
                        && (client_id == "blender" || client_id.starts_with("ae_"))
                    {
                        if client_id == "blender"
                            && !state
                                .is_expected_blender_launch(launch_id.as_deref(), process_id)
                                .await
                        {
                            warn!(
                                "[IPC] Rejected Blender identity: launch_id={:?}, pid={:?}",
                                launch_id, process_id
                            );
                            let resp = IpcServerMessage::AuthResponse {
                                success: false,
                                error: Some("IPC_IDENTITY_MISMATCH: Blender launch ID or PID does not match the managed launch".to_string())
                            };
                            let _ = tx
                                .send(Message::Text(serde_json::to_string(&resp).unwrap()))
                                .await;
                            break;
                        }

                        info!(
                            "[IPC] Client '{}' authenticated with {} capabilities",
                            client_id,
                            capabilities.len()
                        );
                        authenticated_client_id = Some(client_id.clone());

                        // Register this exact connection. Only a previously authenticated
                        // managed Blender may be replaced, and it is superseded explicitly.
                        let replaced = state.clients.write().await.insert(
                            client_id.clone(),
                            ConnectedClient {
                                sender: tx.clone(),
                                connection_id: connection_id.clone(),
                            },
                        );
                        if let Some(previous) = replaced {
                            state
                                .fail_pending_for_connection(
                                    &previous.connection_id,
                                    "IPC_CONNECTION_SUPERSEDED: Client connection was replaced.",
                                )
                                .await;
                        }

                        // Send success
                        let resp = IpcServerMessage::AuthResponse {
                            success: true,
                            error: None,
                        };
                        let _ = tx
                            .send(Message::Text(serde_json::to_string(&resp).unwrap()))
                            .await;

                        // Emit event to frontend
                        use tauri::Emitter;
                        let payload = serde_json::json!({
                            "client_id": client_id,
                            "capabilities": capabilities
                        });
                        let _ = app_handle.emit("ipc://client_connected", payload);
                    } else {
                        warn!("[IPC] Authentication failed for client '{}'", client_id);
                        let resp = IpcServerMessage::AuthResponse {
                            success: false,
                            error: Some("Invalid token".to_string()),
                        };
                        let _ = tx
                            .send(Message::Text(serde_json::to_string(&resp).unwrap()))
                            .await;
                        break; // Disconnect
                    }
                }
                Ok(IpcClientMessage::Response(resp)) => {
                    if authenticated_client_id.is_none() {
                        warn!("[IPC] Unauthenticated client sent a response");
                        break;
                    }

                    let mut pending = state.pending_requests.write().await;
                    if let Some(sender) = pending.remove(&resp.correlation_id) {
                        let _ = sender.responder.send(resp);
                    } else {
                        warn!(
                            "[IPC] Received response for unknown correlation ID: {}",
                            resp.correlation_id
                        );
                    }
                }
                Ok(IpcClientMessage::Error {
                    correlation_id,
                    message,
                }) => {
                    let mut pending = state.pending_requests.write().await;
                    if let Some(sender) = pending.remove(&correlation_id) {
                        let resp = IpcResponse {
                            correlation_id,
                            success: false,
                            result: None,
                            error: Some(message),
                        };
                        let _ = sender.responder.send(resp);
                    }
                }
                Err(e) => {
                    warn!("[IPC] Malformed message received: {}", e);
                    // Just ignore malformed messages, or we could break to disconnect
                }
            }
        }
    }

    info!("[IPC] Connection closed");

    // Clean up
    if let Some(id) = authenticated_client_id {
        if state
            .remove_connection_if_current(&id, &connection_id)
            .await
        {
            info!("[IPC] Client '{}' unregistered", id);

            // Emit disconnect event only when the active route was removed.
            use tauri::Emitter;
            let _ = app_handle.emit(
                "ipc://client_disconnected",
                serde_json::json!({ "client_id": id }),
            );
        } else {
            info!(
                "[IPC] Stale connection for client '{}' closed without replacing the active route",
                id
            );
        }
    }
}

// ─── API for Tauri Commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn send_ipc_command(
    state: tauri::State<'_, IpcState>,
    client_id: String,
    command: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let clients = state.clients.read().await;
    let client = match clients.get(&client_id) {
        Some(client) => client.clone(),
        None => return Err(format!("Client '{}' not connected", client_id)),
    };
    drop(clients); // release lock early

    let correlation_id = Uuid::new_v4().to_string();
    let (resp_tx, resp_rx) = oneshot::channel();

    state.pending_requests.write().await.insert(
        correlation_id.clone(),
        PendingIpcRequest {
            correlation_id: correlation_id.clone(),
            connection_id: client.connection_id.clone(),
            responder: resp_tx,
        },
    );

    let msg = IpcServerMessage::Command {
        correlation_id: correlation_id.clone(),
        command,
        args,
    };

    if client
        .sender
        .send(Message::Text(serde_json::to_string(&msg).unwrap()))
        .await
        .is_err()
    {
        state.pending_requests.write().await.remove(&correlation_id);
        return Err("Failed to send message to client".to_string());
    }

    // Wait for response with a timeout
    match tokio::time::timeout(std::time::Duration::from_secs(30), resp_rx).await {
        Ok(Ok(response)) => {
            if response.success {
                Ok(response.result.unwrap_or(serde_json::json!({})))
            } else {
                Err(response
                    .error
                    .unwrap_or_else(|| "Unknown error from client".to_string()))
            }
        }
        Ok(Err(_)) => Err("Response channel closed unexpectedly".to_string()),
        Err(_) => {
            state.pending_requests.write().await.remove(&correlation_id);
            Err("Command timed out".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn managed_blender_requires_the_exact_launch_id_and_pid() {
        let state = IpcState::new("test-token".to_string());
        state
            .activate_managed_blender("launch-one".to_string(), 1001)
            .await;

        assert!(
            state
                .is_expected_blender_launch(Some("launch-one"), Some(1001))
                .await
        );
        assert!(
            !state
                .is_expected_blender_launch(Some("launch-two"), Some(1001))
                .await
        );
        assert!(
            !state
                .is_expected_blender_launch(Some("launch-one"), Some(1002))
                .await
        );

        state
            .activate_managed_blender("launch-two".to_string(), 2002)
            .await;
        assert!(
            !state
                .is_expected_blender_launch(Some("launch-one"), Some(1001))
                .await
        );
        assert!(
            state
                .is_expected_blender_launch(Some("launch-two"), Some(2002))
                .await
        );
    }

    #[tokio::test]
    async fn stale_disconnect_cannot_remove_newer_connection() {
        let state = IpcState::new("test-token".to_string());
        let (sender, _receiver) = mpsc::channel(1);
        state.clients.write().await.insert(
            "blender".to_string(),
            ConnectedClient {
                sender,
                connection_id: "new-connection".to_string(),
            },
        );

        assert!(
            !state
                .remove_connection_if_current("blender", "old-connection")
                .await
        );
        assert_eq!(
            state
                .clients
                .read()
                .await
                .get("blender")
                .unwrap()
                .connection_id,
            "new-connection"
        );
        assert!(
            state
                .remove_connection_if_current("blender", "new-connection")
                .await
        );
        assert!(!state.clients.read().await.contains_key("blender"));
    }

    #[tokio::test]
    async fn current_connection_loss_fails_its_pending_request_immediately() {
        let state = IpcState::new("test-token".to_string());
        let (sender, _receiver) = mpsc::channel(1);
        state.clients.write().await.insert(
            "blender".to_string(),
            ConnectedClient {
                sender,
                connection_id: "connection-one".to_string(),
            },
        );
        let (response_sender, response_receiver) = oneshot::channel();
        state.pending_requests.write().await.insert(
            "correlation-one".to_string(),
            PendingIpcRequest {
                correlation_id: "correlation-one".to_string(),
                connection_id: "connection-one".to_string(),
                responder: response_sender,
            },
        );

        assert!(
            state
                .remove_connection_if_current("blender", "connection-one")
                .await
        );
        let response = response_receiver
            .await
            .expect("pending request should be resolved on disconnect");
        assert!(!response.success);
        assert!(response.error.unwrap().starts_with("IPC_CONNECTION_LOST:"));
    }
}
