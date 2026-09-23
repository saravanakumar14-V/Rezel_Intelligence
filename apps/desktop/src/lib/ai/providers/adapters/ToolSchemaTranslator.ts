/**
 * Rezel OS — Multi-Provider Tool Schema Translator (Milestone 11.2B)
 *
 * Converts provider-neutral Rezel ToolDefinitions into vendor-specific tool schemas:
 * - Gemini: FunctionDeclaration { name, description, parameters }
 * - OpenAI / Ollama: { type: 'function', function: { name, description, parameters } }
 * - Anthropic: { name, description, input_schema }
 *
 * Includes pre-dispatch schema validation to prevent invalid schemas from reaching providers.
 */

import type { ToolDefinition, ParameterDef } from '../../types';
import { ProviderToolNamePolicy } from '../ProviderToolName';

// ─── Schema Validation Types ──────────────────────────────────────────────────

export interface SchemaValidationError {
  toolName: string;
  paramPath: string;
  error: string;
}

export class ToolSchemaValidationError extends Error {
  readonly errors: SchemaValidationError[];
  constructor(errors: SchemaValidationError[]) {
    const summary = errors.map(e => `  ${e.toolName}.${e.paramPath}: ${e.error}`).join('\n');
    super(`Tool schema certification failed with ${errors.length} error(s):\n${summary}`);
    this.name = 'ToolSchemaValidationError';
    this.errors = errors;
  }
}

export class ToolSchemaTranslator {
  // ─── Pre-Dispatch Schema Certification ────────────────────────────────────

  /**
   * Validates a single ParameterDef recursively.
   * Returns an array of errors (empty = valid).
   */
  static validateParam(param: ParameterDef, toolName: string, paramPath: string): SchemaValidationError[] {
    const errors: SchemaValidationError[] = [];

    if (!param) {
      errors.push({ toolName, paramPath, error: 'Parameter definition is null/undefined' });
      return errors;
    }

    const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
    if (!param.type || !validTypes.includes(param.type)) {
      errors.push({ toolName, paramPath, error: `Invalid type '${param.type}'. Must be one of: ${validTypes.join(', ')}` });
    }

    if (!param.description) {
      errors.push({ toolName, paramPath, error: 'Missing description' });
    }

    if (param.type === 'array') {
      if (!param.items) {
        errors.push({ toolName, paramPath, error: 'ARRAY parameter requires an items schema' });
      } else {
        errors.push(...ToolSchemaTranslator.validateParam(param.items as ParameterDef, toolName, `${paramPath}.items`));
      }
    }

    return errors;
  }

  /**
   * Certifies all tools before schema compilation.
   * Returns all validation errors across all tools.
   */
  static certifyAll(tools: Array<ToolDefinition | any>): SchemaValidationError[] {
    const errors: SchemaValidationError[] = [];

    for (const tool of tools) {
      const toolName = tool.id || tool.name || 'UNNAMED';
      if (!toolName || toolName === 'UNNAMED') {
        errors.push({ toolName: 'UNNAMED', paramPath: '', error: 'Tool has no name or id' });
        continue;
      }

      if (!tool.description) {
        errors.push({ toolName, paramPath: '', error: 'Tool has no description' });
      }

      if (tool.parameters) {
        for (const [key, param] of Object.entries(tool.parameters)) {
          errors.push(...ToolSchemaTranslator.validateParam(param as ParameterDef, toolName, key));
        }
      }
    }

    return errors;
  }

  // ─── Gemini Function Declarations ──────────────────────────────────────────

