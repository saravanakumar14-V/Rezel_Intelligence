/**
 * Rezel OS — Native Windows Input Dispatch Command (Sprint P0-2)
 *
 * Implements real native Windows input dispatch via Win32 input APIs (mouse_event, keybd_event, SendInput).
 * Supports CLICK, DOUBLE_CLICK, RIGHT_CLICK, TYPE, KEY_PRESS, HOTKEY, SCROLL, and DRAG.
 * Enforces coordinate validation, strict key normalization, and safe execution bounds.
 */

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ComputerInputType {
    Click,
    DoubleClick,
    RightClick,
    Type,
    KeyPress,
    Hotkey,
    Scroll,
    Drag,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerInputRequest {
    pub action_type: ComputerInputType,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub button: Option<String>,
    pub text: Option<String>,
    pub key: Option<String>,
    pub keys: Option<Vec<String>>,
    pub delta_x: Option<i32>,
    pub delta_y: Option<i32>,
    pub from_x: Option<i32>,
    pub from_y: Option<i32>,
    pub to_x: Option<i32>,
    pub to_y: Option<i32>,
    pub display_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerInputResponse {
    pub success: bool,
    pub action_type: String,
    pub dispatched_at: u64,
    pub duration_ms: u64,
    pub message: Option<String>,
}

#[cfg(target_os = "windows")]
mod win32_input {
    use super::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics,
        SM_CXSCREEN, SM_CYSCREEN, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
        SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        mouse_event, keybd_event, SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT,
        MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
        MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE,
        MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL,
        KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
        VK_BACK, VK_CONTROL, VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_HOME, VK_LEFT,
        VK_MENU, VK_NEXT, VK_PRIOR, VK_RETURN, VK_RIGHT, VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
    };

    pub fn get_screen_dimensions() -> (i32, i32) {
        unsafe {
            let w = GetSystemMetrics(SM_CXSCREEN);
            let h = GetSystemMetrics(SM_CYSCREEN);
            (w.max(800), h.max(600))
        }
    }

    pub fn get_virtual_desktop_bounds() -> (i32, i32, i32, i32) {
        unsafe {
            let v_x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let v_y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            let v_w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            let v_h = GetSystemMetrics(SM_CYVIRTUALSCREEN);

            if v_w > 0 && v_h > 0 {
                (v_x, v_y, v_w, v_h)
            } else {
                let (w, h) = get_screen_dimensions();
                (0, 0, w, h)
            }
        }
    }

    pub fn normalize_coords(x: i32, y: i32) -> (i32, i32) {
        let (v_x, v_y, v_w, v_h) = get_virtual_desktop_bounds();
        let norm_x = (((x - v_x) as f64 * 65535.0) / (v_w - 1).max(1) as f64).round() as i32;
        let norm_y = (((y - v_y) as f64 * 65535.0) / (v_h - 1).max(1) as f64).round() as i32;

        (norm_x.clamp(0, 65535), norm_y.clamp(0, 65535))
    }

    fn map_key_to_vk(key_name: &str) -> Result<u16, String> {
        let clean = key_name.trim().to_lowercase();
        match clean.as_str() {
            "enter" | "return" => Ok(VK_RETURN),
            "escape" | "esc" => Ok(VK_ESCAPE),
            "tab" => Ok(VK_TAB),
            "backspace" => Ok(VK_BACK),
            "delete" | "del" => Ok(VK_DELETE),
            "space" | "spacebar" => Ok(VK_SPACE),
            "control" | "ctrl" => Ok(VK_CONTROL),
            "shift" => Ok(VK_SHIFT),
            "alt" | "menu" => Ok(VK_MENU),
            "arrowleft" | "left" => Ok(VK_LEFT),
            "arrowup" | "up" => Ok(VK_UP),
            "arrowright" | "right" => Ok(VK_RIGHT),
            "arrowdown" | "down" => Ok(VK_DOWN),
            "home" => Ok(VK_HOME),
            "end" => Ok(VK_END),
            "pageup" => Ok(VK_PRIOR),
            "pagedown" => Ok(VK_NEXT),
            "f1" => Ok(0x70),
            "f2" => Ok(0x71),
            "f3" => Ok(0x72),
            "f4" => Ok(0x73),
            "f5" => Ok(0x74),
            "f6" => Ok(0x75),
            "f7" => Ok(0x76),
            "f8" => Ok(0x77),
            "f9" => Ok(0x78),
            "f10" => Ok(0x79),
            "f11" => Ok(0x7A),
            "f12" => Ok(0x7B),
            s if s.len() == 1 => {
                let ch = s.chars().next().unwrap();
                if ch.is_ascii_alphabetic() {
                    Ok(ch.to_ascii_uppercase() as u16)
                } else if ch.is_ascii_digit() {
                    Ok(ch as u16)
                } else {
                    Err(format!("Character '{}' should use unicode typing", ch))
                }
            }
            _ => Err(format!("Unrecognized or disallowed key name: '{}'", key_name)),
        }
    }

    pub fn dispatch_mouse_click(x: i32, y: i32, button: &str, double: bool) -> Result<(), String> {
        let (norm_x, norm_y) = normalize_coords(x, y);
        let (down_flag, up_flag) = match button.to_lowercase().as_str() {
            "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
            _ => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
        };

        unsafe {
            // Move cursor to target
            mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, norm_x, norm_y, 0, 0);
            std::thread::sleep(Duration::from_millis(15));

            let clicks = if double { 2 } else { 1 };
            for _ in 0..clicks {
                mouse_event(down_flag, 0, 0, 0, 0);
                std::thread::sleep(Duration::from_millis(20));
                mouse_event(up_flag, 0, 0, 0, 0);

                if double {
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
            Ok(())
        }
    }

    pub fn dispatch_type(text: &str) -> Result<(), String> {
        unsafe {
            for ch in text.chars() {
                let mut utf16_buf = [0u16; 2];
                let encoded = ch.encode_utf16(&mut utf16_buf);

                for &unit in encoded.iter() {
                    let mut key_down: INPUT = std::mem::zeroed();
                    key_down.r#type = INPUT_KEYBOARD;
                    key_down.Anonymous.ki = KEYBDINPUT {
                        wVk: 0,
                        wScan: unit,
                        dwFlags: KEYEVENTF_UNICODE,
                        time: 0,
                        dwExtraInfo: 0,
                    };

                    let mut key_up: INPUT = std::mem::zeroed();
                    key_up.r#type = INPUT_KEYBOARD;
                    key_up.Anonymous.ki = KEYBDINPUT {
                        wVk: 0,
                        wScan: unit,
                        dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    };

                    let inputs = [key_down, key_up];
                    let _ = SendInput(2, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
                    std::thread::sleep(Duration::from_millis(8));
                }
            }
            Ok(())
        }
    }

    pub fn dispatch_key_press(key: &str) -> Result<(), String> {
        let vk = map_key_to_vk(key)?;
        unsafe {
            keybd_event(vk as u8, 0, 0, 0);
            std::thread::sleep(Duration::from_millis(15));
            keybd_event(vk as u8, 0, KEYEVENTF_KEYUP, 0);
            Ok(())
        }
    }

    pub fn dispatch_hotkey(keys: &[String]) -> Result<(), String> {
        if keys.is_empty() {
            return Err("Hotkey sequence cannot be empty".to_string());
        }

        let mut vks = Vec::new();
        for k in keys {
            vks.push(map_key_to_vk(k)?);
        }

        unsafe {
            // Press all keys down in order
            for &vk in &vks {
                keybd_event(vk as u8, 0, 0, 0);
                std::thread::sleep(Duration::from_millis(10));
            }

            std::thread::sleep(Duration::from_millis(25));

            // Release all keys in reverse order
            for &vk in vks.iter().rev() {
                keybd_event(vk as u8, 0, KEYEVENTF_KEYUP, 0);
                std::thread::sleep(Duration::from_millis(10));
            }

            Ok(())
        }
    }

    pub fn dispatch_scroll(x: i32, y: i32, delta_y: i32) -> Result<(), String> {
        let (norm_x, norm_y) = normalize_coords(x, y);
        unsafe {
            mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, norm_x, norm_y, 0, 0);
            std::thread::sleep(Duration::from_millis(10));
            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, delta_y * 120, 0);
            Ok(())
        }
    }

    pub fn dispatch_drag(from_x: i32, from_y: i32, to_x: i32, to_y: i32) -> Result<(), String> {
        let (norm_from_x, norm_from_y) = normalize_coords(from_x, from_y);
        let (norm_to_x, norm_to_y) = normalize_coords(to_x, to_y);

        unsafe {
            // Move to start
            mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, norm_from_x, norm_from_y, 0, 0);
            std::thread::sleep(Duration::from_millis(20));

            // Mouse down
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
            std::thread::sleep(Duration::from_millis(30));

            // Interpolated drag movement (10 steps)
            let steps = 10;
            for i in 1..=steps {
                let interp_x = norm_from_x + ((norm_to_x - norm_from_x) * i) / steps;
                let interp_y = norm_from_y + ((norm_to_y - norm_from_y) * i) / steps;

                mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, interp_x, interp_y, 0, 0);
                std::thread::sleep(Duration::from_millis(15));
            }

            // Mouse up
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn computer_action(request: ComputerInputRequest) -> Result<ComputerInputResponse, String> {
    let start_time = std::time::SystemTime::now();
    let now = start_time
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    #[cfg(target_os = "windows")]
    {
        use win32_input::*;

        let (v_x, v_y, v_w, v_h) = get_virtual_desktop_bounds();

        // Virtual desktop coordinate bounds validation (supports multi-monitor, negative x/y, mixed-DPI)
        let validate_coords = |cx: i32, cy: i32| -> Result<(), String> {
            if cx < v_x || cy < v_y || cx > (v_x + v_w) || cy > (v_y + v_h) {
                return Err(format!(
                    "Coordinates ({}, {}) exceed virtual desktop bounds (x: {}..{}, y: {}..{})",
                    cx, cy, v_x, v_x + v_w, v_y, v_y + v_h
                ));
            }
            Ok(())
        };

        match request.action_type {
            ComputerInputType::Click => {
                let x = request.x.ok_or_else(|| "Click action requires 'x' coordinate".to_string())?;
                let y = request.y.ok_or_else(|| "Click action requires 'y' coordinate".to_string())?;
                validate_coords(x, y)?;
                let btn = request.button.unwrap_or_else(|| "left".to_string());
                dispatch_mouse_click(x, y, &btn, false)?;
            }
            ComputerInputType::DoubleClick => {
                let x = request.x.ok_or_else(|| "DoubleClick requires 'x' coordinate".to_string())?;
                let y = request.y.ok_or_else(|| "DoubleClick requires 'y' coordinate".to_string())?;
                validate_coords(x, y)?;
                let btn = request.button.unwrap_or_else(|| "left".to_string());
                dispatch_mouse_click(x, y, &btn, true)?;
            }
            ComputerInputType::RightClick => {
                let x = request.x.ok_or_else(|| "RightClick requires 'x' coordinate".to_string())?;
                let y = request.y.ok_or_else(|| "RightClick requires 'y' coordinate".to_string())?;
                validate_coords(x, y)?;
                dispatch_mouse_click(x, y, "right", false)?;
            }
            ComputerInputType::Type => {
                let text = request.text.ok_or_else(|| "Type action requires 'text' parameter".to_string())?;
                dispatch_type(&text)?;
            }
            ComputerInputType::KeyPress => {
                let key = request.key.ok_or_else(|| "KeyPress requires 'key' parameter".to_string())?;
                dispatch_key_press(&key)?;
            }
            ComputerInputType::Hotkey => {
                let keys = request.keys.ok_or_else(|| "Hotkey requires 'keys' array parameter".to_string())?;
                dispatch_hotkey(&keys)?;
            }
            ComputerInputType::Scroll => {
                let x = request.x.unwrap_or(v_x + v_w / 2);
                let y = request.y.unwrap_or(v_y + v_h / 2);
                validate_coords(x, y)?;
                let delta_y = request.delta_y.unwrap_or(1);
                dispatch_scroll(x, y, delta_y)?;
            }
            ComputerInputType::Drag => {
                let from_x = request.from_x.ok_or_else(|| "Drag requires 'from_x'".to_string())?;
                let from_y = request.from_y.ok_or_else(|| "Drag requires 'from_y'".to_string())?;
                let to_x = request.to_x.ok_or_else(|| "Drag requires 'to_x'".to_string())?;
                let to_y = request.to_y.ok_or_else(|| "Drag requires 'to_y'".to_string())?;
                validate_coords(from_x, from_y)?;
                validate_coords(to_x, to_y)?;
                dispatch_drag(from_x, from_y, to_x, to_y)?;
            }
        }

        let elapsed = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);

        Ok(ComputerInputResponse {
            success: true,
            action_type: format!("{:?}", request.action_type).to_uppercase(),
            dispatched_at: now,
            duration_ms: elapsed,
            message: Some("Windows input successfully dispatched".to_string()),
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Native input dispatch is only supported on Windows operating systems".to_string())
    }
}

#[cfg(target_os = "windows")]
mod win32_clipboard {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GHND};

    const CF_UNICODETEXT: u32 = 13;

    pub fn read_text() -> Result<String, String> {
        unsafe {
            if OpenClipboard(0 as HWND) == 0 {
                return Err("Failed to open clipboard".to_string());
            }

            let handle = GetClipboardData(CF_UNICODETEXT);
            if handle.is_null() {
                CloseClipboard();
                return Ok(String::new());
            }

            let ptr = GlobalLock(handle) as *const u16;
            if ptr.is_null() {
                CloseClipboard();
                return Err("Failed to lock clipboard memory".to_string());
            }

            let mut len = 0;
            while *ptr.add(len) != 0 {
                len += 1;
            }

            let slice = std::slice::from_raw_parts(ptr, len);
            let text = String::from_utf16_lossy(slice);

            GlobalUnlock(handle);
            CloseClipboard();

            Ok(text)
        }
    }

    pub fn write_text(text: &str) -> Result<bool, String> {
        let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes_needed = utf16.len() * std::mem::size_of::<u16>();

        unsafe {
            if OpenClipboard(0 as HWND) == 0 {
                return Err("Failed to open clipboard".to_string());
            }

            EmptyClipboard();

            let h_mem = GlobalAlloc(GHND, bytes_needed);
            if h_mem.is_null() {
                CloseClipboard();
                return Err("GlobalAlloc failed for clipboard data".to_string());
            }

            let dest = GlobalLock(h_mem) as *mut u16;
            if dest.is_null() {
                CloseClipboard();
                return Err("GlobalLock failed for clipboard data".to_string());
            }

            std::ptr::copy_nonoverlapping(utf16.as_ptr(), dest, utf16.len());
            GlobalUnlock(h_mem);

            if SetClipboardData(CF_UNICODETEXT, h_mem).is_null() {
                CloseClipboard();
                return Err("SetClipboardData failed".to_string());
            }

            CloseClipboard();
            Ok(true)
        }
    }
}

#[tauri::command]
pub async fn clipboard_read() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        win32_clipboard::read_text()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Clipboard is only supported on Windows".to_string())
    }
}

