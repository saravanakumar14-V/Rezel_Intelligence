use log::info;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

// --- Scope & Security ---

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FilesystemScope {
    pub allowed_roots: Vec<PathBuf>,
    pub read_allowed: bool,
    pub write_allowed: bool,
    pub delete_allowed: bool,
}

pub struct FsScopeState {
    pub scope: Mutex<FilesystemScope>,
}

impl FsScopeState {
    pub fn new(scope: FilesystemScope) -> Self {
        Self {
            scope: Mutex::new(scope),
        }
    }
}

/// Represents the access required for an operation.
pub enum AccessType {
    Read,
    Write,
    Delete,
}

/// Resolves, canonicalizes, and verifies that a path is within the allowed roots
/// and has the required permissions.
///
/// 1. Converts to absolute/canonical path (resolving symlinks if it exists).
/// 2. Checks against `allowed_roots` using path-component awareness.
/// 3. Validates access permissions.
fn resolve_and_authorize(
    app: &tauri::AppHandle,
    raw_path: &str,
    access: AccessType,
) -> Result<PathBuf, String> {
    if raw_path.is_empty() {
        return Err("Path cannot be empty.".into());
    }

    let state = app.state::<FsScopeState>();
    let scope = state
        .scope
        .lock()
        .map_err(|_| "Failed to lock scope state")?;

    match access {
        AccessType::Read => {
            if !scope.read_allowed {
                return Err("Read access denied by policy.".into());
            }
        }
        AccessType::Write => {
            if !scope.write_allowed {
                return Err("Write access denied by policy.".into());
            }
        }
        AccessType::Delete => {
            if !scope.delete_allowed {
                return Err("Delete access denied by policy.".into());
            }
        }
    }

    let path_obj = Path::new(raw_path);

    // Canonicalize if exists, otherwise normalize parent and append filename
    let canonical_target = if path_obj.exists() {
        path_obj
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize path: {}", e))?
    } else {
        // If it doesn't exist, we must canonicalize its parent to ensure the parent is within scope
        // and doesn't contain malicious symlinks, then append the file name.
        let parent = path_obj.parent().unwrap_or(Path::new("."));
        let file_name = path_obj.file_name().ok_or("Invalid filename")?;

        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize parent path: {}", e))?;
        canonical_parent.join(file_name)
    };

    // Verify containment (component-aware prefix check)
    let mut is_allowed = false;
    for root in &scope.allowed_roots {
        let canonical_root = root.canonicalize().unwrap_or_else(|_| root.clone());
        if canonical_target.starts_with(&canonical_root) {
            is_allowed = true;
            break;
        }
    }

    if !is_allowed {
        return Err(format!(
            "[Rezel Security] Access denied: Target '{}' escapes authorized filesystem scope.",
            raw_path
        ));
    }

    Ok(canonical_target)
}

// --- Commands ---

#[derive(Serialize)]
pub struct StatResult {
    is_file: bool,
    is_dir: bool,
    size: u64,
    modified: u64,
}

#[tauri::command]
pub fn fs_stat(app: tauri::AppHandle, path: String) -> Result<StatResult, String> {
    let target = resolve_and_authorize(&app, &path, AccessType::Read)?;

    let metadata = fs::metadata(&target).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(StatResult {
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        modified,
    })
}

#[derive(Serialize)]
pub struct ListEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
pub fn fs_list(app: tauri::AppHandle, path: String) -> Result<Vec<ListEntry>, String> {
    let target = resolve_and_authorize(&app, &path, AccessType::Read)?;

    let mut entries = Vec::new();
    let dir = fs::read_dir(&target).map_err(|e| e.to_string())?;

    for entry in dir {
        if let Ok(entry) = entry {
            let file_name = entry.file_name().to_string_lossy().into_owned();
            let file_path = entry.path().to_string_lossy().into_owned();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

            entries.push(ListEntry {
                name: file_name,
                path: file_path,
                is_dir,
            });
        }
    }

    Ok(entries)
}

