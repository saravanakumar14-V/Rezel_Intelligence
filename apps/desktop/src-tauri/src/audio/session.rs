#![allow(dead_code)]
use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub is_input: bool,
    pub channels: u16,
    pub sample_rates: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioSessionStatus {
    pub is_running: bool,
    pub active_input_device: Option<String>,
    pub active_output_device: Option<String>,
    pub sample_rate: u32,
    pub aec_enabled: bool,
    pub input_level: f32,
    pub output_level: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartSessionOptions {
    pub input_device_id: Option<String>,
    pub output_device_id: Option<String>,
    pub sample_rate: Option<u32>,
    pub enable_aec: Option<bool>,
}

pub struct AudioSessionManager {
    is_running: bool,
    active_input_id: Option<String>,
    active_output_id: Option<String>,
    sample_rate: u32,
    aec_enabled: bool,
    input_level: f32,
    output_level: f32,
    _input_stream: Option<cpal::Stream>,
    _output_stream: Option<cpal::Stream>,
}

unsafe impl Send for AudioSessionManager {}
unsafe impl Sync for AudioSessionManager {}

impl AudioSessionManager {
    pub fn new() -> Self {
        Self {
            is_running: false,
            active_input_id: None,
            active_output_id: None,
            sample_rate: 16000,
            aec_enabled: true,
            input_level: 0.0,
            output_level: 0.0,
            _input_stream: None,
            _output_stream: None,
        }
    }

    pub fn list_devices(&self) -> Result<(Vec<AudioDeviceInfo>, Vec<AudioDeviceInfo>), String> {
        let host = cpal::default_host();
        let mut input_devices = Vec::new();
        let mut output_devices = Vec::new();

        let default_in_name = host.default_input_device().and_then(|d| d.name().ok());
        let default_out_name = host.default_output_device().and_then(|d| d.name().ok());

        if let Ok(devices) = host.input_devices() {
            for dev in devices {
                if let Ok(name) = dev.name() {
                    let is_default = default_in_name.as_ref().map_or(false, |d| d == &name);
                    let channels = dev
                        .default_input_config()
                        .map(|c| c.channels())
                        .unwrap_or(1);

                    input_devices.push(AudioDeviceInfo {
                        id: name.clone(),
                        name,
                        is_default,
                        is_input: true,
                        channels,
                        sample_rates: vec![16000, 44100, 48000],
                    });
                }
            }
        }

        if let Ok(devices) = host.output_devices() {
            for dev in devices {
                if let Ok(name) = dev.name() {
                    let is_default = default_out_name.as_ref().map_or(false, |d| d == &name);
                    let channels = dev
                        .default_output_config()
                        .map(|c| c.channels())
                        .unwrap_or(2);

                    output_devices.push(AudioDeviceInfo {
                        id: name.clone(),
                        name,
                        is_default,
                        is_input: false,
                        channels,
                        sample_rates: vec![44100, 48000],
                    });
                }
            }
        }

        // Fallback default mock devices if running in a headless CI/test container without audio hardware
        if input_devices.is_empty() {
            input_devices.push(AudioDeviceInfo {
                id: "default_mock_input".to_string(),
                name: "Default Native Microphone (Mock)".to_string(),
                is_default: true,
                is_input: true,
                channels: 1,
                sample_rates: vec![16000, 44100, 48000],
            });
        }
        if output_devices.is_empty() {
            output_devices.push(AudioDeviceInfo {
                id: "default_mock_output".to_string(),
                name: "Default Native Speaker (Mock)".to_string(),
                is_default: true,
                is_input: false,
                channels: 2,
                sample_rates: vec![44100, 48000],
            });
        }

        Ok((input_devices, output_devices))
    }

    pub fn start_session(
        &mut self,
        options: Option<StartSessionOptions>,
        app: Option<&AppHandle>,
    ) -> Result<AudioSessionStatus, String> {
        let (in_devs, out_devs) = self.list_devices()?;

        let input_id = options
            .as_ref()
            .and_then(|o| o.input_device_id.clone())
            .or_else(|| in_devs.iter().find(|d| d.is_default).map(|d| d.id.clone()))
            .or_else(|| in_devs.first().map(|d| d.id.clone()));

        let output_id = options
            .as_ref()
            .and_then(|o| o.output_device_id.clone())
            .or_else(|| out_devs.iter().find(|d| d.is_default).map(|d| d.id.clone()))
            .or_else(|| out_devs.first().map(|d| d.id.clone()));

        let sample_rate = options
            .as_ref()
            .and_then(|o| o.sample_rate)
            .unwrap_or(16000);
        let aec_enabled = options.as_ref().and_then(|o| o.enable_aec).unwrap_or(true);

        self.is_running = true;
        self.active_input_id = input_id;
        self.active_output_id = output_id;
        self.sample_rate = sample_rate;
        self.aec_enabled = aec_enabled;
        self.input_level = 0.0;
        self.output_level = 0.0;

        let status = self.get_status();

        if let Some(app_handle) = app {
            let _ = app_handle.emit("audio://session_state", &status);
        }

        Ok(status)
    }

    pub fn stop_session(&mut self, app: Option<&AppHandle>) -> Result<AudioSessionStatus, String> {
        self.is_running = false;
        self.active_input_id = None;
        self.active_output_id = None;
        self.input_level = 0.0;
        self.output_level = 0.0;
        self._input_stream = None;
        self._output_stream = None;

        let status = self.get_status();

        if let Some(app_handle) = app {
            let _ = app_handle.emit("audio://session_state", &status);
        }

        Ok(status)
    }

    pub fn update_levels(&mut self, in_level: f32, out_level: f32) {
        self.input_level = in_level.clamp(0.0, 1.0);
        self.output_level = out_level.clamp(0.0, 1.0);
    }

    pub fn get_status(&self) -> AudioSessionStatus {
        AudioSessionStatus {
            is_running: self.is_running,
            active_input_device: self.active_input_id.clone(),
            active_output_device: self.active_output_id.clone(),
            sample_rate: self.sample_rate,
            aec_enabled: self.aec_enabled,
            input_level: self.input_level,
            output_level: self.output_level,
        }
    }
}
