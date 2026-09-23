#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{PhysicalPosition, PhysicalSize, Position, Size, State, WebviewWindow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_maximized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionWindowOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub anchor: Option<String>,
}

pub struct WindowStateManager {
    saved_bounds: Mutex<Option<WindowBounds>>,
    is_companion: Mutex<bool>,
}

impl WindowStateManager {
    pub fn new() -> Self {
        Self {
            saved_bounds: Mutex::new(None),
            is_companion: Mutex::new(false),
        }
    }
}

#[tauri::command]
pub fn window_get_bounds(
    window: WebviewWindow,
    state: State<'_, WindowStateManager>,
) -> Result<WindowBounds, String> {
    let is_maximized = window.is_maximized().unwrap_or(false);
    let pos = window
        .outer_position()
        .unwrap_or(PhysicalPosition::new(0, 0));
    let size = window.outer_size().unwrap_or(PhysicalSize::new(1280, 800));

    let current = WindowBounds {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        is_maximized,
    };

    let saved = state
        .saved_bounds
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    Ok(saved.unwrap_or(current))
}

#[tauri::command]
pub fn window_set_companion_mode(
    window: WebviewWindow,
    options: Option<CompanionWindowOptions>,
    state: State<'_, WindowStateManager>,
) -> Result<WindowBounds, String> {
    let mut is_companion_lock = state.is_companion.lock().map_err(|e| e.to_string())?;
    let mut saved_lock = state.saved_bounds.lock().map_err(|e| e.to_string())?;

    let is_max = window.is_maximized().unwrap_or(false);
    let current_pos = window
        .outer_position()
        .unwrap_or(PhysicalPosition::new(100, 100));
    let current_size = window.outer_size().unwrap_or(PhysicalSize::new(1280, 800));

    // 1. Save previous bounds if not already saved
    if !*is_companion_lock || saved_lock.is_none() {
        *saved_lock = Some(WindowBounds {
            x: current_pos.x,
            y: current_pos.y,
            width: current_size.width,
            height: current_size.height,
            is_maximized: is_max,
        });
    }

    // 2. Unmaximize only if currently maximized
    if is_max {
        let _ = window.unmaximize();
    }

    let target_w = options.as_ref().and_then(|o| o.width).unwrap_or(360);
    let target_h = options.as_ref().and_then(|o| o.height).unwrap_or(220);

    // Calculate monitor boundaries
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let (mon_x, mon_y, mon_w, mon_h) = if let Some(m) = monitor {
        let p = m.position();
        let s = m.size();
        (p.x, p.y, s.width, s.height)
    } else {
        (0, 0, 1920, 1080)
    };

    // Calculate bottom-right placement respecting margin
    let margin = 32i32;
    let target_x = mon_x + (mon_w as i32) - (target_w as i32) - margin;
    let target_y = mon_y + (mon_h as i32) - (target_h as i32) - margin - 40; // 40px taskbar allowance

    // 3. Apply window size & position in safe order
    let _ = window.set_size(Size::Physical(PhysicalSize::new(target_w, target_h)));
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(
        target_x, target_y,
    )));
    let _ = window.set_always_on_top(true);
    let _ = window.set_resizable(false);

    // 4. Ensure window is visible and unminimized (never minimize or hide)
    let _ = window.unminimize();
    let _ = window.show();

    *is_companion_lock = true;

    Ok(WindowBounds {
        x: target_x,
        y: target_y,
        width: target_w,
        height: target_h,
        is_maximized: false,
    })
}