#[tauri::command]
pub fn fs_read_text(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let target = resolve_and_authorize(&app, &path, AccessType::Read)?;
    fs::read_to_string(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_create_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = resolve_and_authorize(&app, &path, AccessType::Write)?;
    fs::create_dir_all(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_create_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = resolve_and_authorize(&app, &path, AccessType::Write)?;
    if target.exists() {
        return Err("File already exists. Overwriting is not permitted.".into());
    }
    fs::write(&target, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_copy(app: tauri::AppHandle, source: String, destination: String) -> Result<(), String> {
    let src_target = resolve_and_authorize(&app, &source, AccessType::Read)?;
    let dest_target = resolve_and_authorize(&app, &destination, AccessType::Write)?;

    fs::copy(&src_target, &dest_target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn fs_move(app: tauri::AppHandle, source: String, destination: String) -> Result<(), String> {
    let src_target = resolve_and_authorize(&app, &source, AccessType::Write)?; // moving requires write on source
    let dest_target = resolve_and_authorize(&app, &destination, AccessType::Write)?;

    fs::rename(&src_target, &dest_target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_delete(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = resolve_and_authorize(&app, &path, AccessType::Delete)?;

    let metadata = fs::metadata(&target).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        return Err("Deleting directories is not supported in this capability.".into());
    }

    fs::remove_file(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_search(
    app: tauri::AppHandle,
    path: String,
    pattern: String,
    max_results: Option<usize>,
    max_depth: Option<usize>,
) -> Result<Vec<ListEntry>, String> {
    let target = resolve_and_authorize(&app, &path, AccessType::Read)?;

    let max_res = max_results.unwrap_or(100);
    let max_d = max_depth.unwrap_or(5);

    let mut results = Vec::new();
    let search_pattern = pattern.to_lowercase();

    fn search_recursive(
        app: &tauri::AppHandle,
        dir: &Path,
        pattern: &str,
        results: &mut Vec<ListEntry>,
        current_depth: usize,
        max_depth: usize,
        max_results: usize,
    ) -> Result<(), String> {
        if current_depth > max_depth || results.len() >= max_results {
            return Ok(());
        }

        let entries = match fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return Ok(()), // skip inaccessible
        };

        for entry in entries.flatten() {
            if results.len() >= max_results {
                break;
            }

            let file_name = entry.file_name().to_string_lossy().into_owned();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

            if file_name.to_lowercase().contains(pattern) {
                let file_path = entry.path().to_string_lossy().into_owned();

                // Double check symlink escape if we add it to results
                if let Ok(target) = resolve_and_authorize(app, &file_path, AccessType::Read) {
                    results.push(ListEntry {
                        name: file_name.clone(),
                        path: target.to_string_lossy().into_owned(),
                        is_dir,
                    });
                }
            }

            if is_dir {
                // Must ensure symlink doesn't escape before recursing
                let file_path = entry.path().to_string_lossy().into_owned();
                if let Ok(safe_target) = resolve_and_authorize(app, &file_path, AccessType::Read) {
                    let _ = search_recursive(
                        app,
                        &safe_target,
                        pattern,
                        results,
                        current_depth + 1,
                        max_depth,
                        max_results,
                    );
                }
            }
        }
        Ok(())
    }

    search_recursive(
        &app,
        &target,
        &search_pattern,
        &mut results,
        0,
        max_d,
        max_res,
    )?;

    Ok(results)
}

#[tauri::command]
pub fn fs_get_scope(app: tauri::AppHandle) -> Result<FilesystemScope, String> {
    let state = app.state::<FsScopeState>();
    let scope = state
        .scope
        .lock()
        .map_err(|_| "Failed to lock scope state")?;
    Ok(scope.clone())
}

#[tauri::command]
pub fn fs_set_project_root(app: tauri::AppHandle, root_path: Option<String>) -> Result<(), String> {
    let state = app.state::<FsScopeState>();
    let mut scope = state
        .scope
        .lock()
        .map_err(|_| "Failed to lock scope state")?;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let test_dir = std::env::temp_dir().join("rezel_tests");

    let mut roots = vec![app_data_dir, test_dir];
    if let Some(p) = root_path {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            let path_obj = PathBuf::from(trimmed);
            if path_obj.exists() {
                if let Ok(canonical) = path_obj.canonicalize() {
                    roots.push(canonical);
                } else {
                    roots.push(path_obj);
                }
            } else {
                roots.push(path_obj);
            }
        }
    }

    scope.allowed_roots = roots;
    info!(
        "[fs_provider] Updated allowed_roots: {:?}",
        scope.allowed_roots
    );
    Ok(())
}
