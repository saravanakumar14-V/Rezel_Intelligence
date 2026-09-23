mod audio;
mod commands;
mod ipc;
use audio::AudioState;
use commands::fs_provider::{FilesystemScope, FsScopeState};
use commands::system::SystemState;
use std::sync::Mutex;
use sysinfo::System;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let auth_token = uuid::Uuid::new_v4().to_string();
    let ipc_state = ipc::IpcState::new(auth_token.clone());
    let ipc_state_clone = ipc_state.clone();
    let audio_state = AudioState::new();
    let window_state = commands::window::WindowStateManager::new();

    tauri::Builder::default()
        .manage(ipc_state)
        .manage(audio_state)
        .manage(window_state)
        .manage(SystemState {
            sys: Mutex::new(System::new_all()),
        })
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let app_handle = app.handle().clone();

            // Initialize FsScopeState
            let app_data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");

            // Initialize rezel_data directory and default config.json for first launch
            let rezel_data_dir = app_data_dir.join("rezel_data");
            std::fs::create_dir_all(&rezel_data_dir).expect("Failed to create rezel_data dir");
            let config_path = rezel_data_dir.join("config.json");
            if !config_path.exists() {
                let default_config = serde_json::json!({
                    "version": "0.1.0",
                    "initialized": true
                });
                let _ = std::fs::write(
                    &config_path,
                    serde_json::to_string_pretty(&default_config).unwrap(),
                );
                log::info!(
                    "[Config] Initialized default configuration at {:?}",
                    config_path
                );
            }

            let test_dir = std::env::temp_dir().join("rezel_tests");
            std::fs::create_dir_all(&test_dir).expect("Failed to create test dir");

            let fs_scope = FilesystemScope {
                allowed_roots: vec![app_data_dir.clone(), test_dir],
                read_allowed: true,
                write_allowed: true,
                delete_allowed: true,
            };
            app_handle.manage(FsScopeState::new(fs_scope));

            // Save the token to disk for the CEP extension to read
            let token_path = app_data_dir.join("ipc_token.txt");
            std::fs::write(&token_path, &auth_token).expect("Failed to write IPC token");
            log::info!("[IPC] Wrote secure token to {:?}", token_path);

            tauri::async_runtime::spawn(async move {
                ipc::start_ipc_server(ipc_state_clone, ipc::IPC_PORT, app_handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_info,
            commands::secrets::save_api_key,
            commands::secrets::get_api_key,
            commands::secrets::delete_api_key,
            commands::secrets::save_search_key,
            commands::secrets::get_search_key,
            commands::secrets::delete_search_key,
            commands::shell::run_system_command,
            commands::files::read_app_file,
            commands::files::write_app_file,
            commands::net::web_search,
            commands::net::get_weather,
            ipc::send_ipc_command,
            commands::fs_provider::fs_list,
            commands::fs_provider::fs_stat,
            commands::fs_provider::fs_read_text,
            commands::fs_provider::fs_create_folder,
            commands::fs_provider::fs_create_file,
            commands::fs_provider::fs_copy,
            commands::fs_provider::fs_move,
            commands::fs_provider::fs_delete,
            commands::fs_provider::fs_search,
            commands::fs_provider::fs_get_scope,
            commands::fs_provider::fs_set_project_root,
            commands::blender::launch_blender,
            audio::audio_list_devices,
            audio::audio_start_session,
            audio::audio_stop_session,
            audio::audio_get_status,
            audio::native_vad_process_frame,
            audio::native_vad_set_config,
            audio::native_tts_speak,
            audio::native_tts_cancel,
            audio::native_stt_start,
            audio::native_stt_stop,
            audio::native_stt_abort,
            audio::native_stt_feed_transcript,
            audio::audio_get_processing_metadata,
            audio::audio_run_aec_benchmark,
            commands::window::window_get_bounds,
            commands::window::window_set_companion_mode,
            commands::window::window_restore_full_mode,
            commands::window::window_activate,
            commands::screen::capture_screen,
            commands::input::computer_action,
            commands::input::clipboard_read,
            commands::input::clipboard_write,
            commands::ui::inspect_windows_ui,
            commands::ui::uia_perform_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
