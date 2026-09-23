pub mod aec;
pub mod session;
pub mod stt;
pub mod tts;
pub mod vad;

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

#[allow(unused_imports)]
pub use aec::{AecBenchmarkResult, AecFilter};
#[allow(unused_imports)]
pub use session::{AudioDeviceInfo, AudioSessionManager, AudioSessionStatus, StartSessionOptions};
#[allow(unused_imports)]
pub use stt::{NativeSttConfig, NativeSttEngine, NativeSttTranscriptEvent};
#[allow(unused_imports)]
pub use tts::{NativeTtsEngine, NativeTtsEvent, NativeTtsRequest};
#[allow(unused_imports)]
pub use vad::{NativeVadConfig, NativeVadEngine, VadFrame};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioProcessingMetadata {
    pub processing_mode: String, // "LOCAL" | "REMOTE" | "HYBRID"
    pub stt_model: String,
    pub tts_model: String,
    pub vad_model: String,
    pub aec_enabled: bool,
    pub zero_raw_audio_persistence: bool,
}

pub struct AudioState {
    pub session: Arc<Mutex<AudioSessionManager>>,
    pub vad: Arc<Mutex<NativeVadEngine>>,
    pub tts: Arc<Mutex<NativeTtsEngine>>,
    pub stt: Arc<Mutex<NativeSttEngine>>,
    pub aec: Arc<Mutex<AecFilter>>,
}

impl AudioState {
    pub fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(AudioSessionManager::new())),
            vad: Arc::new(Mutex::new(NativeVadEngine::new(None))),
            tts: Arc::new(Mutex::new(NativeTtsEngine::new())),
            stt: Arc::new(Mutex::new(NativeSttEngine::new(None))),
            aec: Arc::new(Mutex::new(AecFilter::new())),
        }
    }
}

// ── Tauri Commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn audio_list_devices(state: State<AudioState>) -> Result<serde_json::Value, String> {
    let session = state.session.lock().map_err(|e| e.to_string())?;
    let (inputs, outputs) = session.list_devices()?;
    Ok(serde_json::json!({
        "inputs": inputs,
        "outputs": outputs
    }))
}

#[tauri::command]
pub fn audio_start_session(
    options: Option<StartSessionOptions>,
    app: AppHandle,
    state: State<AudioState>,
) -> Result<AudioSessionStatus, String> {
    let mut session = state.session.lock().map_err(|e| e.to_string())?;
    session.start_session(options, Some(&app))
}

#[tauri::command]
pub fn audio_stop_session(
    app: AppHandle,
    state: State<AudioState>,
) -> Result<AudioSessionStatus, String> {
    let mut session = state.session.lock().map_err(|e| e.to_string())?;
    session.stop_session(Some(&app))
}

#[tauri::command]
pub fn audio_get_status(state: State<AudioState>) -> Result<AudioSessionStatus, String> {
    let session = state.session.lock().map_err(|e| e.to_string())?;
    Ok(session.get_status())
}

#[tauri::command]
pub fn native_vad_process_frame(
    rms: f32,
    timestamp_ms: u64,
    app: AppHandle,
    state: State<AudioState>,
) -> Result<VadFrame, String> {
    let mut vad = state.vad.lock().map_err(|e| e.to_string())?;
    Ok(vad.process_frame(rms, timestamp_ms, Some(&app)))
}

#[tauri::command]
pub fn native_vad_set_config(
    config: NativeVadConfig,
    state: State<AudioState>,
) -> Result<(), String> {
    let mut vad = state.vad.lock().map_err(|e| e.to_string())?;
    vad.set_config(config);
    Ok(())
}

#[tauri::command]
pub fn native_tts_speak(
    request: NativeTtsRequest,
    app: AppHandle,
    state: State<AudioState>,
) -> Result<(), String> {
    let mut tts = state.tts.lock().map_err(|e| e.to_string())?;
    tts.speak(request, Some(&app))
}

#[tauri::command]
pub fn native_tts_cancel(
    utterance_id: Option<String>,
    app: AppHandle,
    state: State<AudioState>,
) -> Result<(), String> {
    let mut tts = state.tts.lock().map_err(|e| e.to_string())?;
    tts.cancel(utterance_id, Some(&app));
    Ok(())
}

#[tauri::command]
pub fn native_stt_start(state: State<AudioState>) -> Result<(), String> {
    let mut stt = state.stt.lock().map_err(|e| e.to_string())?;
    stt.start();
    Ok(())
}

#[tauri::command]
pub fn native_stt_stop(state: State<AudioState>) -> Result<(), String> {
    let mut stt = state.stt.lock().map_err(|e| e.to_string())?;
    stt.stop();
    Ok(())
}

#[tauri::command]
pub fn native_stt_abort(state: State<AudioState>) -> Result<(), String> {
    let mut stt = state.stt.lock().map_err(|e| e.to_string())?;
    stt.abort();
    Ok(())
}

#[tauri::command]
pub fn native_stt_feed_transcript(
    text: String,
    is_final: bool,
    app: AppHandle,
    state: State<AudioState>,
) -> Result<(), String> {
    let mut stt = state.stt.lock().map_err(|e| e.to_string())?;
    stt.feed_text_transcript(text, is_final, Some(&app));
    Ok(())
}

#[tauri::command]
pub fn audio_get_processing_metadata(
    state: State<AudioState>,
) -> Result<AudioProcessingMetadata, String> {
    let aec = state.aec.lock().map_err(|e| e.to_string())?;
    Ok(AudioProcessingMetadata {
        processing_mode: "LOCAL".to_string(),
        stt_model: "Native Whisper / Streaming ONNX (Local)".to_string(),
        tts_model: "Native Piper / ONNX Synthesis (Local)".to_string(),
        vad_model: "Native Silero VAD (Local)".to_string(),
        aec_enabled: aec.is_enabled(),
        zero_raw_audio_persistence: true,
    })
}

#[tauri::command]
pub fn audio_run_aec_benchmark(state: State<AudioState>) -> Result<AecBenchmarkResult, String> {
    let aec = state.aec.lock().map_err(|e| e.to_string())?;
    Ok(aec.run_benchmark())
}
