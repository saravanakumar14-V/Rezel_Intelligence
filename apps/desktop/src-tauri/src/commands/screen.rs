/**
 * Rezel OS — Native Screen Capture Command (Sprint P0-1)
 *
 * Implements real native Windows desktop and region screen capture.
 * Uses xcap (DXGI / WGC) with robust Win32 GDI fallback for universal Windows 10/11 compatibility.
 * Encodes captured frames to standard PNG format for VisionManager and Vision AI models.
 */

use serde::{Deserialize, Serialize};
use image::codecs::png::PngEncoder;
use image::ImageEncoder;
use xcap::Monitor;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenCaptureBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenCaptureRequest {
    pub display_id: Option<String>,
    pub bounds: Option<ScreenCaptureBounds>,
    pub format: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenCaptureResponse {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub mime_type: String,
    pub data_base64: String,
    pub bytes: Vec<u8>,
    pub timestamp: u64,
    pub byte_size: usize,
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };
        result.push(CHARS[(b0 >> 2) as usize] as char);
        result.push(CHARS[(((b0 & 3) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[(((b1 & 15) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(b2 & 63) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[cfg(target_os = "windows")]
fn capture_windows_gdi(bounds: Option<ScreenCaptureBounds>) -> Result<(image::RgbaImage, u32, u32), String> {
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetDesktopWindow, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
    };

    unsafe {
        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);
        if screen_w <= 0 || screen_h <= 0 {
            return Err("Failed to retrieve Windows screen metrics".to_string());
        }

        let (src_x, src_y, width, height) = match bounds {
            Some(b) => {
                if b.width == 0 || b.height == 0 {
                    return Err("Capture bounds width and height must be greater than 0".to_string());
                }
                (b.x, b.y, b.width, b.height)
            }
            None => (0, 0, screen_w as u32, screen_h as u32),
        };

        let hwnd = GetDesktopWindow();
        let hdc_screen = GetDC(hwnd);
        if hdc_screen.is_null() {
            let err = windows_sys::Win32::Foundation::GetLastError();
            return Err(format!("GetDC(GetDesktopWindow()) failed, error: {}", err));
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.is_null() {
            let err = windows_sys::Win32::Foundation::GetLastError();
            ReleaseDC(hwnd, hdc_screen);
            return Err(format!("CreateCompatibleDC failed, error: {}", err));
        }

        let hbitmap = CreateCompatibleBitmap(hdc_screen, width as i32, height as i32);
        if hbitmap.is_null() {
            let err = windows_sys::Win32::Foundation::GetLastError();
            DeleteDC(hdc_mem);
            ReleaseDC(hwnd, hdc_screen);
            return Err(format!("CreateCompatibleBitmap failed, error: {}", err));
        }

        let old_obj = SelectObject(hdc_mem, hbitmap);
        let blt_res = BitBlt(
            hdc_mem,
            0,
            0,
            width as i32,
            height as i32,
            hdc_screen,
            src_x,
            src_y,
            SRCCOPY,
        );

        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width as i32;
        bmi.bmiHeader.biHeight = -(height as i32); // Negative for top-down DIB
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let total_pixels = (width * height) as usize;
        let mut bgra_buf: Vec<u8> = vec![0u8; total_pixels * 4];

        let dib_res = GetDIBits(
            hdc_mem,
            hbitmap,
            0,
            height,
            bgra_buf.as_mut_ptr() as *mut _,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // Cleanup GDI objects immediately
        SelectObject(hdc_mem, old_obj);
        DeleteObject(hbitmap);
        DeleteDC(hdc_mem);
        ReleaseDC(hwnd, hdc_screen);

        if blt_res == 0 && dib_res == 0 {
            let err = windows_sys::Win32::Foundation::GetLastError();
            return Err(format!("GDI BitBlt and GetDIBits failed, error: {}", err));
        }

        // Convert BGRA to RGBA image
        let mut img = image::RgbaImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                let offset = ((y * width + x) * 4) as usize;
                let b = bgra_buf[offset];
                let g = bgra_buf[offset + 1];
                let r = bgra_buf[offset + 2];
                img.put_pixel(x, y, image::Rgba([r, g, b, 255]));
            }
        }

        Ok((img, width, height))
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_windows_gdi(_bounds: Option<ScreenCaptureBounds>) -> Result<(image::RgbaImage, u32, u32), String> {
    Err("Native screen capture is only supported on Windows".to_string())
}

#[tauri::command]
pub async fn capture_screen(request: Option<ScreenCaptureRequest>) -> Result<ScreenCaptureResponse, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let bounds = request.as_ref().and_then(|r| r.bounds.clone());

    // Try xcap monitor capture first; fallback to native Windows GDI
    let capture_result: Result<(image::RgbaImage, u32, u32), String> = match Monitor::all() {
        Ok(monitors) if !monitors.is_empty() => {
            let monitor = if let Some(ref d_id) = request.as_ref().and_then(|r| r.display_id.clone()) {
                monitors
                    .iter()
                    .find(|m| {
                        m.name().map(|n| n.eq_ignore_ascii_case(d_id)).unwrap_or(false)
                            || m.id().map(|id| id.to_string() == *d_id).unwrap_or(false)
                    })
                    .or_else(|| monitors.iter().find(|m| m.is_primary().unwrap_or(false)))
                    .unwrap_or(&monitors[0])
            } else {
                monitors
                    .iter()
                    .find(|m| m.is_primary().unwrap_or(false))
                    .unwrap_or(&monitors[0])
            };

            match monitor.capture_image() {
                Ok(full_image) => {
                    if let Some(ref b) = bounds {
                        if b.width == 0 || b.height == 0 {
                            return Err("Capture bounds width and height must be greater than 0".to_string());
                        }
                        let img_w = full_image.width();
                        let img_h = full_image.height();
                        let crop_x = (b.x.max(0) as u32).min(img_w.saturating_sub(1));
                        let crop_y = (b.y.max(0) as u32).min(img_h.saturating_sub(1));
                        let crop_w = b.width.min(img_w.saturating_sub(crop_x)).max(1);
                        let crop_h = b.height.min(img_h.saturating_sub(crop_y)).max(1);

                        let cropped = image::imageops::crop_imm(&full_image, crop_x, crop_y, crop_w, crop_h).to_image();
                        Ok((cropped, crop_w, crop_h))
                    } else {
                        let w = full_image.width();
                        let h = full_image.height();
                        Ok((full_image, w, h))
                    }
                }
                Err(e) => {
                    log::warn!("xcap capture failed ({}), attempting GDI fallback capture...", e);
                    capture_windows_gdi(bounds.clone())
                }
            }
        }
        _ => capture_windows_gdi(bounds.clone()),
    };

    let (final_img, width, height) = capture_result?;

    let mut png_bytes = Vec::new();
    let encoder = PngEncoder::new(&mut png_bytes);
    encoder
        .write_image(&final_img, width, height, image::ExtendedColorType::Rgba8)
        .map_err(|e| format!("Failed to encode captured screenshot to PNG: {}", e))?;

    let byte_size = png_bytes.len();
    let data_base64 = base64_encode(&png_bytes);

    Ok(ScreenCaptureResponse {
        width,
        height,
        format: "png".to_string(),
        mime_type: "image/png".to_string(),
        data_base64,
        bytes: png_bytes,
        timestamp: now,
        byte_size,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_real_windows_fullscreen_capture() {
        let resp = capture_screen(None).await.expect("Real screen capture should succeed on Windows desktop");
        assert!(resp.width > 0, "Width must be greater than 0");
        assert!(resp.height > 0, "Height must be greater than 0");
        assert_eq!(resp.format, "png");
        assert_eq!(resp.mime_type, "image/png");
        assert!(resp.byte_size > 1000, "Real screenshot PNG must be materially larger than 1000 bytes, got: {}", resp.byte_size);
        assert!(!resp.data_base64.is_empty(), "Base64 data must not be empty");

        // Verify PNG magic bytes header: [137, 80, 78, 71, 13, 10, 26, 10]
        assert_eq!(&resp.bytes[0..8], &[137, 80, 78, 71, 13, 10, 26, 10], "Bytes must start with valid PNG header");

        // Verify decoding via image crate
        let img = image::load_from_memory(&resp.bytes).expect("Captured PNG bytes must be decodable by image crate");
        assert_eq!(img.width(), resp.width);
        assert_eq!(img.height(), resp.height);
        println!("✅ Real Windows full-screen capture verified: {}x{}, {} bytes", resp.width, resp.height, resp.byte_size);
    }

    #[tokio::test]
    async fn test_real_windows_region_capture() {
        let req = ScreenCaptureRequest {
            display_id: None,
            bounds: Some(ScreenCaptureBounds {
                x: 50,
                y: 50,
                width: 320,
                height: 240,
            }),
            format: Some("png".to_string()),
        };

        let resp = capture_screen(Some(req)).await.expect("Real region capture should succeed");
        assert_eq!(resp.width, 320);
        assert_eq!(resp.height, 240);
        assert_eq!(&resp.bytes[0..8], &[137, 80, 78, 71, 13, 10, 26, 10]);

        let img = image::load_from_memory(&resp.bytes).expect("Captured region PNG bytes must be decodable");
        assert_eq!(img.width(), 320);
        assert_eq!(img.height(), 240);
        println!("✅ Real Windows region capture verified: 320x240, {} bytes", resp.byte_size);
    }
}
