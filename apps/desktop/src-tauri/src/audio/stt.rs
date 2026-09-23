#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeSttTranscriptEvent {
    pub transcript_type: String, // "interim" | "final"
    pub transcript: String,
    pub confidence: f32,
    pub is_final: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeSttConfig {
    pub language: String,
    pub sample_rate: u32,
    pub model_id: Option<String>,
}

impl Default for NativeSttConfig {
    fn default() -> Self {
        Self {
            language: "en".to_string(),
            sample_rate: 16000,
            model_id: None,
        }
    }
}

pub struct NativeSttEngine {
    config: NativeSttConfig,
    is_listening: bool,
    interim_buffer: String,
}

impl NativeSttEngine {
    pub fn new(config: Option<NativeSttConfig>) -> Self {
        Self {
            config: config.unwrap_or_default(),
            is_listening: false,
            interim_buffer: String::new(),
        }
    }

    pub fn start(&mut self) {
        self.is_listening = true;
        self.interim_buffer.clear();
    }

    pub fn stop(&mut self) {
        self.is_listening = false;
        self.interim_buffer.clear();
    }

    pub fn abort(&mut self) {
        self.is_listening = false;
        self.interim_buffer.clear();
    }

    pub fn feed_text_transcript(&mut self, text: String, is_final: bool, app: Option<&AppHandle>) {
        if !self.is_listening {
            return;
        }

        if is_final {
            self.interim_buffer.clear();
            let event = NativeSttTranscriptEvent {
                transcript_type: "final".to_string(),
                transcript: text,
                confidence: 0.95,
                is_final: true,
            };
            if let Some(app_handle) = app {
                let _ = app_handle.emit("audio://stt_transcript", &event);
            }
        } else {
            self.interim_buffer = text.clone();
            let event = NativeSttTranscriptEvent {
                transcript_type: "interim".to_string(),
                transcript: text,
                confidence: 0.80,
                is_final: false,
            };
            if let Some(app_handle) = app {
                let _ = app_handle.emit("audio://stt_transcript", &event);
            }
        }
    }

    pub fn is_listening(&self) -> bool {
        self.is_listening
    }
}
