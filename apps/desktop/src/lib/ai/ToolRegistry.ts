/**
 * ToolRegistry
 *
 * Dynamic registry for all tools available to the AI agent.
 * Tools declare their name, parameters, risk level, and category.
 *
 * The registry provides:
 *  - Registration / deregistration of tools at runtime
 *  - Lookup by name
 *  - Discovery by category
 *  - Conversion to Gemini function-declaration format
 *
 * Tools registered here are presented to the AI provider so it can
 * choose which to invoke. Actual execution flows through the AI
 * ToolExecutor → Security ToolExecutor pipeline.
 */

import type { ToolDefinition, ToolCategory, ParameterDef } from './types';
import { GeminiSchemaNormalizer } from './SchemaNormalizer';

class ToolRegistryImpl {
  private readonly tools = new Map<string, ToolDefinition>();

  /**
   * register
   * Adds a tool to the registry. Overwrites if name already exists.
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * registerMany
   * Batch registration — convenience for startup initialisation.
   */
  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * unregister
   * Removes a tool by name. Returns true if it existed.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * get
   * Returns a tool definition or undefined.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * has
   * Returns true if a tool with that name is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * getAll
   * Returns all registered tools as an array.
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * getByCategory
   * Returns all tools matching a specific category.
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  /**
   * toGeminiFunctionDeclarations
   *
   * Converts registered tools into the Gemini API `functionDeclarations`
   * format for tool-use / function-calling.
   *
   * Shape:
   * ```json
   * [{
   *   "name": "get_system_info",
   *   "description": "...",
   *   "parameters": { "type": "object", "properties": {...}, "required": [...] }
   * }]
   * ```
   */
  toGeminiFunctionDeclarations(): GeminiFunctionDeclaration[] {
    const declarations: GeminiFunctionDeclaration[] = [];

    for (const tool of this.getAll()) {
      const properties: Record<string, GeminiParamSchema> = {};
      const required: string[] = [];
      let validSchema = true;

      for (const [key, param] of Object.entries(tool.parameters)) {
        try {
          properties[key] = GeminiSchemaNormalizer.convertParam(param, `${tool.name}.${key}`);
          if (param.required) {
            required.push(key);
          }
        } catch (error) {
          console.error(`Invalid tool schema: ${tool.name}.${key} - ${(error as Error).message}`);
          validSchema = false;
          break;
        }
      }

      if (validSchema) {
        declarations.push({
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'OBJECT' as const,
            properties,
            ...(required.length > 0 ? { required } : {}),
          },
        });
      }
    }

    return declarations;
  }

  /** Returns the count of registered tools. */
  get size(): number {
    return this.tools.size;
  }

  /** Clears all tools — used in testing or resets. */
  clear(): void {
    this.tools.clear();
  }
}

// ─── Gemini API parameter types ───────────────────────────────────────────────

type GeminiParamType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'OBJECT' | 'ARRAY';

interface GeminiParamSchema {
  type: GeminiParamType;
  description: string;
  enum?: string[];
  items?: GeminiParamSchema;
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, GeminiParamSchema>;
    required?: string[];
  };
}

// ─── Default tools ────────────────────────────────────────────────────────────

/**
 * BUILT_IN_TOOLS
 *
 * Core tools that ship with Rezel. Registered automatically on AgentCore init.
 */
