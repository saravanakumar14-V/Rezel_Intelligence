use sysinfo::System;
use std::sync::Mutex;
use tauri::State;

pub struct SystemState {
    pub sys: Mutex<System>,
}

#[derive(serde::Serialize)]
pub struct SystemMetrics {
    pub cpu_usage: f32,
    pub total_memory: u64,
    pub used_memory: u64,
}

#[tauri::command]
pub fn get_system_info(state: State<'_, SystemState>) -> SystemMetrics {
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    
    // Average CPU usage across all cores
    let cpus = sys.cpus();
    let cpu_usage = if cpus.is_empty() {
        0.0
    } else {
        cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len() as f32
    };
    
    SystemMetrics {
        cpu_usage,
        total_memory: sys.total_memory(),
        used_memory: sys.used_memory(),
    }
}
