#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VadFrame {
    pub state: String, // "SILENCE" | "SPEECH"
    pub confidence: f32,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeVadConfig {
    pub threshold: f32,
    pub min_speech_duration_ms: u64,
    pub silence_debounce_ms: u64,
}

impl Default for NativeVadConfig {
    fn default() -> Self {
        Self {
            threshold: 0.05,
            min_speech_duration_ms: 200,
            silence_debounce_ms: 1000,
        }
    }
}

pub struct NativeVadEngine {
    config: NativeVadConfig,
    current_state: String,
    speech_start_time: Option<u64>,
    silence_start_time: Option<u64>,
}

impl NativeVadEngine {
    pub fn new(config: Option<NativeVadConfig>) -> Self {
        Self {
            config: config.unwrap_or_default(),
            current_state: "SILENCE".to_string(),
            speech_start_time: None,
            silence_start_time: None,
        }
    }

    pub fn set_config(&mut self, config: NativeVadConfig) {
        self.config = config;
    }

    pub fn process_frame(
        &mut self,
        rms: f32,
        timestamp_ms: u64,
        app: Option<&AppHandle>,
    ) -> VadFrame {
        let mut target_state = self.current_state.clone();

        if rms >= self.config.threshold {
            self.silence_start_time = None;
            if self.current_state == "SILENCE" {
                if self.speech_start_time.is_none() {
                    self.speech_start_time = Some(timestamp_ms);
                } else if timestamp_ms.saturating_sub(self.speech_start_time.unwrap())
                    >= self.config.min_speech_duration_ms
                {
                    target_state = "SPEECH".to_string();
                }
            }
        } else {
            self.speech_start_time = None;
            if self.current_state == "SPEECH" {
                if self.silence_start_time.is_none() {
                    self.silence_start_time = Some(timestamp_ms);
                } else if timestamp_ms.saturating_sub(self.silence_start_time.unwrap())
                    >= self.config.silence_debounce_ms
                {
                    target_state = "SILENCE".to_string();
                }
            }
        }

        if target_state != self.current_state {
            self.current_state = target_state.clone();
            let frame = VadFrame {
                state: target_state.clone(),
                confidence: (rms / (self.config.threshold * 2.0)).min(1.0),
                timestamp: timestamp_ms,
            };

            if let Some(app_handle) = app {
                let _ = app_handle.emit("audio://vad_frame", &frame);
            }
        }

        VadFrame {
            state: self.current_state.clone(),
            confidence: (rms / (self.config.threshold * 2.0)).min(1.0),
            timestamp: timestamp_ms,
        }
    }

    pub fn get_state(&self) -> String {
        self.current_state.clone()
    }
}
