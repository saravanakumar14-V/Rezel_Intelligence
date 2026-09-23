/**
 * REZEL PHASE 16 — WORKFLOW TEMPLATE COMPILER & BINDING ENGINE
 *
 * Compiles a declarative parameterized WorkflowTemplate and runtime inputs
 * into an executable Phase 14 WorkflowDefinition.
 *
 * Invariants:
 * - NO eval(), NO Function(), NO dynamic code execution.
 * - Enforces parameter validation against declared types/schemas.
 * - Rejects unbound required parameters.
 * - Preserves provenance and outputs Phase 14 compliant WorkflowDefinition.
 */

import type {
  WorkflowTemplate,
  WorkflowParameter,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowValidationError,
} from '../types';
import { WorkflowGraphValidator } from '../WorkflowGraphValidator';

export class TemplateCompilationError extends Error {
  readonly errors: WorkflowValidationError[];

  constructor(message: string, errors: WorkflowValidationError[] = []) {
    super(`[TEMPLATE_COMPILATION_ERROR] ${message}`);
    this.name = 'TemplateCompilationError';
    this.errors = errors;
  }
}

export interface CompileTemplateResult {
  readonly success: boolean;
  readonly definition?: WorkflowDefinition;
  readonly errors: WorkflowValidationError[];
  readonly warnings: WorkflowValidationError[];
}

export class TemplateCompiler {
  /**
   * Compiles and binds a WorkflowTemplate with input values into a Phase 14 WorkflowDefinition.
   */
  static compile(
    template: WorkflowTemplate,
    inputValues: Record<string, unknown> = {}
  ): CompileTemplateResult {
    const errors: WorkflowValidationError[] = [];
    const warnings: WorkflowValidationError[] = [];

    // 1. Basic structural validation
    if (!template || !template.id) {
      errors.push({
        code: 'INVALID_TEMPLATE',
        message: 'Template is null or missing an id',
        severity: 'ERROR',
      });
      return { success: false, errors, warnings };
    }

    if (!template.steps || !Array.isArray(template.steps) || template.steps.length === 0) {
      errors.push({
        code: 'EMPTY_TEMPLATE_STEPS',
        message: `Template '${template.id}' has no steps declared`,
        severity: 'ERROR',
      });
      return { success: false, errors, warnings };
    }

    // 2. Normalize declared parameters / inputs
    const declaredParams: WorkflowParameter[] = [];
    if (template.parameters && Array.isArray(template.parameters)) {
      declaredParams.push(...template.parameters);
    }
    if (template.inputs && Array.isArray(template.inputs)) {
      for (const inp of template.inputs) {
        if (!declaredParams.some((p) => p.name === inp.name)) {
          declaredParams.push({
            name: inp.name,
            type: inp.type as any,
            description: inp.description,
            required: inp.required,
            defaultValue: inp.defaultValue,
          });
        }
      }
    }

    // 3. Validate and resolve input values against parameter schemas
    const resolvedInputs: Record<string, unknown> = {};

    for (const param of declaredParams) {
      let val = inputValues[param.name];
      if (val === undefined || val === null) {
        val = param.defaultValue;
      }

      if (val === undefined || val === null) {
        if (param.required) {
          errors.push({
            code: 'MISSING_REQUIRED_INPUT',
            message: `Required parameter '${param.name}' is missing for template '${template.id}'`,
            severity: 'ERROR',
          });
          continue;
        }
      } else {
        // Validate type
        const typeCheck = this.validateParamType(param, val);
        if (!typeCheck.valid) {
          errors.push({
            code: 'INVALID_INPUT_TYPE',
            message: `Parameter '${param.name}' validation failed: ${typeCheck.error}`,
            severity: 'ERROR',
          });
          continue;
        }
        resolvedInputs[param.name] = val;
      }
    }

    // Also copy any undeclared inputs with warning if needed
    for (const [key, val] of Object.entries(inputValues)) {
      if (!(key in resolvedInputs)) {
        resolvedInputs[key] = val;
      }
    }

    if (errors.length > 0) {
      return { success: false, errors, warnings };
    }

    // 4. Compile steps and substitute parameters
    const compiledSteps: WorkflowStep[] = [];
    for (const step of template.steps) {
      const boundParams = this.substituteParameters(step.parameters || {}, resolvedInputs);

      const compiledStep: WorkflowStep = {
        id: step.id,
        name: step.name,
        description: step.description,
        applicationId: step.applicationId,
        operationId: step.operationId,
        parameters: boundParams,
        dependencies: step.dependencies || [],
        preconditions: step.preconditions || [],
        postconditions: step.postconditions || [],
        timeoutMs: step.timeoutMs,
        outputArtifacts: step.outputArtifacts,
      };

      // If conditions are present, attach them as custom metadata or property
      if (step.conditions && step.conditions.length > 0) {
        (compiledStep as any).conditions = step.conditions;
      }

      compiledSteps.push(compiledStep);
    }

    // 5. Build Phase 14 WorkflowDefinition
    const definition: WorkflowDefinition = {
      id: template.id,
      version: template.version,
      name: template.name,
      description: template.description,
      inputs: declaredParams.map((p) => ({
        name: p.name,
        type: p.type as any,
        description: p.description,
        required: p.required,
        defaultValue: p.defaultValue,
      })),
      outputs: template.outputs,
      steps: compiledSteps,
      metadata: {
        ...(template.metadata || {}),
        compiledFromTemplateId: template.id,
        compiledAt: Date.now(),
        boundInputs: resolvedInputs,
      },
    };

    // 6. Validate resulting definition graph with Phase 14 WorkflowGraphValidator
    const graphValidation = WorkflowGraphValidator.validate(definition);
    if (!graphValidation.valid) {
      return {
        success: false,
        errors: [...errors, ...graphValidation.errors],
        warnings: [...warnings, ...graphValidation.warnings],
      };
    }

    return {
      success: true,
      definition,
      errors,
      warnings,
    };
  }