#[tauri::command]
pub fn window_restore_full_mode(
    window: WebviewWindow,
    state: State<'_, WindowStateManager>,
) -> Result<WindowBounds, String> {
    let mut is_companion_lock = state.is_companion.lock().map_err(|e| e.to_string())?;
    let mut saved_lock = state.saved_bounds.lock().map_err(|e| e.to_string())?;

    let default_bounds = WindowBounds {
        x: 100,
        y: 100,
        width: 1280,
        height: 800,
        is_maximized: false,
    };

    let bounds = saved_lock.take().unwrap_or(default_bounds);

    let _ = window.set_always_on_top(false);
    let _ = window.set_resizable(true);
    let _ = window.set_size(Size::Physical(PhysicalSize::new(
        bounds.width,
        bounds.height,
    )));
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(
        bounds.x, bounds.y,
    )));

    if bounds.is_maximized {
        let _ = window.maximize();
    }

    let _ = window.set_focus();

    *is_companion_lock = false;

    Ok(bounds)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WindowActivationRequest {
    pub handle: Option<u64>,
    pub window_id: Option<String>,
    pub process_id: Option<u32>,
    pub title_match: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowActivationResponse {
    pub success: bool,
    pub is_focused: bool,
    pub handle: u64,
    pub title: String,
    pub process_id: u32,
    pub message: Option<String>,
}

#[cfg(target_os = "windows")]
mod win32_activation {
    use super::*;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, EnumWindows, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, SetForegroundWindow, ShowWindowAsync,
        SW_RESTORE, SW_SHOW,
    };
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};

    struct FindWindowState {
        target_handle: Option<u64>,
        target_pid: Option<u32>,
        title_match: Option<String>,
        matched_hwnd: Option<HWND>,
        matched_title: String,
        matched_pid: u32,
    }

    unsafe extern "system" fn enum_find_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam as *mut FindWindowState);

        let handle_val = hwnd as usize as u64;
        if let Some(target_h) = state.target_handle {
            if handle_val == target_h {
                state.matched_hwnd = Some(hwnd);
                state.matched_title = get_title(hwnd);
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, &mut pid);
                state.matched_pid = pid;
                return 0; // Stop enumeration
            }
        }

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);

        if let Some(target_pid) = state.target_pid {
            if pid == target_pid {
                state.matched_hwnd = Some(hwnd);
                state.matched_title = get_title(hwnd);
                state.matched_pid = pid;
                return 0;
            }
        }

        let title = get_title(hwnd);
        if let Some(title_query) = &state.title_match {
            if !title.is_empty() && title.to_lowercase().contains(&title_query.to_lowercase()) {
                state.matched_hwnd = Some(hwnd);
                state.matched_title = title;
                state.matched_pid = pid;
                return 0;
            }
        }

        1
    }

    fn get_title(hwnd: HWND) -> String {
        unsafe {
            let len = GetWindowTextLengthW(hwnd);
            if len == 0 {
                return String::new();
            }
            let mut buf = vec![0u16; (len + 1) as usize];
            let read = GetWindowTextW(hwnd, buf.as_mut_ptr(), len + 1);
            if read > 0 {
                String::from_utf16_lossy(&buf[..read as usize])
            } else {
                String::new()
            }
        }
    }

    pub fn activate(req: WindowActivationRequest) -> Result<WindowActivationResponse, String> {
        let target_handle = if let Some(h) = req.handle {
            Some(h)
        } else if let Some(ref win_id) = req.window_id {
            if let Some(hex_str) = win_id.strip_prefix("win_hwnd_") {
                usize::from_str_radix(hex_str, 16).ok().map(|u| u as u64)
            } else {
                None
            }
        } else {
            None
        };

        unsafe {
            let mut find_state = FindWindowState {
                target_handle,
                target_pid: req.process_id,
                title_match: req.title_match,
                matched_hwnd: None,
                matched_title: String::new(),
                matched_pid: 0,
            };

            if let Some(h) = target_handle {
                let hwnd = h as usize as HWND;
                if windows_sys::Win32::UI::WindowsAndMessaging::IsWindow(hwnd) != 0 {
                    find_state.matched_hwnd = Some(hwnd);
                    find_state.matched_title = get_title(hwnd);
                    let mut pid = 0u32;
                    GetWindowThreadProcessId(hwnd, &mut pid);
                    find_state.matched_pid = pid;
                }
            }

            if find_state.matched_hwnd.is_none() {
                EnumWindows(
                    Some(enum_find_callback),
                    &mut find_state as *mut FindWindowState as LPARAM,
                );
            }

            let hwnd = match find_state.matched_hwnd {
                Some(h) => h,
                None => {
                    return Ok(WindowActivationResponse {
                        success: false,
                        is_focused: false,
                        handle: 0,
                        title: String::new(),
                        process_id: 0,
                        message: Some("Target window could not be found".to_string()),
                    });
                }
            };

            // 1. If iconic/minimized, restore
            if IsIconic(hwnd) != 0 {
                ShowWindowAsync(hwnd, SW_RESTORE);
            } else {
                ShowWindowAsync(hwnd, SW_SHOW);
            }

            // 2. Attach thread input to overcome Windows foreground restriction
            let cur_thread = GetCurrentThreadId();
            let mut target_pid = 0u32;
            let target_thread = GetWindowThreadProcessId(hwnd, &mut target_pid);

            let attached = if cur_thread != target_thread {
                AttachThreadInput(cur_thread, target_thread, 1) != 0
            } else {
                false
            };

            // 3. Bring to top and set foreground
            BringWindowToTop(hwnd);
            let set_fg = SetForegroundWindow(hwnd) != 0;

            // Detach thread if attached
            if attached {
                AttachThreadInput(cur_thread, target_thread, 0);
            }

            // 4. Verify foreground
            let mut attempts = 0;
            let mut is_focused = false;
            while attempts < 5 {
                let current_fg = GetForegroundWindow();
                if current_fg == hwnd {
                    is_focused = true;
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(30));
                attempts += 1;
            }

            Ok(WindowActivationResponse {
                success: set_fg || is_focused,
                is_focused,
                handle: hwnd as usize as u64,
                title: find_state.matched_title,
                process_id: find_state.matched_pid,
                message: if is_focused {
                    Some("Window focused successfully".to_string())
                } else {
                    Some("Window activation dispatched, focus pending".to_string())
                },
            })
        }
    }
}

#[tauri::command]
pub async fn window_activate(
    request: WindowActivationRequest,
) -> Result<WindowActivationResponse, String> {
    #[cfg(target_os = "windows")]
    {
        win32_activation::activate(request)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Window activation is only supported on Windows".to_string())
    }
}