  static toGemini(tools: Array<ToolDefinition | any>): Array<{ functionDeclarations: any[] }> {
    if (!tools || tools.length === 0) return [];

    // Pre-dispatch certification
    const validationErrors = ToolSchemaTranslator.certifyAll(tools);
    if (validationErrors.length > 0) {
      console.error('[ToolSchemaTranslator] Schema certification failures:', validationErrors);
      throw new ToolSchemaValidationError(validationErrors);
    }
    
    // Register tool names and validate for Gemini
    ProviderToolNamePolicy.registerTools(tools, 'GEMINI');

    const functionDeclarations = tools.map((tool) => {
      const canonicalId = tool.id || tool.name;
      const providerName = ProviderToolNamePolicy.getProviderName(canonicalId, 'GEMINI');
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, param] of Object.entries(tool.parameters || {})) {
        properties[key] = ToolSchemaTranslator.convertGeminiParam(param as ParameterDef);
        if ((param as any)?.required) {
          required.push(key);
        }
      }

      return {
        name: providerName,
        description: tool.description || `Execute ${canonicalId}`,
        parameters: {
          type: 'OBJECT',
          properties,
          required: required.length > 0 ? required : undefined,
        },
      };
    });

    return [{ functionDeclarations }];
  }

  private static convertGeminiParam(param: ParameterDef): any {
    const typeMap: Record<string, string> = {
      string: 'STRING',
      number: 'NUMBER',
      boolean: 'BOOLEAN',
      object: 'OBJECT',
      array: 'ARRAY',
    };

    const result: Record<string, any> = {
      type: typeMap[param?.type] || 'STRING',
      description: param?.description || '',
    };

    if (param?.enum) {
      result.enum = param.enum;
    }

    if (param?.type === 'array' && param.items) {
      result.items = ToolSchemaTranslator.convertGeminiParam(param.items as ParameterDef);
    }

    return result;
  }

  // ─── OpenAI / Ollama Tools Format ──────────────────────────────────────────

  static toOpenAI(tools: Array<ToolDefinition | any>): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
      };
    };
  }> {
    if (!tools || tools.length === 0) return [];

    // Pre-dispatch certification
    const validationErrors = ToolSchemaTranslator.certifyAll(tools);
    if (validationErrors.length > 0) {
      console.error('[ToolSchemaTranslator] Schema certification failures:', validationErrors);
      throw new ToolSchemaValidationError(validationErrors);
    }

    ProviderToolNamePolicy.registerTools(tools, 'OPENAI');

    return tools.map((tool) => {
      const canonicalId = tool.id || tool.name;
      const providerName = ProviderToolNamePolicy.getProviderName(canonicalId, 'OPENAI');
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, param] of Object.entries(tool.parameters || {})) {
        properties[key] = ToolSchemaTranslator.convertJsonSchemaParam(param as ParameterDef);
        if ((param as any)?.required) {
          required.push(key);
        }
      }

      return {
        type: 'function' as const,
        function: {
          name: providerName,
          description: tool.description || `Execute ${canonicalId}`,
          parameters: {
            type: 'object' as const,
            properties,
            required: required.length > 0 ? required : undefined,
          },
        },
      };
    });
  }

  // ─── Anthropic Tool Format ─────────────────────────────────────────────────

  static toAnthropic(tools: Array<ToolDefinition | any>): Array<{
    name: string;
    description: string;
    input_schema: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  }> {
    if (!tools || tools.length === 0) return [];

    // Pre-dispatch certification
    const validationErrors = ToolSchemaTranslator.certifyAll(tools);
    if (validationErrors.length > 0) {
      console.error('[ToolSchemaTranslator] Schema certification failures:', validationErrors);
      throw new ToolSchemaValidationError(validationErrors);
    }

    ProviderToolNamePolicy.registerTools(tools, 'ANTHROPIC');

    return tools.map((tool) => {
      const canonicalId = tool.id || tool.name;
      const providerName = ProviderToolNamePolicy.getProviderName(canonicalId, 'ANTHROPIC');
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, param] of Object.entries(tool.parameters || {})) {
        properties[key] = ToolSchemaTranslator.convertJsonSchemaParam(param as ParameterDef);
        if ((param as any)?.required) {
          required.push(key);
        }
      }

      return {
        name: providerName,
        description: tool.description || `Execute ${canonicalId}`,
        input_schema: {
          type: 'object' as const,
          properties,
          required: required.length > 0 ? required : undefined,
        },
      };
    });
  }

  private static convertJsonSchemaParam(param: ParameterDef): any {
    const result: Record<string, any> = {
      type: param?.type || 'string',
      description: param?.description || '',
    };

    if (param?.enum) {
      result.enum = param.enum;
    }

    if (param?.type === 'array' && param.items) {
      result.items = ToolSchemaTranslator.convertJsonSchemaParam(param.items as ParameterDef);
    }

    return result;
  }
}
