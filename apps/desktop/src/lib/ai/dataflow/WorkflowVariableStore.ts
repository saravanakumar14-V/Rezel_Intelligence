/**
 * Rezel 11.4B — Workflow Variable Store
 *
 * Scoped in-memory & persistent store for runtime variables and step outputs.
 * Enforces provenance tracking, namespace isolation, type validation,
 * and sensitive data redaction.
 */

import type {
  WorkflowVariable,
  VariableType,
  VariableProvenance,
  WorkflowStepOutputDefinition,
} from './types';
import { DataFlowError } from './types';

function inferVariableType(val: unknown): VariableType {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  const t = typeof val;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') {
    return t;
  }
  return 'string';
}

export class WorkflowVariableStoreImpl {
  /** Map of workflowId -> Map of variableName -> WorkflowVariable */
  private store = new Map<string, Map<string, WorkflowVariable>>();

  /**
   * Sets a variable in the workflow store.
   */
  setVariable(
    workflowId: string,
    name: string,
    value: unknown,
    source: VariableProvenance,
    isSensitive: boolean = false,
    expectedType?: VariableType
  ): WorkflowVariable {
    let workflowVars = this.store.get(workflowId);
    if (!workflowVars) {
      workflowVars = new Map<string, WorkflowVariable>();
      this.store.set(workflowId, workflowVars);
    }

    const actualType = inferVariableType(value);
    if (expectedType && expectedType !== actualType && actualType !== 'null') {
      throw new DataFlowError(
        'VARIABLE_TYPE_MISMATCH',
        `Variable '${name}' expected type ${expectedType}, got ${actualType} (${JSON.stringify(value)})`,
        { name, expectedType, actualType, value }
      );
    }

    // Check overwrite permissions for step outputs
    if (name.startsWith('steps.')) {
      const existing = workflowVars.get(name);
      if (existing && existing.source.stepId && existing.source.stepId !== source.stepId) {
        throw new DataFlowError(
          'INVALID_BINDING',
          `Step '${source.stepId}' cannot overwrite step output namespace of '${existing.source.stepId}': ${name}`,
          { name, attemptedBy: source.stepId, ownedBy: existing.source.stepId }
        );
      }
    }

    const variable: WorkflowVariable = {
      name,
      type: expectedType || actualType,
      value: value !== undefined ? JSON.parse(JSON.stringify(value)) : undefined, // Deep clone for immutability
      source: {
        ...source,
        updatedAt: Date.now(),
      },
      isSensitive,
    };

    workflowVars.set(name, variable);
    return variable;
  }

  /**
   * Initializes input parameters for a workflow instance.
   */
  initParameters(workflowId: string, params: Record<string, unknown>): void {
    const now = Date.now();
    for (const [key, val] of Object.entries(params)) {
      // Register both params.KEY and direct KEY for backwards compatibility
      this.setVariable(
        workflowId,
        `params.${key}`,
        val,
        { workflowId, sourceType: 'PARAMETER', createdAt: now, updatedAt: now }
      );
      this.setVariable(
        workflowId,
        key,
        val,
        { workflowId, sourceType: 'PARAMETER', createdAt: now, updatedAt: now }
      );
    }
  }

  /**
   * Publishes structured step outputs upon step completion.
   */
  setStepOutputs(
    workflowId: string,
    stepId: string,
    outputs: Record<string, unknown>,
    outputDefs?: WorkflowStepOutputDefinition[]
  ): WorkflowVariable[] {
    const now = Date.now();
    const results: WorkflowVariable[] = [];

    const defMap = new Map<string, WorkflowStepOutputDefinition>();
    if (outputDefs) {
      for (const d of outputDefs) {
        defMap.set(d.name, d);
      }
    }

    for (const [outName, val] of Object.entries(outputs)) {
      const def = defMap.get(outName);
      const varName = `steps.${stepId}.outputs.${outName}`;

      const registered = this.setVariable(
        workflowId,
        varName,
        val,
        {
          workflowId,
          stepId,
          sourceType: 'STEP_OUTPUT',
          createdAt: now,
          updatedAt: now,
        },
        def?.isSensitive ?? false,
        def?.type
      );

      results.push(registered);
    }

    return results;
  }

  /**
   * Retrieves a WorkflowVariable by name.
   */
  getVariable(workflowId: string, name: string): WorkflowVariable | undefined {
    const workflowVars = this.store.get(workflowId);
    return workflowVars?.get(name);
  }

  /**
   * Retrieves the raw value of a variable.
   */
  getValue(workflowId: string, name: string): unknown {
    const variable = this.getVariable(workflowId, name);
    return variable ? JSON.parse(JSON.stringify(variable.value)) : undefined;
  }

  /**
   * Returns all variables for a workflow.
   */
  getAllVariables(workflowId: string): Record<string, WorkflowVariable> {
    const workflowVars = this.store.get(workflowId);
    if (!workflowVars) return {};

    const out: Record<string, WorkflowVariable> = {};
    for (const [k, v] of workflowVars.entries()) {
      out[k] = JSON.parse(JSON.stringify(v));
    }
    return out;
  }

  /**
   * Returns all variables with sensitive values redacted for logs and telemetry.
   */
  getRedactedVariables(workflowId: string): Record<string, unknown> {
    const workflowVars = this.store.get(workflowId);
    if (!workflowVars) return {};

    const out: Record<string, unknown> = {};
    for (const [k, v] of workflowVars.entries()) {
      out[k] = v.isSensitive ? '[REDACTED]' : v.value;
    }
    return out;
  }

  /**
   * Clears variables for a workflow.
   */
  clearWorkflow(workflowId: string): void {
    this.store.delete(workflowId);
  }
}

export const WorkflowVariableStore = new WorkflowVariableStoreImpl();
