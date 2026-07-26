mod commands;

use std::sync::Mutex;
use sysinfo::System;
use commands::system::SystemState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(SystemState {
        sys: Mutex::new(System::new_all()),
    })
    .invoke_handler(tauri::generate_handler![
        commands::system::get_system_info,
        commands::secrets::save_api_key,
        commands::secrets::get_api_key,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
