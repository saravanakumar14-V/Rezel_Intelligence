/**
 * Rezel 11.4A — Template Parameter Validator & Interpolator
 *
 * Enforces strict pre-execution parameter verification:
 * - Checks required parameter presence
 * - Performs type validation (string, number, boolean, array, object)
 * - Checks value constraints (minValue, maxValue, minLength, maxLength, pattern, allowedValues)
 * - Fills in default values
 * - Performs safe string interpolation {{PARAM_NAME}} on tool arguments
 */

import type { WorkflowParameterDefinition, ValidationResult } from './types';

export class TemplateValidator {
  /**
   * Validates and resolves parameters against template parameter definitions.
   */
  static validate(
    definitions: WorkflowParameterDefinition[],
    inputs: Record<string, unknown>
  ): ValidationResult {
    const errors: string[] = [];
    const resolved: Record<string, unknown> = {};

    for (const def of definitions) {
      let val = inputs[def.name];

      // 1. Missing required check & default substitution
      if (val === undefined || val === null) {
        if (def.defaultValue !== undefined) {
          val = def.defaultValue;
        } else if (def.required) {
          errors.push(`Missing required parameter: '${def.name}' (${def.description})`);
          continue;
        } else {
          // Optional without default
          continue;
        }
      }

      // 2. Type validation
      const actualType = Array.isArray(val) ? 'array' : typeof val;
      if (actualType !== def.type) {
        errors.push(
          `Parameter '${def.name}' type mismatch: expected ${def.type}, got ${actualType} (${JSON.stringify(val)})`
        );
        continue;
      }

      // 3. Numeric constraints
      if (def.type === 'number') {
        const num = val as number;
        if (isNaN(num)) {
          errors.push(`Parameter '${def.name}' is NaN`);
          continue;
        }
        if (def.minValue !== undefined && num < def.minValue) {
          errors.push(`Parameter '${def.name}' value ${num} is below minimum allowed ${def.minValue}`);
        }
        if (def.maxValue !== undefined && num > def.maxValue) {
          errors.push(`Parameter '${def.name}' value ${num} exceeds maximum allowed ${def.maxValue}`);
        }
      }

      // 4. String constraints
      if (def.type === 'string') {
        const str = val as string;
        if (def.minLength !== undefined && str.length < def.minLength) {
          errors.push(`Parameter '${def.name}' length ${str.length} is shorter than minimum ${def.minLength}`);
        }
        if (def.maxLength !== undefined && str.length > def.maxLength) {
          errors.push(`Parameter '${def.name}' length ${str.length} exceeds maximum ${def.maxLength}`);
        }
        if (def.pattern) {
          const regex = new RegExp(def.pattern);
          if (!regex.test(str)) {
            errors.push(`Parameter '${def.name}' does not match required pattern ${def.pattern}`);
          }
        }
      }

      // 5. Allowed values (enum)
      if (def.allowedValues && def.allowedValues.length > 0) {
        if (!def.allowedValues.includes(val)) {
          errors.push(
            `Parameter '${def.name}' value '${String(val)}' is not in allowed values: [${def.allowedValues.map(String).join(', ')}]`
          );
        }
      }

      resolved[def.name] = val;
    }

    return {
      valid: errors.length === 0,
      errors,
      resolvedParameters: resolved,
    };
  }

  /**
   * Safely interpolates {{PARAM_NAME}} placeholders inside strings, arrays, or objects.
   */
  static interpolate(target: any, params: Record<string, unknown>): any {
    if (target === null || target === undefined) return target;

    if (typeof target === 'string') {
      return target.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (match, paramKey) => {
        if (paramKey in params) {
          const val = params[paramKey];
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
        return match;
      });
    }

    if (Array.isArray(target)) {
      return target.map((item) => this.interpolate(item, params));
    }

    if (typeof target === 'object') {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(target)) {
        result[key] = this.interpolate(val, params);
      }
      return result;
    }

    return target;
  }
}