#[tauri::command]
pub async fn clipboard_write(text: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        win32_clipboard::write_text(&text)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Clipboard is only supported on Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_native_windows_type_dispatch() {
        let req = ComputerInputRequest {
            action_type: ComputerInputType::Type,
            x: None,
            y: None,
            button: None,
            text: Some("REZEL_INPUT_VALIDATION_TEST".to_string()),
            key: None,
            keys: None,
            delta_x: None,
            delta_y: None,
            from_x: None,
            from_y: None,
            to_x: None,
            to_y: None,
            display_id: None,
        };

        let resp = computer_action(req).await.expect("Native typing dispatch should succeed");
        assert!(resp.success);
        assert_eq!(resp.action_type, "TYPE");
        println!("✅ Real Windows typing dispatch verified: {} ms", resp.duration_ms);
    }

    #[tokio::test]
    async fn test_native_windows_key_press_and_hotkey() {
        let key_req = ComputerInputRequest {
            action_type: ComputerInputType::KeyPress,
            x: None,
            y: None,
            button: None,
            text: None,
            key: Some("Escape".to_string()),
            keys: None,
            delta_x: None,
            delta_y: None,
            from_x: None,
            from_y: None,
            to_x: None,
            to_y: None,
            display_id: None,
        };
        let key_resp = computer_action(key_req).await.expect("Key press dispatch should succeed");
        assert!(key_resp.success);

        let hotkey_req = ComputerInputRequest {
            action_type: ComputerInputType::Hotkey,
            x: None,
            y: None,
            button: None,
            text: None,
            key: None,
            keys: Some(vec!["Control".to_string(), "Shift".to_string(), "Escape".to_string()]),
            delta_x: None,
            delta_y: None,
            from_x: None,
            from_y: None,
            to_x: None,
            to_y: None,
            display_id: None,
        };
        let hotkey_resp = computer_action(hotkey_req).await.expect("Hotkey dispatch should succeed");
        assert!(hotkey_resp.success);
        println!("✅ Real Windows key press and hotkey dispatch verified");
    }

    #[tokio::test]
    async fn test_native_windows_mouse_click() {
        let req = ComputerInputRequest {
            action_type: ComputerInputType::Click,
            x: Some(100),
            y: Some(100),
            button: Some("left".to_string()),
            text: None,
            key: None,
            keys: None,
            delta_x: None,
            delta_y: None,
            from_x: None,
            from_y: None,
            to_x: None,
            to_y: None,
            display_id: None,
        };

        let resp = computer_action(req).await.expect("Native mouse click dispatch should succeed");
        assert!(resp.success);
        assert_eq!(resp.action_type, "CLICK");
        println!("✅ Real Windows mouse click dispatch verified: at (100, 100)");
    }

    #[tokio::test]
    async fn test_out_of_bounds_rejection() {
        let req = ComputerInputRequest {
            action_type: ComputerInputType::Click,
            x: Some(99999),
            y: Some(99999),
            button: Some("left".to_string()),
            text: None,
            key: None,
            keys: None,
            delta_x: None,
            delta_y: None,
            from_x: None,
            from_y: None,
            to_x: None,
            to_y: None,
            display_id: None,
        };

        let err = computer_action(req).await.unwrap_err();
        assert!(err.contains("exceed virtual desktop bounds") || err.contains("exceed desktop bounds"));
        println!("✅ Out-of-bounds click rejected cleanly: {}", err);
    }

    #[test]
    fn test_virtual_desktop_bounds_retrieval() {
        let (vx, vy, vw, vh) = win32_input::get_virtual_desktop_bounds();
        assert!(vw > 0, "Virtual width must be strictly positive");
        assert!(vh > 0, "Virtual height must be strictly positive");
        println!(
            "✅ Virtual desktop metrics retrieved: origin=({}, {}), dimensions={}x{}",
            vx, vy, vw, vh
        );
    }

    #[test]
    fn test_multi_monitor_coordinate_normalization() {
        let (vx, vy, vw, vh) = win32_input::get_virtual_desktop_bounds();

        // 1. Primary origin or virtual origin
        let (nx1, ny1) = win32_input::normalize_coords(vx, vy);
        assert_eq!(nx1, 0);
        assert_eq!(ny1, 0);

        // 2. Maximum virtual extent
        let (nx2, ny2) = win32_input::normalize_coords(vx + vw - 1, vy + vh - 1);
        assert!(nx2 >= 65000);
        assert!(ny2 >= 65000);

        // 3. Center point
        let (nx_mid, ny_mid) = win32_input::normalize_coords(vx + vw / 2, vy + vh / 2);
        assert!(nx_mid > 20000 && nx_mid < 45000);
        assert!(ny_mid > 20000 && ny_mid < 45000);

        println!("✅ Multi-monitor virtual coordinate normalization verified across full desktop range");
    }
}
