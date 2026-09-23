use log::info;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Resolves and validates a relative path within the app data directory.
///
/// Security:
///  - Rejects absolute paths
///  - Rejects path traversal (`..`)
///  - Rejects paths starting with `/` or `\`
///  - Restricts all I/O to `{app_data_dir}/rezel_data/`
fn resolve_safe_path(app: &tauri::AppHandle, relative: &str) -> Result<PathBuf, String> {
    // Reject empty paths
    if relative.is_empty() {
        return Err("Path cannot be empty.".into());
    }

    let path_obj = Path::new(relative);
    if path_obj.is_absolute() || relative.contains("..") {
        return Err(format!(
            "[Rezel] Path '{}' rejected: absolute paths and '..' traversal are not allowed.",
            relative
        ));
    }

    let normalized = relative.replace('\\', "/");

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    let sandbox = data_dir.join("rezel_data");
    let target = sandbox.join(&normalized);

    // Canonicalize the sandbox dir (create if needed)
    if !sandbox.exists() {
        fs::create_dir_all(&sandbox)
            .map_err(|e| format!("Failed to create sandbox directory: {}", e))?;
    }

    let canonical_sandbox = sandbox
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize sandbox: {}", e))?;

    // For new files, canonicalize the parent and verify it's within the sandbox
    let parent = target.parent().unwrap_or(Path::new("."));
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize parent: {}", e))?;

    if !canonical_parent.starts_with(&canonical_sandbox) {
        return Err(format!(
            "[Rezel] Path '{}' escapes the sandbox directory.",
            relative
        ));
    }

    // If target already exists, verify its canonical path is also in the sandbox (prevents symlink bypass)
    if target.exists() {
        let canonical_target = target
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize target: {}", e))?;
        if !canonical_target.starts_with(&canonical_sandbox) {
            return Err(format!(
                "[Rezel] Target '{}' escapes the sandbox directory via symlink.",
                relative
            ));
        }
    }

    Ok(target)
}

/// read_app_file
///
/// Reads a UTF-8 text file from the Rezel app data sandbox.
///
/// Returns the file contents as a string, or an error if:
///  - The path fails validation
///  - The file does not exist
///  - The file is not valid UTF-8
#[tauri::command]
pub fn read_app_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let target = resolve_safe_path(&app, &path)?;

    info!("[files] read: {}", target.display());

    fs::read_to_string(&target).map_err(|e| format!("Failed to read '{}': {}", path, e))
}

/// write_app_file
///
/// Writes UTF-8 text content to a file in the Rezel app data sandbox.
/// Uses atomic write pattern: write to `.tmp` → rename to final path.
///
/// Creates parent directories automatically.
/// Overwrites existing files.
#[tauri::command]
pub fn write_app_file(app: tauri::AppHandle, path: String, content: String) -> Result<(), String> {
    let target = resolve_safe_path(&app, &path)?;

    info!(
        "[files] write: {} ({} bytes)",
        target.display(),
        content.len()
    );

    // Atomic write: temp file → rename
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let tmp_path = PathBuf::from(format!("{}.{}.tmp", target.display(), timestamp));

    fs::write(&tmp_path, &content)
        .map_err(|e| format!("Failed to write temp file for '{}': {}", path, e))?;

    fs::rename(&tmp_path, &target).map_err(|e| {
        // Clean up temp file on rename failure
        if let Err(cleanup_err) = fs::remove_file(&tmp_path) {
            log::error!(
                "Failed to clean up temp file {}: {}",
                tmp_path.display(),
                cleanup_err
            );
        }
        format!("Failed to finalize write for '{}': {}", path, e)
    })
}
