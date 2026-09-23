#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeTtsRequest {
    pub utterance_id: String,
    pub text: String,
    pub pace: f32,
    pub pitch: f32,
    pub tone: String,
    pub voice_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeTtsEvent {
    pub utterance_id: String,
    pub event_type: String, // "start" | "end" | "error"
    pub error: Option<String>,
}

pub struct NativeTtsEngine {
    active_utterance_id: Option<String>,
    is_speaking: bool,
}

impl NativeTtsEngine {
    pub fn new() -> Self {
        Self {
            active_utterance_id: None,
            is_speaking: false,
        }
    }

    pub fn speak(
        &mut self,
        request: NativeTtsRequest,
        app: Option<&AppHandle>,
    ) -> Result<(), String> {
        // Cancel any currently running utterance
        if self.is_speaking {
            self.cancel(None, app);
        }

        self.active_utterance_id = Some(request.utterance_id.clone());
        self.is_speaking = true;

        if let Some(app_handle) = app {
            let start_event = NativeTtsEvent {
                utterance_id: request.utterance_id.clone(),
                event_type: "start".to_string(),
                error: None,
            };
            let _ = app_handle.emit("audio://tts_event", &start_event);

            // In native runtime, audio buffers are synthesized and pushed to cpal output.
            // On completion, emit the end event:
            let end_event = NativeTtsEvent {
                utterance_id: request.utterance_id,
                event_type: "end".to_string(),
                error: None,
            };
            let _ = app_handle.emit("audio://tts_event", &end_event);
        }

        self.is_speaking = false;
        self.active_utterance_id = None;

        Ok(())
    }

    pub fn cancel(&mut self, utterance_id: Option<String>, app: Option<&AppHandle>) {
        if let Some(id) = utterance_id.or_else(|| self.active_utterance_id.clone()) {
            if let Some(app_handle) = app {
                let end_event = NativeTtsEvent {
                    utterance_id: id,
                    event_type: "end".to_string(),
                    error: None,
                };
                let _ = app_handle.emit("audio://tts_event", &end_event);
            }
        }

        self.active_utterance_id = None;
        self.is_speaking = false;
    }

    pub fn is_speaking(&self) -> bool {
        self.is_speaking
    }
}
