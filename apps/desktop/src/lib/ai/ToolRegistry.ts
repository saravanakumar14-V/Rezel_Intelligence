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
    return this.getAll().map((tool) => {
      const properties: Record<string, GeminiParamSchema> = {};
      const required: string[] = [];

      for (const [key, param] of Object.entries(tool.parameters)) {
        properties[key] = {
          type: param.type === 'array' ? 'ARRAY' : param.type.toUpperCase() as GeminiParamType,
          description: param.description,
          ...(param.enum ? { enum: param.enum } : {}),
        };
        if (param.required) {
          required.push(key);
        }
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'OBJECT' as const,
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
      };
    });
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
      },
    } satisfies Record<string, ParameterDef>,
    category: 'shell',
    risk: 'HIGH',
    tauriCommand: 'run_system_command',
    toolGroup: 'shell',
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
  },
  {
    name: 'get_api_key',
    description: 'Retrieve the stored Gemini API key from the OS keyring.',
    parameters: {},
    category: 'system',
    risk: 'LOW',
    tauriCommand: 'get_api_key',
    toolGroup: 'system',
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
  },
];

/** Singleton — import and use directly. */
export const ToolRegistry = new ToolRegistryImpl();