export const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    name: 'get_system_info',
    description: 'Get current CPU usage percentage and RAM usage in bytes.',
    parameters: {},
    category: 'system',
    risk: 'LOW',
    tauriCommand: 'get_system_info',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'run_system_command',
    description:
      'Execute a safe system command (echo, whoami, hostname, ipconfig, tasklist, systeminfo, ver). ' +
      'Returns stdout, stderr, and success status.',
    parameters: {
      command: {
        type: 'string',
        description: 'The command to execute (must be in the allowlist).',
        required: true,
      },
      args: {
        type: 'array',
        description: 'Arguments to pass to the command.',
        required: false,
        items: {
          type: 'string',
          description: 'A command argument.',
        },
      },
    } satisfies Record<string, ParameterDef>,
    category: 'shell',
    risk: 'HIGH',
    tauriCommand: 'run_system_command',
    toolGroup: 'shell',
    mutatesExternalState: true,
    retryPolicy: 'NEVER',
  },
  {
    name: 'save_api_key',
    description: 'Save the Gemini API key securely in the OS keyring.',
    parameters: {
      key: {
        type: 'string',
        description: 'The API key to store.',
        required: true,
      },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'MEDIUM',
    tauriCommand: 'save_api_key',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'NEVER',
  },
  {
    name: 'get_api_key',
    description: 'Retrieve the stored Gemini API key from the OS keyring.',
    parameters: {},
    category: 'system',
    risk: 'LOW',
    tauriCommand: 'get_api_key',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'read_app_file',
    description: 'Read a text file from the Rezel app data directory.',
    parameters: {
      path: {
        type: 'string',
        description: 'Relative path within the app data directory.',
        required: true,
      },
    } satisfies Record<string, ParameterDef>,
    category: 'file',
    risk: 'LOW',
    tauriCommand: 'read_app_file',
    toolGroup: 'memory',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'write_app_file',
    description: 'Write a text file to the Rezel app data directory.',
    parameters: {
      path: {
        type: 'string',
        description: 'Relative path within the app data directory.',
        required: true,
      },
      content: {
        type: 'string',
        description: 'File content to write.',
        required: true,
      },
    } satisfies Record<string, ParameterDef>,
    category: 'file',
    risk: 'MEDIUM',
    tauriCommand: 'write_app_file',
    toolGroup: 'memory',
    mutatesExternalState: true,
    retryPolicy: 'NEVER',
  },
  {
    name: 'web_search',
    description: 'Perform a live web search to find current information, news, or answer general questions. Returns snippets from the top results. Always synthesize the snippets to provide a direct answer.',
    parameters: {
      query: {
        type: 'string',
        description: 'The search query.',
        required: true,
      },
    } satisfies Record<string, ParameterDef>,
    category: 'network',
    risk: 'LOW',
    tauriCommand: 'web_search',
    toolGroup: 'network',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'get_weather',
    description: 'Get current weather conditions for a specific location. If the location is not explicitly stated in the prompt or recent context, you MUST ask the user for their location before calling this tool.',
    parameters: {
      location: {
        type: 'string',
        description: 'The location name to get weather for (e.g. "Chennai, India").',
        required: true,
      },
    } satisfies Record<string, ParameterDef>,
    category: 'network',
    risk: 'LOW',
    tauriCommand: 'get_weather',
    toolGroup: 'network',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'create_workflow_plan',
    description: 'Use this tool when the user requests a complex, multi-step automation workflow. Break down the user\'s goal into sequential steps. Each step must use a registered capability.',
    parameters: {
      goal: {
        type: 'string',
        description: 'The overall goal of the automation plan.',
        required: true,
      },
      steps: {
        type: 'array',
        description: 'The sequence of steps to execute. Each step describes an action and its target capability.',
        required: true,
        items: {
          type: 'string',
          description: 'A step description including the capability to invoke and its parameters.',
        },
      }
    } satisfies Record<string, ParameterDef>,
    category: 'ai',
    risk: 'LOW',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },

  {
    name: 'computer_scroll',
    description: 'Scroll the active window or target region vertically or horizontally.',
    parameters: {
      deltaY: {
        type: 'number',
        description: 'Vertical scroll delta.',
        required: true,
      },
      deltaX: {
        type: 'number',
        description: 'Horizontal scroll delta.',
        required: false,
      },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'LOW',
    tauriCommand: 'computer_scroll',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'AUTO',
  },
  {
    name: 'computer_drag',
    description: 'Perform a click-and-drag mouse operation between two coordinate bounds.',
    parameters: {
      fromX: {
        type: 'number',
        description: 'Starting X coordinate in pixels.',
        required: true,
      },
      fromY: {
        type: 'number',
        description: 'Starting Y coordinate in pixels.',
        required: true,
      },
      toX: {
        type: 'number',
        description: 'Ending X coordinate in pixels.',
        required: true,
      },
      toY: {
        type: 'number',
        description: 'Ending Y coordinate in pixels.',
        required: true,
      },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'HIGH',
    tauriCommand: 'computer_action',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'NEVER',
  },
  {
    name: 'capture_screen',
    description: 'Capture an authorized real-time screenshot of the Windows desktop for visual inspection.',
    parameters: {
      displayId: {
        type: 'string',
        description: 'Target display ID (defaults to primary display).',
        required: false,
      },
      isSensitive: {
        type: 'boolean',
        description: 'Whether capture contains sensitive personal data.',
        required: false,
      },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'LOW',
    tauriCommand: 'capture_screen',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'capture_region',
    description: 'Capture a bounded rectangular region of the Windows screen.',
    parameters: {
      x: {
        type: 'number',
        description: 'Left coordinate in pixels.',
        required: true,
      },
      y: {
        type: 'number',
        description: 'Top coordinate in pixels.',
        required: true,
      },
      width: {
        type: 'number',
        description: 'Region width in pixels.',
        required: true,
      },
      height: {
        type: 'number',
        description: 'Region height in pixels.',
        required: true,
      },
      displayId: {
        type: 'string',
        description: 'Target display ID.',
        required: false,
      },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'LOW',
    tauriCommand: 'capture_screen',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'computer_click',
    description: 'Dispatch a native mouse click on the Windows desktop.',
    parameters: {
      x: { type: 'number', description: 'Screen X coordinate', required: true },
      y: { type: 'number', description: 'Screen Y coordinate', required: true },
      button: { type: 'string', description: 'Mouse button (left, right, middle)', required: false },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'MEDIUM',
    tauriCommand: 'computer_action',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'NEVER',
  },
  {
    name: 'computer_type',
    description: 'Type text via native Windows keystrokes.',
    parameters: {
      text: { type: 'string', description: 'Text to type', required: true },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'MEDIUM',
    tauriCommand: 'computer_action',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'NEVER',
  },
  {
    name: 'computer_key_press',
    description: 'Dispatch a single key press on Windows.',
    parameters: {
      key: { type: 'string', description: 'Key name (e.g. Enter, Escape, Tab)', required: true },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'MEDIUM',
    tauriCommand: 'computer_action',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'NEVER',
  },
  {
    name: 'computer_hotkey',
    description: 'Dispatch a key combination on Windows.',
    parameters: {
      keys: {
        type: 'array',
        description: 'Array of key names to press simultaneously (e.g. ["Control", "s"]).',
        required: true,
        items: {
          type: 'string',
          description: 'A key name in the combination.',
        },
      },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'HIGH',
    tauriCommand: 'computer_action',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'NEVER',
  },
  {
    name: 'inspect_windows_ui',
    description: 'Inspect real Windows UI elements, top-level windows, and controls via UI Automation.',
    parameters: {
      application_id: { type: 'string', description: 'Filter by target application ID (e.g. notepad, calculator, blender)', required: false },
      window_id: { type: 'string', description: 'Filter by target window ID', required: false },
      process_id: { type: 'number', description: 'Filter by process ID', required: false },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'LOW',
    tauriCommand: 'inspect_windows_ui',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'computer_focus_window',
    description: 'Activate and bring a target application window into the foreground on Windows.',
    parameters: {
      handle: { type: 'number', description: 'Target window HWND handle', required: false },
      window_id: { type: 'string', description: 'Target window identifier', required: false },
      process_id: { type: 'number', description: 'Target process ID', required: false },
      title_match: { type: 'string', description: 'Window title search string', required: false },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'LOW',
    tauriCommand: 'window_activate',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'computer_read_clipboard',
    description: 'Read the current text from the Windows system clipboard.',
    parameters: {} satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'LOW',
    tauriCommand: 'clipboard_read',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO',
  },
  {
    name: 'computer_write_clipboard',
    description: 'Write text to the Windows system clipboard.',
    parameters: {
      text: { type: 'string', description: 'Text to write to clipboard', required: true },
    } satisfies Record<string, ParameterDef>,
    category: 'system',
    risk: 'MEDIUM',
    tauriCommand: 'clipboard_write',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'NEVER',
  },
];

/** Singleton — import and use directly. */
export const ToolRegistry = new ToolRegistryImpl();
ToolRegistry.registerMany(BUILT_IN_TOOLS);

