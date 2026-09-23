use crate::ipc::IpcState;
use log::{error, info};
use std::path::PathBuf;
use std::process::Command;
use tauri::State;
use uuid::Uuid;

fn find_blender_executable() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("REZEL_BLENDER_PATH") {
        let p = PathBuf::from(path);
        if p.exists() {
            return Ok(p);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Check dynamic Blender Foundation folders first
        let base_dir = PathBuf::from("C:\\Program Files\\Blender Foundation");
        if base_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&base_dir) {
                for entry in entries.flatten() {
                    let exe_path = entry.path().join("blender.exe");
                    if exe_path.exists() {
                        return Ok(exe_path);
                    }
                }
            }
        }

        // Known static heuristics for Windows
        let paths = [
            "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe",
            "C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe",
            "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
            "C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe",
            "C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe",
            "C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe",
        ];
        for p in paths.iter() {
            let path = PathBuf::from(p);
            if path.exists() {
                return Ok(path);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let path = PathBuf::from("/Applications/Blender.app/Contents/MacOS/Blender");
        if path.exists() {
            return Ok(path);
        }
    }

    #[cfg(target_os = "linux")]
    {
        let path = PathBuf::from("/usr/bin/blender");
        if path.exists() {
            return Ok(path);
        }
    }

    Err(
        "Blender executable not found. Please set REZEL_BLENDER_PATH environment variable."
            .to_string(),
    )
}

fn bootstrap_script_path(temp_dir: &std::path::Path, launch_id: &str) -> PathBuf {
    temp_dir.join(format!("rezel_blender_ipc_{}.py", launch_id))
}

#[tauri::command]
pub async fn launch_blender(state: State<'_, IpcState>, background: bool) -> Result<(), String> {
    let blender_exe = find_blender_executable()?;
    let token = state.auth_token.clone();
    let launch_id = Uuid::new_v4().to_string();

    let script_content = include_str!("../../resources/blender_ipc_client.py");
    let temp_dir = std::env::temp_dir();
    let script_path = bootstrap_script_path(&temp_dir, &launch_id);

    if let Err(e) = std::fs::write(&script_path, script_content) {
        return Err(format!("Failed to write bootstrap script: {}", e));
    }

    let mut cmd = Command::new(blender_exe);
    if background {
        cmd.arg("-b");
    }

    cmd.arg("--python")
        .arg(&script_path)
        .arg("--") // arguments to the script
        .arg(&token)
        .arg("127.0.0.1")
        .arg(&crate::ipc::IPC_PORT.to_string())
        .arg(&launch_id);

    info!("Launching Blender...");
    match cmd.spawn() {
        Ok(child) => {
            let process_id = child.id();
            state
                .activate_managed_blender(launch_id.clone(), process_id)
                .await;
            info!(
                "Blender launched with PID: {}, launch_id: {}, bootstrap: {:?}",
                process_id, launch_id, script_path
            );
            Ok(())
        }
        Err(e) => {
            error!("Failed to launch Blender: {}", e);
            Err(e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::bootstrap_script_path;
    use std::path::Path;

    #[test]
    fn bootstrap_path_is_unique_per_launch_id() {
        let temp = Path::new("C:/temp");
        assert_ne!(
            bootstrap_script_path(temp, "launch-a"),
            bootstrap_script_path(temp, "launch-b"),
        );
        assert!(bootstrap_script_path(temp, "launch-a")
            .to_string_lossy()
            .ends_with("rezel_blender_ipc_launch-a.py"));
    }
}
