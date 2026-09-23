export const _mockFileSystem: Record<string, string> = {};
export const _mockFileStats: Record<string, { size?: number; modified?: number; isDir?: boolean; isFile?: boolean }> = {};
(globalThis as any)._mockFileSystem = _mockFileSystem;
(globalThis as any)._mockFileStats = _mockFileStats;

if (!(globalThis as any).window) {
  (globalThis as any).window = globalThis;
}

(globalThis as any).__TAURI_INTERNALS__ = {
  invoke: (cmd: string, args?: any) => invoke(cmd, args),
  transformCallback: (cb: any) => cb,
};
if ((globalThis as any).window) {
  (globalThis as any).window.__TAURI_INTERNALS__ = (globalThis as any).__TAURI_INTERNALS__;
}

if (!(import.meta as any).env) {
  (import.meta as any).env = { DEV: true };
}

let _audioSessionRunning = false;

export async function invoke<T>(cmd: string, args?: any): Promise<T> {
  if (cmd === 'read_app_file') {
    const path = args?.path;
    if (!(path in _mockFileSystem)) {
      throw new Error(`File not found: ${path}`);
    }
    return _mockFileSystem[path] as any;
  }
  if (cmd === 'get_api_key') {
    return 'FAKE_API_KEY_123' as any;
  }
  if (cmd === 'get_system_info') {
    return {
      cpu_usage: 14.2,
      memory_used: 8589934592,
      memory_total: 17179869184,
      memory_percent: 50.0,
      disk_used: 107374182400,
      disk_total: 512000000000,
      disk_percent: 20.9,
      platform: 'windows',
      os_version: 'Windows 11',
      hostname: 'DESKTOP-REZEL',
      uptime_secs: 43200,
    } as any;
  }
  if (cmd === 'write_app_file') {
    const path = args?.path;
    const content = args?.content;
    _mockFileSystem[path] = content;
    return undefined as any;
  }

  // Audio commands
  if (cmd === 'audio_get_status') {
    return {
      isRunning: _audioSessionRunning,
      activeInputDevice: _audioSessionRunning ? 'mock_mic' : null,
      activeOutputDevice: _audioSessionRunning ? 'mock_speaker' : null,
      sampleRate: 16000,
      aecEnabled: true,
      inputLevel: 0.0,
      outputLevel: 0.0,
    } as any;
  }
  if (cmd === 'audio_list_devices') {
    return {
      inputs: [
        {
          id: 'mock_mic',
          name: 'Default Mock Microphone',
          isDefault: true,
          isInput: true,
          channels: 1,
          sampleRates: [16000, 44100, 48000],
        },
      ],
      outputs: [
        {
          id: 'mock_speaker',
          name: 'Default Mock Speaker',
          isDefault: true,
          isInput: false,
          channels: 2,
          sampleRates: [44100, 48000],
        },
      ],
    } as any;
  }
  if (cmd === 'audio_start_session') {
    _audioSessionRunning = true;
    return {
      isRunning: true,
      activeInputDevice: args?.options?.input_device_id ?? 'mock_mic',
      activeOutputDevice: args?.options?.output_device_id ?? 'mock_speaker',
      sampleRate: args?.options?.sample_rate ?? 16000,
      aecEnabled: args?.options?.enable_aec ?? true,
      inputLevel: 0.0,
      outputLevel: 0.0,
    } as any;
  }
  if (cmd === 'audio_stop_session') {
    _audioSessionRunning = false;
    return {
      isRunning: false,
      activeInputDevice: null,
      activeOutputDevice: null,
      sampleRate: 16000,
      aecEnabled: true,
      inputLevel: 0.0,
      outputLevel: 0.0,
    } as any;
  }
  if (cmd === 'audio_get_processing_metadata') {
    return {
      processing_mode: 'LOCAL',
      stt_model: 'Native Whisper / Streaming ONNX (Local)',
      tts_model: 'Native Piper / ONNX Synthesis (Local)',
      vad_model: 'Native Silero VAD (Local)',
      aec_enabled: true,
      zero_raw_audio_persistence: true,
    } as any;
  }
  if (cmd === 'audio_run_aec_benchmark') {
    return {
      echo_return_loss_enhancement_db: 24.5,
      false_trigger_rate: 0.0,
      latency_ms: 12.5,
      aec_status: 'BENCHMARK_PASSED',
    } as any;
  }
  if (
    cmd === 'native_vad_set_config' ||
    cmd === 'native_tts_speak' ||
    cmd === 'native_tts_cancel' ||
    cmd === 'native_stt_start' ||
    cmd === 'native_stt_stop' ||
    cmd === 'native_stt_abort' ||
    cmd === 'native_stt_feed_transcript'
  ) {
    return undefined as any;
  }
  if (cmd === 'native_vad_process_frame') {
    return {
      state: args?.rms >= 0.05 ? 'SPEECH' : 'SILENCE',
      confidence: 0.9,
      timestamp: args?.timestamp_ms ?? Date.now(),
    } as any;
  }

  // Window commands
  if (cmd === 'window_get_bounds') {
    return {
      x: 100,
      y: 100,
      width: 1280,
      height: 800,
      is_maximized: false,
    } as any;
  }
  if (cmd === 'window_set_companion_mode') {
    return {
      x: 1520,
      y: 820,
      width: args?.options?.width ?? 360,
      height: args?.options?.height ?? 220,
      is_maximized: false,
    } as any;
  }
  if (cmd === 'window_restore_full_mode') {
    return {
      x: 100,
      y: 100,
      width: 1280,
      height: 800,
      is_maximized: false,
    } as any;
  }

  // Screen capture command (returns valid standard PNG)
  if (cmd === 'capture_screen') {
    const isSec = args?.request?.display_id === 'display_secondary';
    const width = args?.request?.bounds?.width ?? (isSec ? 3840 : 1920);
    const height = args?.request?.bounds?.height ?? (isSec ? 2160 : 1080);
    const validPngBytes = [
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6,
      0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 96, 0, 0, 0, 2, 0,
      1, 244, 113, 100, 4, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ];
    return {
      width,
      height,
      format: 'png',
      mime_type: 'image/png',
      data_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      bytes: validPngBytes,
      timestamp: Date.now(),
      byte_size: validPngBytes.length,
    } as any;
  }

  // Window activation command
  if (cmd === 'window_activate') {
    return {
      success: true,
      handle: args?.request?.handle ?? 123456,
      message: 'Target window activated and brought to foreground',
    } as any;
  }

  // Native input dispatch command
  if (cmd === 'computer_action') {
    return {
      success: true,
      action_type: args?.request?.action_type ?? 'CLICK',
      dispatched_at: Date.now(),
      duration_ms: 5,
      message: 'Native Windows input successfully dispatched',
    } as any;
  }

  // UIA semantic action command
  if (cmd === 'uia_perform_action') {
    return {
      success: true,
      action_type: args?.request?.action_type ?? 'INVOKE',
      strategy_applied: 'UIA_SEMANTIC_PATTERN',
      message: 'UIA semantic action performed successfully',
      duration_ms: 3,
    } as any;
  }

  // Native Windows UI inspection command
  if (cmd === 'inspect_windows_ui') {
    const isCalc = args?.request?.application_id === 'calculator';
    const isExplorer = args?.request?.application_id === 'explorer';

    if (isCalc) {
      return {
        windows: [
          {
            window_id: 'win_calc_main',
            handle: 345678,
            title: 'Calculator',
            class_name: 'ApplicationFrameWindow',
            process_id: 8888,
            application_id: 'calculator',
            bounds: { x: 200, y: 200, width: 350, height: 500 },
            is_focused: true,
            is_visible: true,
            is_minimized: false,
            is_maximized: false,
            dpi: 96,
          },
        ],
        elements: [
          {
            element_id: 'win_calc_main_num7Button',
            window_id: 'win_calc_main',
            parent_id: 'win_calc_main',
            automation_id: 'num7Button',
            handle: 0,
            element_type: 'BUTTON',
            role: 'push_button',
            label: 'Seven',
            text: '7',
            value: undefined,
            class_name: 'Button',
            bounds: { x: 210, y: 300, width: 60, height: 40 },
            is_visible: true,
            is_enabled: true,
            is_focused: false,
            supported_patterns: ['Invoke'],
            dpi: 96,
            process_id: 8888,
          },
          {
            element_id: 'win_calc_main_plusButton',
            window_id: 'win_calc_main',
            parent_id: 'win_calc_main',
            automation_id: 'plusButton',
            handle: 0,
            element_type: 'BUTTON',
            role: 'push_button',
            label: 'Plus',
            text: '+',
            value: undefined,
            class_name: 'Button',
            bounds: { x: 390, y: 300, width: 60, height: 40 },
            is_visible: true,
            is_enabled: true,
            is_focused: false,
            supported_patterns: ['Invoke'],
            dpi: 96,
            process_id: 8888,
          },
          {
            element_id: 'win_calc_main_num3Button',
            window_id: 'win_calc_main',
            parent_id: 'win_calc_main',
            automation_id: 'num3Button',
            handle: 0,
            element_type: 'BUTTON',
            role: 'push_button',
            label: 'Three',
            text: '3',
            value: undefined,
            class_name: 'Button',
            bounds: { x: 330, y: 350, width: 60, height: 40 },
            is_visible: true,
            is_enabled: true,
            is_focused: false,
            supported_patterns: ['Invoke'],
            dpi: 96,
            process_id: 8888,
          },
          {
            element_id: 'win_calc_main_equalButton',
            window_id: 'win_calc_main',
            parent_id: 'win_calc_main',
            automation_id: 'equalButton',
            handle: 0,
            element_type: 'BUTTON',
            role: 'push_button',
            label: 'Equals',
            text: '=',
            value: undefined,
            class_name: 'Button',
            bounds: { x: 390, y: 400, width: 60, height: 40 },
            is_visible: true,
            is_enabled: true,
            is_focused: false,
            supported_patterns: ['Invoke'],
            dpi: 96,
            process_id: 8888,
          },
          {
            element_id: 'win_calc_main_CalculatorResults',
            window_id: 'win_calc_main',
            parent_id: 'win_calc_main',
            automation_id: 'CalculatorResults',
            handle: 0,
            element_type: 'TEXT',
            role: 'label',
            label: 'Display is 10',
            text: '10',
            value: '10',
            class_name: 'TextBlock',
            bounds: { x: 210, y: 220, width: 320, height: 60 },
            is_visible: true,
            is_enabled: true,
            is_focused: false,
            supported_patterns: [],
            dpi: 96,
            process_id: 8888,
          },
        ],
        focused_window_id: 'win_calc_main',
        timestamp: Date.now(),
        duration_ms: 2,
        source: 'UI_AUTOMATION',
      } as any;
    }

    if (isExplorer) {
      return {
        windows: [
          {
            window_id: 'win_explorer_main',
            handle: 456789,
            title: 'File Explorer',
            class_name: 'CabinetWClass',
            process_id: 9999,
            application_id: 'explorer',
            bounds: { x: 150, y: 150, width: 900, height: 650 },
            is_focused: true,
            is_visible: true,
            is_minimized: false,
            is_maximized: false,
            dpi: 96,
          },
        ],
        elements: [
          {
            element_id: 'win_explorer_main_AddressBandRoot',
            window_id: 'win_explorer_main',
            parent_id: 'win_explorer_main',
            automation_id: 'AddressBandRoot',
            handle: 0,
            element_type: 'INPUT',
            role: 'text_field',
            label: 'Address: C:\\Users',
            text: 'C:\\Users',
            value: 'C:\\Users',
            class_name: 'AddressBandRoot',
            bounds: { x: 250, y: 190, width: 600, height: 30 },
            is_visible: true,
            is_enabled: true,
            is_focused: false,
            supported_patterns: ['Value'],
            dpi: 96,
            process_id: 9999,
          },
        ],
        focused_window_id: 'win_explorer_main',
        timestamp: Date.now(),
        duration_ms: 2,
        source: 'UI_AUTOMATION',
      } as any;
    }

    return {
      windows: [
        {
          window_id: 'win_notepad_main',
          handle: 123456,
          title: 'Untitled - Notepad',
          class_name: 'Notepad',
          process_id: 5432,
          application_id: 'notepad',
          bounds: { x: 100, y: 100, width: 800, height: 600 },
          is_focused: true,
          is_visible: true,
          is_minimized: false,
          is_maximized: false,
          dpi: 96,
        },
      ],
      elements: [
        {
          element_id: 'el_notepad_edit',
          window_id: 'win_notepad_main',
          parent_id: 'win_notepad_main',
          automation_id: 'ctl_15',
          handle: 123457,
          element_type: 'INPUT',
          role: 'text_field',
          label: 'Text Editor',
          text: '',
          value: '',
          class_name: 'Edit',
          bounds: { x: 105, y: 150, width: 790, height: 540 },
          is_visible: true,
          is_enabled: true,
          is_focused: true,
          supported_patterns: ['Value'],
          dpi: 96,
          process_id: 5432,
        },
      ],
      focused_window_id: 'win_notepad_main',
      timestamp: Date.now(),
      duration_ms: 2,
      source: 'UI_AUTOMATION',
    } as any;
  }

  if (cmd === 'fs_get_scope') {
    return {
      allowed_roots: [
        'C:/Users/test/AppData/Roaming/com.tauri.dev',
        '/tmp/rezel_tests',
        'C:/tmp/rezel_tests',
        'C:/rezel_tests',
      ],
      read_allowed: true,
      write_allowed: true,
      delete_allowed: true,
    } as any;
  }

  if (cmd === 'fs_stat') {
    const rawPath = args?.path;
    const normalized = rawPath?.replace(/\\/g, '/');
    const statEntry = _mockFileStats[normalized] || _mockFileStats[rawPath];
    if (statEntry) {
      return {
        isFile: statEntry.isFile ?? true,
        isDir: statEntry.isDir ?? false,
        size: statEntry.size ?? (_mockFileSystem[normalized]?.length || 0),
        modified: statEntry.modified ?? Date.now(),
      } as any;
    }
    if ((normalized && normalized in _mockFileSystem) || (rawPath && rawPath in _mockFileSystem)) {
      const content = _mockFileSystem[normalized] ?? _mockFileSystem[rawPath];
      return {
        isFile: true,
        isDir: false,
        size: content.length,
        modified: Date.now(),
      } as any;
    }
    throw new Error(`File not found: ${rawPath}`);
  }

  if (cmd === 'send_ipc_command') {
    const client = args?.client;
    const command = args?.command;
    
    if (command === 'blender.inspect_scene') {
      return JSON.stringify({
        status: 'SUCCESS',
        scene_name: 'Scene',
        file_path: 'C:/Renders/scene.blend',
        active_object_name: 'HeroShip',
        objects: [
          { name: 'Cube', type: 'MESH', location: [0, 0, 0] },
          { name: 'HeroShip', type: 'MESH', location: [0, 0, 1.5] },
          { name: 'SciFi_Core', type: 'MESH', location: [0, 0, 0] },
        ],
        collections: [{ name: 'Collection', object_ids: ['Cube', 'HeroShip', 'SciFi_Core'] }],
      }) as any;
    }

    if (command === 'ae_inspect_project') {
      return JSON.stringify({
        status: 'SUCCESS',
        projectName: 'MockProject.aep',
        compositions: [
          { id: 1, name: 'MainComp', layers: [{ id: 1, name: 'Text 1', type: 'TEXT' }] },
          { id: 2, name: 'SpaceComposite', layers: [{ id: 1, name: 'Footage_blender_render.png', type: 'AVLayer' }] },
          { id: 3, name: 'FinalMovieComp', layers: [{ id: 1, name: 'Title', type: 'TEXT' }] },
          { id: 4, name: 'CommercialPromo_Comp', layers: [{ id: 1, name: 'Headline', type: 'TEXT' }] },
          { id: 5, name: 'Master_VFX_Comp', layers: [{ id: 1, name: 'HUD', type: 'TEXT' }] },
        ],
      }) as any;
    }

    return JSON.stringify({ success: true }) as any;
  }

  console.log(`[mock_tauri_core] Unhandled invoke: ${cmd}`);
  return undefined as any;
}
