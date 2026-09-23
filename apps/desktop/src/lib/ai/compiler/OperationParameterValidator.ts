/**
 * Rezel 13.2.3 — Operation Parameter Validator & Safe Substitutor
 *
 * Validates operation parameter schemas against caller inputs and performs
 * strictly deterministic, non-eval placeholder substitution.
 *
 * Security Guarantee: Absolutely NO eval(), Function(), dynamic templates, or arbitrary code execution.
 */

import type { OperationParameter } from '../profiles/types';

export interface ParameterValidationResult {
  readonly valid: boolean;
  readonly validatedParams?: Record<string, unknown>;
  readonly error?: string;
}

export interface SubstitutionResult {
  readonly success: boolean;
  readonly result?: string;
  readonly error?: string;
}

export class OperationParameterValidator {
  /**
   * Validates passed arguments against the declared OperationParameter schema.
   */
  static validate(
    declaredParams: readonly OperationParameter[] = [],
    passedValues: Readonly<Record<string, unknown>> = {}
  ): ParameterValidationResult {
    const validated: Record<string, unknown> = {};
    const declaredNames = new Set(declaredParams.map((p) => p.name));

    // 1. Check for unexpected unknown arguments
    for (const key of Object.keys(passedValues)) {
      if (!declaredNames.has(key)) {
        return {
          valid: false,
          error: `Unknown argument '${key}' provided. Allowed parameters: [${Array.from(declaredNames).join(', ')}]`,
        };
      }
    }

    // 2. Validate declared parameters
    for (const param of declaredParams) {
      let value = passedValues[param.name];

      // Apply default value if value is missing
      if (value === undefined && param.defaultValue !== undefined) {
        value = param.defaultValue;
      }

      // Check required
      if (value === undefined) {
        if (param.required) {
          return {
            valid: false,
            error: `Missing required parameter '${param.name}' (${param.description})`,
          };
        }
        continue;
      }

      // Type checking
      switch (param.type) {
        case 'string':
          if (typeof value !== 'string' && typeof value !== 'object') {
            return {
              valid: false,
              error: `Parameter '${param.name}' must be a string, received ${typeof value}`,
            };
          }
          break;
        case 'number':
          if (typeof value !== 'number' || Number.isNaN(value)) {
            return {
              valid: false,
              error: `Parameter '${param.name}' must be a valid number, received ${typeof value}`,
            };
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            return {
              valid: false,
              error: `Parameter '${param.name}' must be a boolean, received ${typeof value}`,
            };
          }
          break;
        default:
          return {
            valid: false,
            error: `Unsupported parameter type '${(param as any).type}' for '${param.name}'`,
          };
      }

      validated[param.name] = value;
    }

    return {
      valid: true,
      validatedParams: validated,
    };
  }

  /**
   * Performs safe substitution:
   * 1. Direct parameter name reference (e.g. textRef: 'text' or 'path') -> value
   * 2. Placeholders (e.g. 'File: {{filename}}') -> interpolated value
   * Rejects undeclared parameters or missing values with no evaluation.
   */
  static substitute(
    template: string,
    params: Readonly<Record<string, unknown>>,
    declaredParams: readonly OperationParameter[] = []
  ): SubstitutionResult {
    const declaredNames = new Set(declaredParams.map((p) => p.name));

    // Direct parameter name match
    if (declaredNames.has(template)) {
      const val = params[template];
      if (val === undefined) {
        return {
          success: false,
          error: `Missing value for direct parameter reference '${template}'`,
        };
      }
      return {
        success: true,
        result: String(val),
      };
    }

    if (!template.includes('{{')) {
      return { success: true, result: template };
    }

    let hasError: string | undefined = undefined;

    const substituted = template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, paramName) => {
      if (hasError) return '';

      // 1. Check if parameter is declared in profile
      if (declaredParams.length > 0 && !declaredNames.has(paramName)) {
        hasError = `Template references undeclared placeholder '{{${paramName}}}'`;
        return '';
      }

      // 2. Check if value is provided
      const val = params[paramName];
      if (val === undefined) {
        hasError = `Missing value for parameter '{{${paramName}}}' in substitution`;
        return '';
      }

      return String(val);
    });

    if (hasError) {
      return { success: false, error: hasError };
    }

    return {
      success: true,
      result: substituted,
    };
  }
}
