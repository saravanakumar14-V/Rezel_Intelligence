/**
 * Rezel 11.4B — Workflow Data Flow Resolver
 *
 * Resolves input bindings, interpolates runtime variables and step outputs,
 * constructs data dependency graphs, and detects circular data dependencies.
 */

import type { PlanStep } from '../types';
import type { DataDependencyGraph, DataFlowPreview } from './types';
import { DataFlowError } from './types';
import { WorkflowVariableStore } from './WorkflowVariableStore';

export class WorkflowDataFlowResolver {
  /**
   * Evaluates a property path against an object (e.g. "outputs.objectIds[0]" or "scene.name").
   */
  static resolvePath(root: any, path: string): unknown {
    if (root === null || root === undefined) return undefined;
    if (!path || path.trim() === '') return root;

    const parts = path.replace(/\[(\w+)\]/g, '.$1').split('.');
    let current = root;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }

    return current;
  }

  /**
   * Resolves a single binding expression like `{{steps.create_scene.outputs.sceneId}}` or `{{params.COUNT}}`.
   * If the entire string is a single binding, preserves the original primitive/object type.
   */
  static resolveBinding(
    expression: unknown,
    workflowId: string,
    fallbackParams: Record<string, unknown> = {}
  ): unknown {
    if (expression === null || expression === undefined) return expression;

    if (typeof expression === 'string') {
      const trimmed = expression.trim();
      const singleMatch = trimmed.match(/^\{\{([A-Za-z0-9_.[\]]+)\}\}$/);

      if (singleMatch) {
        const fullPath = singleMatch[1];
        const val = this.lookupVariable(fullPath, workflowId, fallbackParams);
        if (val === undefined) {
          throw new DataFlowError('VARIABLE_NOT_FOUND', `Required variable not found: '${fullPath}'`, {
            fullPath,
            workflowId,
          });
        }
        return val;
      }

      // String interpolation for embedded placeholders
      return expression.replace(/\{\{([A-Za-z0-9_.[\]]+)\}\}/g, (match, fullPath) => {
        const val = this.lookupVariable(fullPath, workflowId, fallbackParams);
        if (val === undefined) {
          return match;
        }
        return typeof val === 'object' ? JSON.stringify(val) : String(val);
      });
    }

    if (Array.isArray(expression)) {
      return expression.map((item) => this.resolveBinding(item, workflowId, fallbackParams));
    }

    if (typeof expression === 'object') {
      const res: Record<string, any> = {};
      for (const [k, v] of Object.entries(expression)) {
        res[k] = this.resolveBinding(v, workflowId, fallbackParams);
      }
      return res;
    }

    return expression;
  }

  /**
   * Looks up a variable by path from the WorkflowVariableStore or fallback parameters.
   */
  static lookupVariable(
    fullPath: string,
    workflowId: string,
    fallbackParams: Record<string, unknown> = {}
  ): unknown {
    // 1. Direct match in WorkflowVariableStore
    const direct = WorkflowVariableStore.getValue(workflowId, fullPath);
    if (direct !== undefined) return direct;

    // 2. Check if path starts with steps.<stepId>.outputs.<outName>...
    if (fullPath.startsWith('steps.')) {
      const normalizedPath = fullPath.replace(/\[(\w+)\]/g, '.$1');
      const parts = normalizedPath.split('.');
      if (parts.length >= 4 && parts[2] === 'outputs') {
        const baseKey = `steps.${parts[1]}.outputs.${parts[3]}`;
        const baseVal = WorkflowVariableStore.getValue(workflowId, baseKey);
        if (baseVal !== undefined) {
          if (parts.length > 4) {
            const subPath = parts.slice(4).join('.');
            return this.resolvePath(baseVal, subPath);
          }
          return baseVal;
        }
      }
    }

    // 3. Check if path starts with params.<paramName>
    if (fullPath.startsWith('params.')) {
      const paramName = fullPath.substring(7);
      if (paramName in fallbackParams) {
        return fallbackParams[paramName];
      }
    }

    // 4. Fallback params direct check
    if (fullPath in fallbackParams) {
      return fallbackParams[fullPath];
    }

    return undefined;
  }

  /**
   * Resolves all input bindings for a step before execution.
   */
  static resolveStepInputs(
    step: PlanStep,
    workflowId: string,
    fallbackParams: Record<string, unknown> = {}
  ): {
    resolvedArgs: Record<string, unknown>;
    missingOutputs: string[];
    errors: string[];
  } {
    const missingOutputs: string[] = [];
    const errors: string[] = [];
    let resolvedArgs: Record<string, unknown> = {};

    try {
      if (step.toolArgs) {
        resolvedArgs = this.resolveBinding(step.toolArgs, workflowId, fallbackParams) as Record<string, unknown>;
      }
    } catch (err: any) {
      if (err instanceof DataFlowError) {
        errors.push(err.message);
        if (err.code === 'VARIABLE_NOT_FOUND') {
          missingOutputs.push(String(err.details?.fullPath || err.message));
        }
      } else {
        errors.push(err?.message || String(err));
      }
    }

    return {
      resolvedArgs,
      missingOutputs,
      errors,
    };
  }

  /**
   * Constructs the data dependency graph from steps by parsing `{{steps.<stepId>...}}` references.
   */
  static buildDataDependencyGraph(steps: PlanStep[]): DataDependencyGraph {
    const stepIds = steps.map((s) => s.id);
    const dataDependencies = new Map<string, Set<string>>();

    for (const step of steps) {
      const producerSet = new Set<string>();
      dataDependencies.set(step.id, producerSet);

      const json = JSON.stringify(step.toolArgs ?? {});
      const matches = json.matchAll(/\{\{steps\.([A-Za-z0-9_]+)\./g);

      for (const match of matches) {
        const producerStepId = match[1];
        if (producerStepId !== step.id && stepIds.includes(producerStepId)) {
          producerSet.add(producerStepId);
        }
      }
    }

    const circularDependencies = this.detectCycles({
      steps: stepIds,
      dataDependencies,
    });

    return {
      steps: stepIds,
      dataDependencies,
      circularDependencies,
    };
  }

  /**
   * Detects cycles in the data dependency graph using DFS.
   */
  static detectCycles(graph: { steps: string[]; dataDependencies: Map<string, Set<string>> }): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.dataDependencies.get(node) || new Set<string>();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), neighbor]);
          }
        }
      }

      recursionStack.delete(node);
    };

    for (const stepId of graph.steps) {
      if (!visited.has(stepId)) {
        dfs(stepId, []);
      }
    }

    return cycles;
  }

  /**
   * Generates a preview summary of data-flow outputs, bindings, and dependencies.
   */
  static generatePreview(steps: PlanStep[]): DataFlowPreview {
    const graph = this.buildDataDependencyGraph(steps);
    const declaredOutputs: Record<string, any[]> = {};
    const bindings: Record<string, Record<string, string>> = {};
    const dataDepsRecord: Record<string, string[]> = {};

    for (const step of steps) {
      const defs = (step as any).outputDefinitions || (step as any).outputs;
      if (defs) {
        declaredOutputs[step.id] = defs;
      }

      const stepBindings: Record<string, string> = {};
      if (step.toolArgs) {
        for (const [k, v] of Object.entries(step.toolArgs)) {
          if (typeof v === 'string' && v.includes('{{')) {
            stepBindings[k] = v;
          }
        }
      }
      bindings[step.id] = stepBindings;

      const deps = graph.dataDependencies.get(step.id);
      dataDepsRecord[step.id] = deps ? Array.from(deps) : [];
    }

    return {
      declaredOutputs,
      bindings,
      dataDependencies: dataDepsRecord,
      hasCycles: graph.circularDependencies.length > 0,
      cycles: graph.circularDependencies,
    };
  }
}