  /**
   * Safely substitutes `{{inputs.name}}` or `{{params.name}}` within parameters without eval.
   */
  private static substituteParameters(
    params: Record<string, unknown>,
    inputs: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      result[key] = this.substituteValue(value, inputs);
    }

    return result;
  }

  /**
   * Recursively substitutes tokens in a value.
   */
  private static substituteValue(
    value: unknown,
    inputs: Record<string, unknown>
  ): unknown {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      // If the whole string is an exact match for {{inputs.param}} or {{params.param}}
      const exactMatch = trimmed.match(/^\{\{\s*(?:inputs|params)\.([a-zA-Z0-9_]+)\s*\}\}$/);
      if (exactMatch) {
        const paramName = exactMatch[1];
        if (paramName in inputs) {
          return inputs[paramName];
        }
      }

      // Regex replace embedded tokens
      return value.replace(/\{\{\s*(?:inputs|params)\.([a-zA-Z0-9_]+)\s*\}\}/g, (_match, paramName) => {
        if (paramName in inputs) {
          const v = inputs[paramName];
          return v !== undefined && v !== null ? String(v) : '';
        }
        return _match; // Keep untouched if not found (or for artifact references)
      });
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.substituteValue(item, inputs));
    }

    if (value !== null && typeof value === 'object') {
      const objResult: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        objResult[k] = this.substituteValue(v, inputs);
      }
      return objResult;
    }

    return value;
  }

  /**
   * Validates parameter type against value.
   */
  private static validateParamType(
    param: WorkflowParameter,
    val: unknown
  ): { valid: boolean; error?: string } {
    switch (param.type) {
      case 'string':
      case 'FILE':
        if (typeof val !== 'string') {
          return { valid: false, error: `Expected string, got ${typeof val}` };
        }
        if (param.type === 'FILE') {
          // Reject directory traversal or control characters in file paths
          if (val.includes('..') || /[\x00-\x1f]/.test(val)) {
            return { valid: false, error: 'Path traversal or control characters in FILE parameter' };
          }
        }
        return { valid: true };

      case 'number':
        if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
          return { valid: false, error: `Expected finite number, got ${val}` };
        }
        return { valid: true };

      case 'boolean':
        if (typeof val !== 'boolean') {
          return { valid: false, error: `Expected boolean, got ${typeof val}` };
        }
        return { valid: true };

      case 'array':
        if (!Array.isArray(val)) {
          return { valid: false, error: `Expected array, got ${typeof val}` };
        }
        return { valid: true };

      case 'object':
        if (val === null || typeof val !== 'object' || Array.isArray(val)) {
          return { valid: false, error: `Expected object, got ${typeof val}` };
        }
        return { valid: true };

      default:
        return { valid: true };
    }
  }
}
