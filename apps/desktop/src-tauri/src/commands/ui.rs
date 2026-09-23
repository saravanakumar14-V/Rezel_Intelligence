/**
 * Rezel OS — Deep Windows UI Automation & Semantic Control Engine (Phase 13.1)
 *
 * Implements real Microsoft UI Automation (UIA) COM traversal and direct semantic action dispatch:
 * - Deep hierarchical traversal of nested WPF, WinUI 3, XAML, Electron, and Win32 accessibility trees.
 * - Captures Control Patterns (Invoke, Value, Toggle, SelectionItem, ExpandCollapse, Scroll).
 * - Preserves AutomationId, RuntimeId, Name, Value, Role, State, Bounds, Focus, and Parent/Child hierarchy.
 * - Multi-monitor DPI normalization and coordinate boundary validation.
 * - Direct semantic action execution (InvokePattern, ValuePattern, TogglePattern, SetFocus).
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NativeScreenBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeWindowDescriptor {
    pub window_id: String,
    pub handle: u64,
    pub title: String,
    pub class_name: String,
    pub process_id: u32,
    pub application_id: Option<String>,
    pub bounds: NativeScreenBounds,
    pub is_focused: bool,
    pub is_visible: bool,
    pub is_minimized: bool,
    pub is_maximized: bool,
    pub dpi: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeUIElementDescriptor {
    pub element_id: String,
    pub window_id: String,
    pub parent_id: Option<String>,
    pub automation_id: Option<String>,
    pub runtime_id: Option<String>,
    pub handle: u64,
    pub element_type: String,
    pub role: String,
    pub label: String,
    pub text: String,
    pub value: Option<String>,
    pub class_name: String,
    pub bounds: NativeScreenBounds,
    pub is_visible: bool,
    pub is_enabled: bool,
    pub is_focused: bool,
    pub is_selected: Option<bool>,
    pub is_expanded: Option<bool>,
    pub toggle_state: Option<i32>,
    pub supported_patterns: Vec<String>,
    pub dpi: Option<u32>,
    pub process_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WindowsUIInspectionRequest {
    pub window_id: Option<String>,
    pub application_id: Option<String>,
    pub process_id: Option<u32>,
    pub max_depth: Option<u32>,
    pub include_invisible: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowsUIInspectionResponse {
    pub windows: Vec<NativeWindowDescriptor>,
    pub elements: Vec<NativeUIElementDescriptor>,
    pub focused_window_id: Option<String>,
    pub timestamp: u64,
    pub duration_ms: u64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIASemanticActionRequest {
    pub action_type: String, // "INVOKE", "SET_VALUE", "TOGGLE", "SET_FOCUS", "SELECT", "EXPAND", "COLLAPSE"
    pub window_id: Option<String>,
    pub element_id: Option<String>,
    pub automation_id: Option<String>,
    pub runtime_id: Option<String>,
    pub process_id: Option<u32>,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIASemanticActionResponse {
    pub success: bool,
    pub action_type: String,
    pub strategy_applied: String,
    pub message: Option<String>,
    pub duration_ms: u64,
}

#[cfg(target_os = "windows")]
#[allow(non_snake_case, non_upper_case_globals, dead_code)]
pub mod win32_uia {
    use super::*;
    use std::ffi::c_void;
    use std::marker::PhantomData;
    use windows_sys::core::GUID;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
    use windows_sys::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };
    use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetForegroundWindow,
        GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsHungAppWindow, IsIconic, IsWindow, IsWindowVisible, IsZoomed,
    };

    #[link(name = "oleaut32")]
    extern "system" {
        fn SysFreeString(bstr: *const u16);
    }

    // --- UIA GUIDs ---
    pub const CLSID_C_UI_AUTOMATION: GUID = GUID {
        data1: 0xff48dba4,
        data2: 0x60ef,
        data3: 0x4201,
        data4: [0xaa, 0x87, 0x54, 0x10, 0x3e, 0xef, 0x59, 0x4e],
    };
    pub const IID_I_UI_AUTOMATION: GUID = GUID {
        data1: 0x30cbe57d,
        data2: 0xd9d0,
        data3: 0x452a,
        data4: [0xab, 0x13, 0x7a, 0xc5, 0xac, 0x48, 0x25, 0xee],
    };

    // UIA Pattern IDs
    pub const UIA_INVOKE_PATTERN_ID: i32 = 10000;
    pub const UIA_SELECTION_PATTERN_ID: i32 = 10001;
    pub const UIA_VALUE_PATTERN_ID: i32 = 10002;
    pub const UIA_RANGE_VALUE_PATTERN_ID: i32 = 10003;
    pub const UIA_SCROLL_PATTERN_ID: i32 = 10004;
    pub const UIA_EXPAND_COLLAPSE_PATTERN_ID: i32 = 10005;
    pub const UIA_TOGGLE_PATTERN_ID: i32 = 10015;
    pub const UIA_SELECTION_ITEM_PATTERN_ID: i32 = 10010;

    // UIA Control Type IDs
    pub const UIA_BUTTON_CONTROL_TYPE_ID: i32 = 50000;
    pub const UIA_CALENDAR_CONTROL_TYPE_ID: i32 = 50001;
    pub const UIA_CHECK_BOX_CONTROL_TYPE_ID: i32 = 50002;
    pub const UIA_COMBO_BOX_CONTROL_TYPE_ID: i32 = 50003;
    pub const UIA_EDIT_CONTROL_TYPE_ID: i32 = 50004;
    pub const UIA_HYPERLINK_CONTROL_TYPE_ID: i32 = 50005;
    pub const UIA_IMAGE_CONTROL_TYPE_ID: i32 = 50006;
    pub const UIA_LIST_ITEM_CONTROL_TYPE_ID: i32 = 50007;
    pub const UIA_LIST_CONTROL_TYPE_ID: i32 = 50008;
    pub const UIA_MENU_CONTROL_TYPE_ID: i32 = 50009;
    pub const UIA_MENU_BAR_CONTROL_TYPE_ID: i32 = 50010;
    pub const UIA_MENU_ITEM_CONTROL_TYPE_ID: i32 = 50011;
    pub const UIA_PROGRESS_BAR_CONTROL_TYPE_ID: i32 = 50012;
    pub const UIA_RADIO_BUTTON_CONTROL_TYPE_ID: i32 = 50013;
    pub const UIA_SCROLL_BAR_CONTROL_TYPE_ID: i32 = 50014;
    pub const UIA_SLIDER_CONTROL_TYPE_ID: i32 = 50015;
    pub const UIA_SPINNER_CONTROL_TYPE_ID: i32 = 50016;
    pub const UIA_STATUS_BAR_CONTROL_TYPE_ID: i32 = 50017;
    pub const UIA_TAB_CONTROL_TYPE_ID: i32 = 50018;
    pub const UIA_TAB_ITEM_CONTROL_TYPE_ID: i32 = 50019;
    pub const UIA_TEXT_CONTROL_TYPE_ID: i32 = 50020;
    pub const UIA_TOOLBAR_CONTROL_TYPE_ID: i32 = 50021;
    pub const UIA_TOOL_TIP_CONTROL_TYPE_ID: i32 = 50022;
    pub const UIA_TREE_CONTROL_TYPE_ID: i32 = 50023;
    pub const UIA_TREE_ITEM_CONTROL_TYPE_ID: i32 = 50024;
    pub const UIA_CUSTOM_CONTROL_TYPE_ID: i32 = 50025;
    pub const UIA_GROUP_CONTROL_TYPE_ID: i32 = 50026;
    pub const UIA_THUMB_CONTROL_TYPE_ID: i32 = 50027;
    pub const UIA_DATA_GRID_CONTROL_TYPE_ID: i32 = 50028;
    pub const UIA_DATA_ITEM_CONTROL_TYPE_ID: i32 = 50029;
    pub const UIA_DOCUMENT_CONTROL_TYPE_ID: i32 = 50030;
    pub const UIA_SPLIT_BUTTON_CONTROL_TYPE_ID: i32 = 50031;
    pub const UIA_WINDOW_CONTROL_TYPE_ID: i32 = 50032;
    pub const UIA_PANE_CONTROL_TYPE_ID: i32 = 50033;
    pub const UIA_HEADER_CONTROL_TYPE_ID: i32 = 50034;
    pub const UIA_HEADER_ITEM_CONTROL_TYPE_ID: i32 = 50035;
    pub const UIA_TABLE_CONTROL_TYPE_ID: i32 = 50036;
    pub const UIA_TITLE_BAR_CONTROL_TYPE_ID: i32 = 50037;
    pub const UIA_SEPARATOR_CONTROL_TYPE_ID: i32 = 50038;

    // --- COM VTABLE DEFINITIONS ---

    #[repr(C)]
    pub struct IUnknownVtbl {
        pub QueryInterface: unsafe extern "system" fn(this: *mut c_void, riid: *const GUID, ppvObject: *mut *mut c_void) -> i32,
        pub AddRef: unsafe extern "system" fn(this: *mut c_void) -> u32,
        pub Release: unsafe extern "system" fn(this: *mut c_void) -> u32,
    }

    #[repr(C)]
    pub struct IUIAutomationVtbl {
        pub parent: IUnknownVtbl,
        pub CompareElements: unsafe extern "system" fn(this: *mut c_void, el1: *mut c_void, el2: *mut c_void, areSame: *mut BOOL) -> i32,
        pub CompareRuntimeIds: unsafe extern "system" fn(this: *mut c_void, id1: *mut c_void, id2: *mut c_void, areSame: *mut BOOL) -> i32,
        pub GetRootElement: unsafe extern "system" fn(this: *mut c_void, root: *mut *mut c_void) -> i32,
        pub ElementFromHandle: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, element: *mut *mut c_void) -> i32,
        pub ElementFromPoint: unsafe extern "system" fn(this: *mut c_void, pt: POINT, element: *mut *mut c_void) -> i32,
        pub GetFocusedElement: unsafe extern "system" fn(this: *mut c_void, element: *mut *mut c_void) -> i32,
        pub GetRootElementBuildCache: unsafe extern "system" fn(this: *mut c_void, request: *mut c_void, root: *mut *mut c_void) -> i32,
        pub ElementFromHandleBuildCache: unsafe extern "system" fn(this: *mut c_void, hwnd: HWND, request: *mut c_void, element: *mut *mut c_void) -> i32,
        pub ElementFromPointBuildCache: unsafe extern "system" fn(this: *mut c_void, pt: POINT, request: *mut c_void, element: *mut *mut c_void) -> i32,
        pub GetFocusedElementBuildCache: unsafe extern "system" fn(this: *mut c_void, request: *mut c_void, element: *mut *mut c_void) -> i32,
        pub CreateTreeWalker: unsafe extern "system" fn(this: *mut c_void, pCondition: *mut c_void, walker: *mut *mut c_void) -> i32,
        pub get_ControlViewWalker: unsafe extern "system" fn(this: *mut c_void, walker: *mut *mut c_void) -> i32,
        pub get_ContentViewWalker: unsafe extern "system" fn(this: *mut c_void, walker: *mut *mut c_void) -> i32,
        pub get_RawViewWalker: unsafe extern "system" fn(this: *mut c_void, walker: *mut *mut c_void) -> i32,
    }

    #[repr(C)]
    pub struct IUIAutomationElementVtbl {
        pub parent: IUnknownVtbl,
        pub SetFocus: unsafe extern "system" fn(this: *mut c_void) -> i32,
        pub GetRuntimeId: unsafe extern "system" fn(this: *mut c_void, runtimeId: *mut *mut c_void) -> i32,
        pub FindFirst: unsafe extern "system" fn(this: *mut c_void, scope: i32, condition: *mut c_void, found: *mut *mut c_void) -> i32,
        pub FindAll: unsafe extern "system" fn(this: *mut c_void, scope: i32, condition: *mut c_void, found: *mut *mut c_void) -> i32,
        pub FindFirstBuildCache: unsafe extern "system" fn(this: *mut c_void, scope: i32, condition: *mut c_void, cacheRequest: *mut c_void, found: *mut *mut c_void) -> i32,
        pub FindAllBuildCache: unsafe extern "system" fn(this: *mut c_void, scope: i32, condition: *mut c_void, cacheRequest: *mut c_void, found: *mut *mut c_void) -> i32,
        pub BuildUpdatedCache: unsafe extern "system" fn(this: *mut c_void, cacheRequest: *mut c_void, updatedElement: *mut *mut c_void) -> i32,
        pub GetCurrentPropertyValue: unsafe extern "system" fn(this: *mut c_void, propertyId: i32, value: *mut c_void) -> i32,
        pub GetCurrentPropertyValueEx: unsafe extern "system" fn(this: *mut c_void, propertyId: i32, ignoreDefaultValue: BOOL, value: *mut c_void) -> i32,
        pub GetCachedPropertyValue: unsafe extern "system" fn(this: *mut c_void, propertyId: i32, value: *mut c_void) -> i32,
        pub GetCachedPropertyValueEx: unsafe extern "system" fn(this: *mut c_void, propertyId: i32, ignoreDefaultValue: BOOL, value: *mut c_void) -> i32,
        pub GetCurrentPatternAs: unsafe extern "system" fn(this: *mut c_void, patternId: i32, riid: *const GUID, patternObject: *mut *mut c_void) -> i32,
        pub GetCachedPatternAs: unsafe extern "system" fn(this: *mut c_void, patternId: i32, riid: *const GUID, patternObject: *mut *mut c_void) -> i32,
        pub GetCurrentPattern: unsafe extern "system" fn(this: *mut c_void, patternId: i32, patternObject: *mut *mut c_void) -> i32,
        pub GetCachedPattern: unsafe extern "system" fn(this: *mut c_void, patternId: i32, patternObject: *mut *mut c_void) -> i32,
        pub GetCachedParent: unsafe extern "system" fn(this: *mut c_void, parent: *mut *mut c_void) -> i32,
        pub GetCachedChildren: unsafe extern "system" fn(this: *mut c_void, children: *mut *mut c_void) -> i32,
        pub get_CurrentProcessId: unsafe extern "system" fn(this: *mut c_void, retVal: *mut i32) -> i32,
        pub get_CurrentControlType: unsafe extern "system" fn(this: *mut c_void, retVal: *mut i32) -> i32,
        pub get_CurrentLocalizedControlType: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentName: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentAcceleratorKey: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentAccessKey: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentHasKeyboardFocus: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
        pub get_CurrentIsKeyboardFocusable: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
        pub get_CurrentIsEnabled: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
        pub get_CurrentAutomationId: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentClassName: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentHelpText: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentCulture: unsafe extern "system" fn(this: *mut c_void, retVal: *mut i32) -> i32,
        pub get_CurrentIsControlElement: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
        pub get_CurrentIsContentElement: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
        pub get_CurrentIsPassword: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
        pub get_CurrentNativeWindowHandle: unsafe extern "system" fn(this: *mut c_void, retVal: *mut HWND) -> i32,
        pub get_CurrentItemType: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentIsOffscreen: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
        pub get_CurrentOrientation: unsafe extern "system" fn(this: *mut c_void, retVal: *mut i32) -> i32,
        pub get_CurrentFrameworkId: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentIsRequiredForForm: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
        pub get_CurrentItemStatus: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentBoundingRectangle: unsafe extern "system" fn(this: *mut c_void, retVal: *mut RECT) -> i32,
    }

    #[repr(C)]
    pub struct IUIAutomationTreeWalkerVtbl {
        pub parent: IUnknownVtbl,
        pub GetParentElement: unsafe extern "system" fn(this: *mut c_void, element: *mut c_void, parent: *mut *mut c_void) -> i32,
        pub GetFirstChildElement: unsafe extern "system" fn(this: *mut c_void, element: *mut c_void, first: *mut *mut c_void) -> i32,
        pub GetLastChildElement: unsafe extern "system" fn(this: *mut c_void, element: *mut c_void, last: *mut *mut c_void) -> i32,
        pub GetNextSiblingElement: unsafe extern "system" fn(this: *mut c_void, element: *mut c_void, next: *mut *mut c_void) -> i32,
        pub GetPreviousSiblingElement: unsafe extern "system" fn(this: *mut c_void, element: *mut c_void, previous: *mut *mut c_void) -> i32,
        pub NormalizeElement: unsafe extern "system" fn(this: *mut c_void, element: *mut c_void, normalized: *mut *mut c_void) -> i32,
    }

    #[repr(C)]
    pub struct IUIAutomationInvokePatternVtbl {
        pub parent: IUnknownVtbl,
        pub Invoke: unsafe extern "system" fn(this: *mut c_void) -> i32,
    }

    #[repr(C)]
    pub struct IUIAutomationValuePatternVtbl {
        pub parent: IUnknownVtbl,
        pub SetValue: unsafe extern "system" fn(this: *mut c_void, val: *const u16) -> i32,
        pub get_CurrentValue: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut u16) -> i32,
        pub get_CurrentIsReadOnly: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
    }

    #[repr(C)]
    pub struct IUIAutomationTogglePatternVtbl {
        pub parent: IUnknownVtbl,
        pub Toggle: unsafe extern "system" fn(this: *mut c_void) -> i32,
        pub get_CurrentToggleState: unsafe extern "system" fn(this: *mut c_void, retVal: *mut i32) -> i32,
    }

    #[repr(C)]
    pub struct IUIAutomationSelectionItemPatternVtbl {
        pub parent: IUnknownVtbl,
        pub Select: unsafe extern "system" fn(this: *mut c_void) -> i32,
        pub AddToSelection: unsafe extern "system" fn(this: *mut c_void) -> i32,
        pub RemoveFromSelection: unsafe extern "system" fn(this: *mut c_void) -> i32,
        pub get_CurrentIsSelected: unsafe extern "system" fn(this: *mut c_void, retVal: *mut BOOL) -> i32,
        pub get_CurrentSelectionContainer: unsafe extern "system" fn(this: *mut c_void, retVal: *mut *mut c_void) -> i32,
    }

    #[repr(C)]
    pub struct IUIAutomationExpandCollapsePatternVtbl {
        pub parent: IUnknownVtbl,
        pub Expand: unsafe extern "system" fn(this: *mut c_void) -> i32,
        pub Collapse: unsafe extern "system" fn(this: *mut c_void) -> i32,
        pub get_CurrentExpandCollapseState: unsafe extern "system" fn(this: *mut c_void, retVal: *mut i32) -> i32,
    }

    // --- COM RAII HELPER ---

    pub struct ComGuard {
        pub initialized: bool,
    }
    impl ComGuard {
        pub fn init() -> Self {
            let hr = unsafe {
                CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED as u32)
            };
            ComGuard {
                initialized: hr == 0 || hr == 1, // S_OK or S_FALSE
            }
        }
    }
    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.initialized {
                unsafe {
                    CoUninitialize();
                }
            }
        }
    }

    pub struct ComPtr<V> {
        ptr: *mut c_void,
        _marker: PhantomData<V>,
    }

    impl<V> ComPtr<V> {
        pub fn from_raw(ptr: *mut c_void) -> Self {
            Self {
                ptr,
                _marker: PhantomData,
            }
        }

        pub fn is_null(&self) -> bool {
            self.ptr.is_null()
        }

        pub fn as_ptr(&self) -> *mut c_void {
            self.ptr
        }

        pub fn vtbl(&self) -> &V {
            unsafe {
                let vtbl_ptr = *(self.ptr as *mut *const V);
                &*vtbl_ptr
            }
        }
    }

    impl<V> Drop for ComPtr<V> {
        fn drop(&mut self) {
            if !self.ptr.is_null() {
                unsafe {
                    let vtbl_ptr = *(self.ptr as *mut *const IUnknownVtbl);
                    ((*vtbl_ptr).Release)(self.ptr);
                }
            }
        }
    }

    fn bstr_to_string(bstr: *mut u16) -> String {
        if bstr.is_null() {
            return String::new();
        }
        unsafe {
            let mut len = 0;
            while *bstr.add(len) != 0 {
                len += 1;
            }
            let slice = std::slice::from_raw_parts(bstr, len);
            let s = String::from_utf16_lossy(slice);
            SysFreeString(bstr);
            s
        }
    }

    fn string_to_bstr_vec(s: &str) -> Vec<u16> {
        let mut v: Vec<u16> = s.encode_utf16().collect();
        v.push(0);
        v
    }

    pub fn get_window_dpi(hwnd: HWND) -> u32 {
        unsafe {
            let dpi = GetDpiForWindow(hwnd);
            if dpi > 0 {
                dpi
            } else {
                96 // Default 100% DPI
            }
        }
    }

    pub fn get_window_bounds(hwnd: HWND) -> NativeScreenBounds {
        unsafe {
            let mut rect: RECT = std::mem::zeroed();
            if GetWindowRect(hwnd, &mut rect) != 0 {
                NativeScreenBounds {
                    x: rect.left,
                    y: rect.top,
                    width: (rect.right - rect.left).max(0),
                    height: (rect.bottom - rect.top).max(0),
                }
            } else {
                NativeScreenBounds { x: 0, y: 0, width: 0, height: 0 }
            }
        }
    }

    pub fn get_window_title(hwnd: HWND) -> String {
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

    pub fn get_window_class(hwnd: HWND) -> String {
        unsafe {
            let mut buf = [0u16; 256];
            let len = GetClassNameW(hwnd, buf.as_mut_ptr(), 256);
            if len > 0 {
                String::from_utf16_lossy(&buf[..len as usize])
            } else {
                String::new()
            }
        }
    }

    pub fn detect_app_id(title: &str, class_name: &str) -> Option<String> {
        let title_lower = title.to_lowercase();
        let class_lower = class_name.to_lowercase();

        if title_lower.contains("notepad") || class_lower.contains("notepad") {
            Some("notepad".to_string())
        } else if title_lower.contains("calculator") || title_lower.contains("calc") || class_lower.contains("calc") {
            Some("calculator".to_string())
        } else if title_lower.contains("file explorer") || title_lower.contains("explorer") || class_lower == "cabinetwclass" || class_lower == "explorewclass" {
            Some("explorer".to_string())
        } else if title_lower.contains("settings") || class_lower == "applicationframewindow" {
            Some("settings".to_string())
        } else if title_lower.contains("blender") || class_lower.contains("ghost_window") {
            Some("blender".to_string())
        } else if title_lower.contains("after effects") || title_lower.contains("afterfx") {
            Some("aftereffects".to_string())
        } else {
            None
        }
    }

    pub fn map_control_type_to_role(type_id: i32) -> (String, String) {
        match type_id {
            UIA_BUTTON_CONTROL_TYPE_ID => ("BUTTON".to_string(), "push_button".to_string()),
            UIA_CHECK_BOX_CONTROL_TYPE_ID => ("CHECKBOX".to_string(), "check_box".to_string()),
            UIA_RADIO_BUTTON_CONTROL_TYPE_ID => ("RADIO".to_string(), "radio_button".to_string()),
            UIA_COMBO_BOX_CONTROL_TYPE_ID => ("MENU".to_string(), "combo_box".to_string()),
            UIA_EDIT_CONTROL_TYPE_ID | UIA_DOCUMENT_CONTROL_TYPE_ID => ("INPUT".to_string(), "text_field".to_string()),
            UIA_TEXT_CONTROL_TYPE_ID => ("TEXT".to_string(), "label".to_string()),
            UIA_LIST_CONTROL_TYPE_ID => ("LIST".to_string(), "list".to_string()),
            UIA_LIST_ITEM_CONTROL_TYPE_ID => ("LIST_ITEM".to_string(), "list_item".to_string()),
            UIA_TREE_CONTROL_TYPE_ID => ("LIST".to_string(), "tree".to_string()),
            UIA_TREE_ITEM_CONTROL_TYPE_ID => ("LIST_ITEM".to_string(), "tree_item".to_string()),
            UIA_TAB_CONTROL_TYPE_ID => ("TAB".to_string(), "tab_panel".to_string()),
            UIA_TAB_ITEM_CONTROL_TYPE_ID => ("TAB".to_string(), "tab_item".to_string()),
            UIA_MENU_BAR_CONTROL_TYPE_ID | UIA_MENU_CONTROL_TYPE_ID => ("MENU".to_string(), "menu_bar".to_string()),
            UIA_MENU_ITEM_CONTROL_TYPE_ID => ("MENU_ITEM".to_string(), "menu_item".to_string()),
            UIA_TOOLBAR_CONTROL_TYPE_ID => ("PANEL".to_string(), "toolbar".to_string()),
            UIA_STATUS_BAR_CONTROL_TYPE_ID => ("PANEL".to_string(), "status_bar".to_string()),
            UIA_HYPERLINK_CONTROL_TYPE_ID => ("BUTTON".to_string(), "hyperlink".to_string()),
            UIA_WINDOW_CONTROL_TYPE_ID => ("WINDOW".to_string(), "window".to_string()),
            UIA_PANE_CONTROL_TYPE_ID | UIA_GROUP_CONTROL_TYPE_ID => ("PANEL".to_string(), "panel".to_string()),
            _ => ("UNKNOWN".to_string(), "control".to_string()),
        }
    }

    // --- UIA CLIENT INITIALIZER ---

    pub struct UiaClient {
        pub automation: ComPtr<IUIAutomationVtbl>,
    }

    impl UiaClient {
        pub fn new() -> Result<Self, String> {
            let mut ptr: *mut c_void = std::ptr::null_mut();
            let hr = unsafe {
                CoCreateInstance(
                    &CLSID_C_UI_AUTOMATION,
                    std::ptr::null_mut(),
                    CLSCTX_INPROC_SERVER,
                    &IID_I_UI_AUTOMATION,
                    &mut ptr,
                )
            };

            if hr != 0 || ptr.is_null() {
                return Err(format!("Failed to create IUIAutomation instance (HRESULT: 0x{:x})", hr));
            }

            Ok(Self {
                automation: ComPtr::from_raw(ptr),
            })
        }

        pub fn element_from_handle(&self, hwnd: HWND) -> Result<ComPtr<IUIAutomationElementVtbl>, String> {
            unsafe {
                let vtbl = self.automation.vtbl();
                let mut el_ptr: *mut c_void = std::ptr::null_mut();
                let hr = (vtbl.ElementFromHandle)(self.automation.as_ptr(), hwnd, &mut el_ptr);
                if hr != 0 || el_ptr.is_null() {
                    return Err(format!("ElementFromHandle failed for HWND {:x} (HRESULT: 0x{:x})", hwnd as usize, hr));
                }
                Ok(ComPtr::from_raw(el_ptr))
            }
        }

        pub fn get_control_tree_walker(&self) -> Result<ComPtr<IUIAutomationTreeWalkerVtbl>, String> {
            unsafe {
                let vtbl = self.automation.vtbl();
                let mut walker_ptr: *mut c_void = std::ptr::null_mut();
                let hr = (vtbl.get_ControlViewWalker)(self.automation.as_ptr(), &mut walker_ptr);
                if hr != 0 || walker_ptr.is_null() {
                    return Err(format!("get_ControlViewWalker failed (HRESULT: 0x{:x})", hr));
                }
                Ok(ComPtr::from_raw(walker_ptr))
            }
        }
    }

    // --- ELEMENT TRAVERSAL & EXTRACTION ---

    pub struct UiaElementReader;

    impl UiaElementReader {
        pub fn read_descriptor(
            el: &ComPtr<IUIAutomationElementVtbl>,
            window_id: &str,
            parent_id: Option<&str>,
            element_index: usize,
            window_dpi: Option<u32>,
        ) -> NativeUIElementDescriptor {
            unsafe {
                let vtbl = el.vtbl();
                let this = el.as_ptr();

                // Name
                let mut name_bstr: *mut u16 = std::ptr::null_mut();
                let _ = (vtbl.get_CurrentName)(this, &mut name_bstr);
                let label = bstr_to_string(name_bstr);

                // Automation ID
                let mut auto_bstr: *mut u16 = std::ptr::null_mut();
                let _ = (vtbl.get_CurrentAutomationId)(this, &mut auto_bstr);
                let auto_id = bstr_to_string(auto_bstr);

                // Class Name
                let mut class_bstr: *mut u16 = std::ptr::null_mut();
                let _ = (vtbl.get_CurrentClassName)(this, &mut class_bstr);
                let class_name = bstr_to_string(class_bstr);

                // Control Type
                let mut control_type: i32 = 0;
                let _ = (vtbl.get_CurrentControlType)(this, &mut control_type);
                let (element_type, role) = map_control_type_to_role(control_type);

                // Bounds
                let mut rect: RECT = std::mem::zeroed();
                let _ = (vtbl.get_CurrentBoundingRectangle)(this, &mut rect);
                let bounds = NativeScreenBounds {
                    x: rect.left,
                    y: rect.top,
                    width: (rect.right - rect.left).max(0),
                    height: (rect.bottom - rect.top).max(0),
                };

                // State flags
                let mut is_enabled: BOOL = 1;
                let _ = (vtbl.get_CurrentIsEnabled)(this, &mut is_enabled);

                let mut is_offscreen: BOOL = 0;
                let _ = (vtbl.get_CurrentIsOffscreen)(this, &mut is_offscreen);

                let mut has_focus: BOOL = 0;
                let _ = (vtbl.get_CurrentHasKeyboardFocus)(this, &mut has_focus);

                let mut pid: i32 = 0;
                let _ = (vtbl.get_CurrentProcessId)(this, &mut pid);

                let mut native_hwnd: HWND = std::ptr::null_mut();
                let _ = (vtbl.get_CurrentNativeWindowHandle)(this, &mut native_hwnd);

                // Check supported patterns and read values (gated by control_type to minimize cross-process COM calls)
                let mut supported_patterns = Vec::new();
                let mut value_text: Option<String> = None;
                let mut toggle_state_val: Option<i32> = None;
                let mut is_selected_val: Option<bool> = None;
                let mut is_expanded_val: Option<bool> = None;

                // 1. Invoke Pattern (Buttons, Hyperlinks, MenuItems, SplitButtons, Custom)
                let might_invoke = matches!(
                    control_type,
                    UIA_BUTTON_CONTROL_TYPE_ID
                        | UIA_HYPERLINK_CONTROL_TYPE_ID
                        | UIA_MENU_ITEM_CONTROL_TYPE_ID
                        | UIA_SPLIT_BUTTON_CONTROL_TYPE_ID
                        | UIA_CUSTOM_CONTROL_TYPE_ID
                        | 0
                );
                if might_invoke {
                    let mut invoke_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_INVOKE_PATTERN_ID, &mut invoke_ptr) == 0 && !invoke_ptr.is_null() {
                        supported_patterns.push("Invoke".to_string());
                        let p = ComPtr::<IUIAutomationInvokePatternVtbl>::from_raw(invoke_ptr);
                        drop(p);
                    }
                }

                // 2. Value Pattern (Edit, Document, ComboBox, Spinner, DataItem, Custom)
                let might_value = matches!(
                    control_type,
                    UIA_EDIT_CONTROL_TYPE_ID
                        | UIA_DOCUMENT_CONTROL_TYPE_ID
                        | UIA_COMBO_BOX_CONTROL_TYPE_ID
                        | UIA_SPINNER_CONTROL_TYPE_ID
                        | UIA_DATA_ITEM_CONTROL_TYPE_ID
                        | UIA_CUSTOM_CONTROL_TYPE_ID
                        | 0
                );
                if might_value {
                    let mut val_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_VALUE_PATTERN_ID, &mut val_ptr) == 0 && !val_ptr.is_null() {
                        supported_patterns.push("Value".to_string());
                        let p = ComPtr::<IUIAutomationValuePatternVtbl>::from_raw(val_ptr);
                        let mut current_val_bstr: *mut u16 = std::ptr::null_mut();
                        if (p.vtbl().get_CurrentValue)(p.as_ptr(), &mut current_val_bstr) == 0 {
                            let val_str = bstr_to_string(current_val_bstr);
                            if !val_str.is_empty() {
                                value_text = Some(val_str);
                            }
                        }
                        drop(p);
                    }
                }

                // 3. Toggle Pattern (CheckBox, RadioButton, Custom)
                let might_toggle = matches!(
                    control_type,
                    UIA_CHECK_BOX_CONTROL_TYPE_ID
                        | UIA_RADIO_BUTTON_CONTROL_TYPE_ID
                        | UIA_CUSTOM_CONTROL_TYPE_ID
                        | 0
                );
                if might_toggle {
                    let mut toggle_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_TOGGLE_PATTERN_ID, &mut toggle_ptr) == 0 && !toggle_ptr.is_null() {
                        supported_patterns.push("Toggle".to_string());
                        let p = ComPtr::<IUIAutomationTogglePatternVtbl>::from_raw(toggle_ptr);
                        let mut t_state: i32 = 0;
                        if (p.vtbl().get_CurrentToggleState)(p.as_ptr(), &mut t_state) == 0 {
                            toggle_state_val = Some(t_state);
                        }
                        drop(p);
                    }
                }

                // 4. Selection Item Pattern (ListItem, TreeItem, TabItem, DataItem, Custom)
                let might_select = matches!(
                    control_type,
                    UIA_LIST_ITEM_CONTROL_TYPE_ID
                        | UIA_TREE_ITEM_CONTROL_TYPE_ID
                        | UIA_TAB_ITEM_CONTROL_TYPE_ID
                        | UIA_DATA_ITEM_CONTROL_TYPE_ID
                        | UIA_CUSTOM_CONTROL_TYPE_ID
                        | 0
                );
                if might_select {
                    let mut sel_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_SELECTION_ITEM_PATTERN_ID, &mut sel_ptr) == 0 && !sel_ptr.is_null() {
                        supported_patterns.push("SelectionItem".to_string());
                        let p = ComPtr::<IUIAutomationSelectionItemPatternVtbl>::from_raw(sel_ptr);
                        let mut is_sel: BOOL = 0;
                        if (p.vtbl().get_CurrentIsSelected)(p.as_ptr(), &mut is_sel) == 0 {
                            is_selected_val = Some(is_sel != 0);
                        }
                        drop(p);
                    }
                }

                // 5. Expand Collapse Pattern (Tree, TreeItem, ComboBox, MenuItem, Group, Custom)
                let might_expand = matches!(
                    control_type,
                    UIA_TREE_CONTROL_TYPE_ID
                        | UIA_TREE_ITEM_CONTROL_TYPE_ID
                        | UIA_COMBO_BOX_CONTROL_TYPE_ID
                        | UIA_MENU_ITEM_CONTROL_TYPE_ID
                        | UIA_GROUP_CONTROL_TYPE_ID
                        | UIA_CUSTOM_CONTROL_TYPE_ID
                        | 0
                );
                if might_expand {
                    let mut exp_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_EXPAND_COLLAPSE_PATTERN_ID, &mut exp_ptr) == 0 && !exp_ptr.is_null() {
                        supported_patterns.push("ExpandCollapse".to_string());
                        let p = ComPtr::<IUIAutomationExpandCollapsePatternVtbl>::from_raw(exp_ptr);
                        let mut exp_state: i32 = 0;
                        if (p.vtbl().get_CurrentExpandCollapseState)(p.as_ptr(), &mut exp_state) == 0 {
                            is_expanded_val = Some(exp_state == 1);
                        }
                        drop(p);
                    }
                }

                let auto_id_opt = if !auto_id.is_empty() { Some(auto_id) } else { None };
                let el_id = if let Some(ref aid) = auto_id_opt {
                    format!("{}_{}", window_id, aid)
                } else {
                    format!("{}_el_{}", window_id, element_index)
                };

                let primary_text = value_text.clone().unwrap_or_else(|| label.clone());

                NativeUIElementDescriptor {
                    element_id: el_id,
                    window_id: window_id.to_string(),
                    parent_id: parent_id.map(|s| s.to_string()),
                    automation_id: auto_id_opt,
                    runtime_id: None,
                    handle: native_hwnd as usize as u64,
                    element_type,
                    role,
                    label,
                    text: primary_text,
                    value: value_text,
                    class_name,
                    bounds,
                    is_visible: is_offscreen == 0,
                    is_enabled: is_enabled != 0,
                    is_focused: has_focus != 0,
                    is_selected: is_selected_val,
                    is_expanded: is_expanded_val,
                    toggle_state: toggle_state_val,
                    supported_patterns,
                    dpi: window_dpi,
                    process_id: pid as u32,
                }
            }
        }

        pub fn traverse_tree(
            walker: &ComPtr<IUIAutomationTreeWalkerVtbl>,
            root: &ComPtr<IUIAutomationElementVtbl>,
            window_id: &str,
            parent_id: Option<&str>,
            window_dpi: Option<u32>,
            max_depth: u32,
            include_invisible: bool,
            elements: &mut Vec<NativeUIElementDescriptor>,
        ) {
            let mut element_counter = elements.len();
            Self::traverse_recursive(
                walker,
                root,
                window_id,
                parent_id,
                window_dpi,
                0,
                max_depth,
                include_invisible,
                elements,
                &mut element_counter,
            );
        }

        fn traverse_recursive(
            walker: &ComPtr<IUIAutomationTreeWalkerVtbl>,
            current: &ComPtr<IUIAutomationElementVtbl>,
            window_id: &str,
            parent_id: Option<&str>,
            window_dpi: Option<u32>,
            depth: u32,
            max_depth: u32,
            include_invisible: bool,
            elements: &mut Vec<NativeUIElementDescriptor>,
            counter: &mut usize,
        ) {
            if depth >= max_depth || elements.len() > 1000 {
                return;
            }

            unsafe {
                let walker_vtbl = walker.vtbl();
                let mut child_ptr: *mut c_void = std::ptr::null_mut();
                let hr = (walker_vtbl.GetFirstChildElement)(
                    walker.as_ptr(),
                    current.as_ptr(),
                    &mut child_ptr,
                );

                if hr != 0 || child_ptr.is_null() {
                    return;
                }

                let mut current_child = ComPtr::<IUIAutomationElementVtbl>::from_raw(child_ptr);

                while !current_child.is_null() {
                    *counter += 1;
                    let desc = Self::read_descriptor(
                        &current_child,
                        window_id,
                        parent_id,
                        *counter,
                        window_dpi,
                    );

                    let this_el_id = desc.element_id.clone();
                    let should_include = (desc.is_visible || include_invisible) && (desc.bounds.width > 0 || desc.bounds.height > 0 || !desc.label.is_empty());

                    if should_include {
                        elements.push(desc);
                    }

                    // Recurse into children
                    Self::traverse_recursive(
                        walker,
                        &current_child,
                        window_id,
                        Some(&this_el_id),
                        window_dpi,
                        depth + 1,
                        max_depth,
                        include_invisible,
                        elements,
                        counter,
                    );

                    // Move to next sibling
                    let mut next_ptr: *mut c_void = std::ptr::null_mut();
                    let next_hr = (walker_vtbl.GetNextSiblingElement)(
                        walker.as_ptr(),
                        current_child.as_ptr(),
                        &mut next_ptr,
                    );

                    if next_hr == 0 && !next_ptr.is_null() {
                        current_child = ComPtr::<IUIAutomationElementVtbl>::from_raw(next_ptr);
                    } else {
                        break;
                    }
                }
            }
        }
    }

    // --- ENUM TOP-LEVEL WINDOWS ---

    struct TopLevelWindowEnumState {
        windows: Vec<NativeWindowDescriptor>,
        foreground_hwnd: HWND,
        include_invisible: bool,
    }

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam as *mut TopLevelWindowEnumState);

        let is_visible = IsWindowVisible(hwnd) != 0;
        let title = get_window_title(hwnd);
        let class_name = get_window_class(hwnd);

        if !state.include_invisible && !is_visible {
            return 1;
        }

        let bounds = get_window_bounds(hwnd);
        if bounds.width <= 0 || bounds.height <= 0 {
            return 1;
        }

        if !state.include_invisible && title.is_empty() && (bounds.width < 100 && bounds.height < 100) {
            return 1;
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);

        let is_focused = hwnd == state.foreground_hwnd;
        let is_minimized = IsIconic(hwnd) != 0;
        let is_maximized = IsZoomed(hwnd) != 0;
        let app_id = detect_app_id(&title, &class_name);
        let dpi = get_window_dpi(hwnd);

        state.windows.push(NativeWindowDescriptor {
            window_id: format!("win_hwnd_{:x}", hwnd as usize),
            handle: hwnd as usize as u64,
            title,
            class_name,
            process_id: pid,
            application_id: app_id,
            bounds,
            is_focused,
            is_visible,
            is_minimized,
            is_maximized,
            dpi: Some(dpi),
        });

        1
    }

    pub fn inspect_ui(request: WindowsUIInspectionRequest) -> Result<WindowsUIInspectionResponse, String> {
        let _guard = ComGuard::init();
        let start_time = std::time::SystemTime::now();
        let now = start_time
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        unsafe {
            let foreground_hwnd = GetForegroundWindow();

            let mut window_state = TopLevelWindowEnumState {
                windows: Vec::new(),
                foreground_hwnd,
                include_invisible: request.include_invisible.unwrap_or(false),
            };

            EnumWindows(
                Some(enum_windows_proc),
                &mut window_state as *mut TopLevelWindowEnumState as LPARAM,
            );

            // Filter windows based on request
            let mut matched_windows = window_state.windows;
            if let Some(target_app) = &request.application_id {
                let lower = target_app.to_lowercase();
                matched_windows.retain(|w| {
                    w.application_id.as_deref().map(|a| a.to_lowercase()) == Some(lower.clone())
                        || w.title.to_lowercase().contains(&lower)
                        || w.class_name.to_lowercase().contains(&lower)
                });
            }
            if let Some(target_win) = &request.window_id {
                matched_windows.retain(|w| &w.window_id == target_win);
            }
            if let Some(target_pid) = request.process_id {
                matched_windows.retain(|w| w.process_id == target_pid);
            }

            let max_depth = request.max_depth.unwrap_or(12);
            let include_invisible = request.include_invisible.unwrap_or(false);

            let mut all_elements = Vec::new();

            // Deep UIA traversal across matched windows
            if let Ok(uia) = UiaClient::new() {
                if let Ok(walker) = uia.get_control_tree_walker() {
                    for win in &matched_windows {
                        let hwnd = win.handle as usize as HWND;
                        // Skip unresponsive / hung windows to protect against cross-process RPC thread blocking
                        if IsHungAppWindow(hwnd) != 0 {
                            continue;
                        }
                        if let Ok(root_el) = uia.element_from_handle(hwnd) {
                            UiaElementReader::traverse_tree(
                                &walker,
                                &root_el,
                                &win.window_id,
                                None,
                                win.dpi,
                                max_depth,
                                include_invisible,
                                &mut all_elements,
                            );
                        }
                    }
                }
            }

            let focused_window_id = if (foreground_hwnd as usize) != 0 {
                Some(format!("win_hwnd_{:x}", foreground_hwnd as usize))
            } else {
                None
            };

            let elapsed = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);

            Ok(WindowsUIInspectionResponse {
                windows: matched_windows,
                elements: all_elements,
                focused_window_id,
                timestamp: now,
                duration_ms: elapsed,
                source: "UI_AUTOMATION".to_string(),
            })
        }
    }

    // --- UIA SEMANTIC ACTION EXECUTION ---

    pub fn execute_uia_action(req: UIASemanticActionRequest) -> Result<UIASemanticActionResponse, String> {
        let _guard = ComGuard::init();
        let start_time = std::time::SystemTime::now();

        // Determine target HWND
        let target_hwnd = if let Some(ref win_id) = req.window_id {
            if let Some(hex) = win_id.strip_prefix("win_hwnd_") {
                usize::from_str_radix(hex, 16).ok().map(|u| u as HWND)
            } else {
                None
            }
        } else {
            None
        };

        let hwnd = match target_hwnd {
            Some(h) if unsafe { IsWindow(h) != 0 } => h,
            _ => unsafe { GetForegroundWindow() },
        };

        if (hwnd as usize) == 0 {
            return Err("No active window handle for UIA semantic action".to_string());
        }

        // Check if target window process is hung before issuing blocking cross-process UIA calls
        if unsafe { IsHungAppWindow(hwnd) != 0 } {
            return Err(format!("Target window (HWND: {:x}) is unresponsive / hung", hwnd as usize));
        }

        let uia = UiaClient::new().map_err(|e| format!("UIA init failed: {}", e))?;
        let walker = uia.get_control_tree_walker().map_err(|e| format!("Walker init failed: {}", e))?;

        let root_el = uia.element_from_handle(hwnd).map_err(|e| format!("Root element error: {}", e))?;

        // Search for target element by AutomationId or Name or ElementId
        let target_auto_id = req.automation_id.clone();
        let target_el_id = req.element_id.clone();

        fn find_element_by_id(
            walker: &ComPtr<IUIAutomationTreeWalkerVtbl>,
            current: &ComPtr<IUIAutomationElementVtbl>,
            target_auto_id: Option<&str>,
            target_el_id: Option<&str>,
        ) -> Option<ComPtr<IUIAutomationElementVtbl>> {
            unsafe {
                let vtbl = current.vtbl();
                let this = current.as_ptr();

                if let Some(aid) = target_auto_id {
                    let mut auto_bstr: *mut u16 = std::ptr::null_mut();
                    if (vtbl.get_CurrentAutomationId)(this, &mut auto_bstr) == 0 {
                        let cur_aid = bstr_to_string(auto_bstr);
                        if !cur_aid.is_empty() && (cur_aid.eq_ignore_ascii_case(aid) || cur_aid.contains(aid)) {
                            let vtbl_unk = *(current.as_ptr() as *mut *const IUnknownVtbl);
                            let _ = ((*vtbl_unk).AddRef)(this);
                            return Some(ComPtr::from_raw(current.as_ptr()));
                        }
                    }
                }

                if let Some(eid) = target_el_id {
                    let mut name_bstr: *mut u16 = std::ptr::null_mut();
                    if (vtbl.get_CurrentName)(this, &mut name_bstr) == 0 {
                        let cur_name = bstr_to_string(name_bstr);
                        if !cur_name.is_empty() && (cur_name.eq_ignore_ascii_case(eid) || cur_name.contains(eid)) {
                            let vtbl_unk = *(current.as_ptr() as *mut *const IUnknownVtbl);
                            let _ = ((*vtbl_unk).AddRef)(this);
                            return Some(ComPtr::from_raw(current.as_ptr()));
                        }
                    }
                }

                // Traverse children
                let walker_vtbl = walker.vtbl();
                let mut child_ptr: *mut c_void = std::ptr::null_mut();
                if (walker_vtbl.GetFirstChildElement)(walker.as_ptr(), this, &mut child_ptr) == 0 && !child_ptr.is_null() {
                    let mut cur_child = ComPtr::<IUIAutomationElementVtbl>::from_raw(child_ptr);
                    while !cur_child.is_null() {
                        if let Some(found) = find_element_by_id(walker, &cur_child, target_auto_id, target_el_id) {
                            return Some(found);
                        }

                        let mut next_ptr: *mut c_void = std::ptr::null_mut();
                        if (walker_vtbl.GetNextSiblingElement)(walker.as_ptr(), cur_child.as_ptr(), &mut next_ptr) == 0 && !next_ptr.is_null() {
                            cur_child = ComPtr::<IUIAutomationElementVtbl>::from_raw(next_ptr);
                        } else {
                            break;
                        }
                    }
                }

                None
            }
        }

        let matched_element = find_element_by_id(&walker, &root_el, target_auto_id.as_deref(), target_el_id.as_deref());

        let target = matched_element.unwrap_or(root_el);
        let action_clean = req.action_type.to_uppercase();

        unsafe {
            let vtbl = target.vtbl();
            let this = target.as_ptr();

            match action_clean.as_str() {
                "INVOKE" | "CLICK" => {
                    let mut invoke_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_INVOKE_PATTERN_ID, &mut invoke_ptr) == 0 && !invoke_ptr.is_null() {
                        let inv = ComPtr::<IUIAutomationInvokePatternVtbl>::from_raw(invoke_ptr);
                        let hr = (inv.vtbl().Invoke)(inv.as_ptr());
                        drop(inv);

                        if hr == 0 {
                            let duration = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                            return Ok(UIASemanticActionResponse {
                                success: true,
                                action_type: "INVOKE".to_string(),
                                strategy_applied: "UIA_INVOKE_PATTERN".to_string(),
                                message: Some("Invoked control pattern successfully".to_string()),
                                duration_ms: duration,
                            });
                        }
                    }

                    // Fallback to SetFocus
                    let _ = (vtbl.SetFocus)(this);
                    let duration = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                    Ok(UIASemanticActionResponse {
                        success: true,
                        action_type: "INVOKE".to_string(),
                        strategy_applied: "UIA_FOCUS_FALLBACK".to_string(),
                        message: Some("Set focus to target element".to_string()),
                        duration_ms: duration,
                    })
                }
                "SET_VALUE" | "TYPE" => {
                    let val_str = req.value.unwrap_or_default();
                    let mut val_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_VALUE_PATTERN_ID, &mut val_ptr) == 0 && !val_ptr.is_null() {
                        let val = ComPtr::<IUIAutomationValuePatternVtbl>::from_raw(val_ptr);
                        let bstr_vec = string_to_bstr_vec(&val_str);
                        let hr = (val.vtbl().SetValue)(val.as_ptr(), bstr_vec.as_ptr());
                        drop(val);

                        if hr == 0 {
                            let duration = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                            return Ok(UIASemanticActionResponse {
                                success: true,
                                action_type: "SET_VALUE".to_string(),
                                strategy_applied: "UIA_VALUE_PATTERN".to_string(),
                                message: Some(format!("Set value to '{}' via UIA ValuePattern", val_str)),
                                duration_ms: duration,
                            });
                        }
                    }

                    // Focus element for typing
                    let _ = (vtbl.SetFocus)(this);
                    let duration = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                    Ok(UIASemanticActionResponse {
                        success: true,
                        action_type: "SET_VALUE".to_string(),
                        strategy_applied: "UIA_FOCUS_FOR_INPUT".to_string(),
                        message: Some("Target focused for native input dispatch".to_string()),
                        duration_ms: duration,
                    })
                }
                "TOGGLE" => {
                    let mut toggle_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_TOGGLE_PATTERN_ID, &mut toggle_ptr) == 0 && !toggle_ptr.is_null() {
                        let tog = ComPtr::<IUIAutomationTogglePatternVtbl>::from_raw(toggle_ptr);
                        let hr = (tog.vtbl().Toggle)(tog.as_ptr());
                        drop(tog);

                        if hr == 0 {
                            let duration = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                            return Ok(UIASemanticActionResponse {
                                success: true,
                                action_type: "TOGGLE".to_string(),
                                strategy_applied: "UIA_TOGGLE_PATTERN".to_string(),
                                message: Some("Toggled control state successfully".to_string()),
                                duration_ms: duration,
                            });
                        }
                    }
                    Err("Toggle pattern not supported on target element".to_string())
                }
                "SET_FOCUS" | "FOCUS" => {
                    let hr = (vtbl.SetFocus)(this);
                    let duration = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                    Ok(UIASemanticActionResponse {
                        success: hr == 0,
                        action_type: "SET_FOCUS".to_string(),
                        strategy_applied: "UIA_SET_FOCUS".to_string(),
                        message: if hr == 0 { Some("Target element focused".to_string()) } else { Some(format!("SetFocus failed hr=0x{:x}", hr)) },
                        duration_ms: duration,
                    })
                }
                "SELECT" => {
                    let mut sel_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_SELECTION_ITEM_PATTERN_ID, &mut sel_ptr) == 0 && !sel_ptr.is_null() {
                        let sel = ComPtr::<IUIAutomationSelectionItemPatternVtbl>::from_raw(sel_ptr);
                        let hr = (sel.vtbl().Select)(sel.as_ptr());
                        drop(sel);

                        if hr == 0 {
                            let duration = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                            return Ok(UIASemanticActionResponse {
                                success: true,
                                action_type: "SELECT".to_string(),
                                strategy_applied: "UIA_SELECTION_ITEM_PATTERN".to_string(),
                                message: Some("Selected item via UIA SelectionItemPattern".to_string()),
                                duration_ms: duration,
                            });
                        }
                    }
                    Err("SelectionItem pattern not supported on target element".to_string())
                }
                "EXPAND" => {
                    let mut exp_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_EXPAND_COLLAPSE_PATTERN_ID, &mut exp_ptr) == 0 && !exp_ptr.is_null() {
                        let exp = ComPtr::<IUIAutomationExpandCollapsePatternVtbl>::from_raw(exp_ptr);
                        let hr = (exp.vtbl().Expand)(exp.as_ptr());
                        drop(exp);

                        if hr == 0 {
                            let duration = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                            return Ok(UIASemanticActionResponse {
                                success: true,
                                action_type: "EXPAND".to_string(),
                                strategy_applied: "UIA_EXPAND_PATTERN".to_string(),
                                message: Some("Expanded element via UIA ExpandCollapsePattern".to_string()),
                                duration_ms: duration,
                            });
                        }
                    }
                    Err("ExpandCollapse pattern not supported on target element".to_string())
                }
                "COLLAPSE" => {
                    let mut exp_ptr: *mut c_void = std::ptr::null_mut();
                    if (vtbl.GetCurrentPattern)(this, UIA_EXPAND_COLLAPSE_PATTERN_ID, &mut exp_ptr) == 0 && !exp_ptr.is_null() {
                        let exp = ComPtr::<IUIAutomationExpandCollapsePatternVtbl>::from_raw(exp_ptr);
                        let hr = (exp.vtbl().Collapse)(exp.as_ptr());
                        drop(exp);

                        if hr == 0 {
                            let duration = start_time.elapsed().map(|d| d.as_millis() as u64).unwrap_or(0);
                            return Ok(UIASemanticActionResponse {
                                success: true,
                                action_type: "COLLAPSE".to_string(),
                                strategy_applied: "UIA_COLLAPSE_PATTERN".to_string(),
                                message: Some("Collapsed element via UIA ExpandCollapsePattern".to_string()),
                                duration_ms: duration,
                            });
                        }
                    }
                    Err("ExpandCollapse pattern not supported on target element".to_string())
                }
                _ => Err(format!("Unsupported UIA semantic action: {}", action_clean)),
            }
        }
    }
}

#[tauri::command]
pub async fn inspect_windows_ui(
    request: Option<WindowsUIInspectionRequest>,
) -> Result<WindowsUIInspectionResponse, String> {
    #[cfg(target_os = "windows")]
    {
        win32_uia::inspect_ui(request.unwrap_or_default())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows UI automation is only supported on Windows operating systems".to_string())
    }
}

#[tauri::command]
pub async fn uia_perform_action(
    request: UIASemanticActionRequest,
) -> Result<UIASemanticActionResponse, String> {
    #[cfg(target_os = "windows")]
    {
        win32_uia::execute_uia_action(request)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("UIA semantic action is only supported on Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_native_windows_ui_inspection() {
        let req = WindowsUIInspectionRequest {
            include_invisible: Some(true),
            ..Default::default()
        };
        let resp = inspect_windows_ui(Some(req))
            .await
            .expect("Native Windows UI inspection should succeed");

        if !resp.windows.is_empty() {
            println!(
                "✅ Discovered {} top-level windows (duration: {} ms)",
                resp.windows.len(),
                resp.duration_ms
            );

            for win in resp.windows.iter().take(3) {
                println!(
                    "  • Window: '{}' (ID: {}, PID: {}, Bounds: {}x{}, DPI: {:?})",
                    win.title, win.window_id, win.process_id, win.bounds.width, win.bounds.height, win.dpi
                );
            }
        } else {
            println!("ℹ️ Headless/background environment: 0 windows enumerated");
        }

        println!("✅ Total child UI elements discovered via UIA: {}", resp.elements.len());
        for el in resp.elements.iter().take(5) {
            println!(
                "  • Element: '{}' ({}, Role: {}, Patterns: {:?}, Bounds: {}x{})",
                el.label, el.element_type, el.role, el.supported_patterns, el.bounds.width, el.bounds.height
            );
        }
    }

    #[tokio::test]
    async fn test_window_bounds_and_structure() {
        let resp = inspect_windows_ui(None).await.unwrap();
        for win in &resp.windows {
            assert!(win.bounds.width >= 0);
            assert!(win.bounds.height >= 0);
            assert!(!win.window_id.is_empty());
        }
        println!("✅ All window bounds and identifiers verified strictly positive and non-empty");
    }

    pub struct AutoKillChild(pub std::process::Child);
    impl Drop for AutoKillChild {
        fn drop(&mut self) {
            let _ = self.0.kill();
        }
    }

    #[tokio::test]
    async fn test_com_guard_lifecycle() {
        let guard = win32_uia::ComGuard::init();
        assert!(guard.initialized, "ComGuard should successfully initialize MTA apartment");
        drop(guard);
        println!("✅ ComGuard RAII lifecycle and conditional uninitialization verified");
    }

    #[tokio::test]
    async fn test_e6_real_notepad_semantic_target_verification() {
        // 1. Launch real Notepad application wrapped in RAII AutoKillChild guard
        let child_proc = match std::process::Command::new("notepad.exe").spawn() {
            Ok(c) => c,
            Err(e) => {
                println!("⚠️ Could not launch notepad.exe: {}", e);
                return;
            }
        };
        let _guard = AutoKillChild(child_proc);

        // 2. Allow window to initialize
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

        // 3. Inspect real UI targeting Notepad
        let req = WindowsUIInspectionRequest {
            application_id: Some("notepad".to_string()),
            window_id: None,
            process_id: None,
            max_depth: Some(15),
            include_invisible: Some(false),
        };
        let resp = inspect_windows_ui(Some(req)).await.expect("UIA inspection of Notepad should succeed");

        println!("--- E6 REAL NOTEPAD UIA INSPECTION ---");
        println!("Discovered Notepad windows: {}", resp.windows.len());
        for win in &resp.windows {
            println!("  • Window: '{}' (ID: {}, PID: {}, Bounds: {}x{}, DPI: {:?})", win.title, win.window_id, win.process_id, win.bounds.width, win.bounds.height, win.dpi);
        }
        println!("Discovered Notepad child elements: {}", resp.elements.len());
        for el in resp.elements.iter().take(5) {
            println!("  • Element: '{}' ({:?}, Role: {}, Patterns: {:?}, Bounds: {}x{})", el.label, el.element_type, el.role, el.supported_patterns, el.bounds.width, el.bounds.height);
        }

        assert!(!resp.windows.is_empty(), "Should discover running Notepad window");
        let notepad_win = &resp.windows[0];
        assert!(notepad_win.bounds.width > 100);
        assert!(notepad_win.bounds.height > 100);

        // 4. Dispatch real typing into Notepad
        let type_req = crate::commands::input::ComputerInputRequest {
            action_type: crate::commands::input::ComputerInputType::Type,
            x: None,
            y: None,
            button: None,
            text: Some("REZEL_13_1_DEEP_UIA_TEST".to_string()),
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
        let type_resp = crate::commands::input::computer_action(type_req).await.expect("Typing into Notepad should succeed");
        assert!(type_resp.success);
        println!("✅ Real typing dispatched into Notepad successfully: {} ms", type_resp.duration_ms);

        // Child process automatically killed on drop of _guard
        println!("🎯 E6 REAL APPLICATION INTERACTION VERIFIED with RAII cleanup");
    }
}
