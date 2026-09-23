/**
 * REZEL PHASE 14 — WORKFLOW GRAPH VALIDATOR
 *
 * Enforces strict static validation of workflow definitions, dependency graph
 * integrity, cycle detection, application & operation registration checks,
 * and artifact dependency verification.
 */

import { ApplicationProfileRegistry } from '../profiles/ApplicationProfileRegistry';
import type {
  WorkflowDefinition,
  WorkflowDryRunResult,
  WorkflowValidationError,
} from './types';

export class WorkflowGraphValidator {
  /**
   * Statically validates a WorkflowDefinition and returns a dry-run report.
   */
  static validate(definition: WorkflowDefinition): WorkflowDryRunResult {
    const errors: WorkflowValidationError[] = [];
    const warnings: WorkflowValidationError[] = [];

    // 1. Definition-level validation
    if (!definition.id || typeof definition.id !== 'string') {
      errors.push({
        code: 'INVALID_WORKFLOW_ID',
        message: 'WorkflowDefinition must have a non-empty string id',
        severity: 'ERROR',
      });
    }

    if (definition.version === undefined || definition.version === null) {
      errors.push({
        code: 'INVALID_WORKFLOW_VERSION',
        message: 'WorkflowDefinition must specify a version',
        severity: 'ERROR',
      });
    }

    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
      errors.push({
        code: 'EMPTY_STEPS',
        message: 'WorkflowDefinition must contain at least one step',
        severity: 'ERROR',
      });
      return {
        valid: false,
        definitionId: definition.id || 'unknown',
        version: definition.version || 1,
        errors,
        warnings,
        resolvedOrder: [],
        applications: [],
      };
    }

    // 2. Duplicate Step IDs check
    const stepIdSet = new Set<string>();
    for (const step of definition.steps) {
      if (!step.id || typeof step.id !== 'string') {
        errors.push({
          stepId: step.id,
          code: 'INVALID_STEP_ID',
          message: 'Step id must be a non-empty string',
          severity: 'ERROR',
        });
        continue;
      }
      if (stepIdSet.has(step.id)) {
        errors.push({
          stepId: step.id,
          code: 'DUPLICATE_STEP_ID',
          message: `Duplicate step ID detected: '${step.id}'`,
          severity: 'ERROR',
        });
      }
      stepIdSet.add(step.id);
    }

    // 3. Dependencies & Graph Validation
    const dependencyMap = new Map<string, string[]>();
    for (const step of definition.steps) {
      const deps = step.dependencies || [];
      dependencyMap.set(step.id, deps);

      for (const depId of deps) {
        if (depId === step.id) {
          errors.push({
            stepId: step.id,
            code: 'SELF_DEPENDENCY',
            message: `Step '${step.id}' cannot depend on itself`,
            severity: 'ERROR',
          });
        } else if (!stepIdSet.has(depId)) {
          errors.push({
            stepId: step.id,
            code: 'MISSING_DEPENDENCY',
            message: `Step '${step.id}' references non-existent dependency step '${depId}'`,
            severity: 'ERROR',
          });
        }
      }
    }

    // 4. Cycle Detection using DFS
    const cycles = this.detectCycles(Array.from(stepIdSet), dependencyMap);
    for (const cycle of cycles) {
      errors.push({
        code: 'DEPENDENCY_CYCLE',
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
        severity: 'ERROR',
      });
    }

    // 5. Application & Operation Availability Check
    const verifiedApps = new Map<string, { available: boolean; reason?: string }>();

    for (const step of definition.steps) {
      if (!step.applicationId) {
        errors.push({
          stepId: step.id,
          code: 'MISSING_APPLICATION_ID',
          message: `Step '${step.id}' is missing applicationId`,
          severity: 'ERROR',
        });
        continue;
      }

      // Check Profile Registry
      const profileRes = ApplicationProfileRegistry.resolveProfile({
        appId: step.applicationId,
      });

      if (!profileRes.profile) {
        errors.push({
          stepId: step.id,
          code: 'UNKNOWN_APPLICATION',
          message: `Step '${step.id}' references unregistered application '${step.applicationId}'`,
          severity: 'ERROR',
        });
        verifiedApps.set(step.applicationId, {
          available: false,
          reason: `No registered profile for '${step.applicationId}'`,
        });
        continue;
      }

      const profile = profileRes.profile;
      verifiedApps.set(step.applicationId, { available: true });

      // Check Operation in Profile
      if (!step.operationId) {
        errors.push({
          stepId: step.id,
          code: 'MISSING_OPERATION_ID',
          message: `Step '${step.id}' is missing operationId`,
          severity: 'ERROR',
        });
        continue;
      }

      const operation = profile.operations[step.operationId];
      if (!operation) {
        const availableOps = Object.keys(profile.operations).join(', ');
        errors.push({
          stepId: step.id,
          code: 'OPERATION_UNAVAILABLE',
          message: `Operation '${step.operationId}' does not exist in profile for '${profile.name}'. Available: [${availableOps}]`,
          severity: 'ERROR',
        });
        continue;
      }

      // Check Required Parameters
      if (operation.parameters) {
        const stepParams = step.parameters || {};
        for (const paramDef of operation.parameters) {
          if (paramDef.required && stepParams[paramDef.name] === undefined) {
            warnings.push({
              stepId: step.id,
              code: 'MISSING_REQUIRED_PARAMETER',
              message: `Operation '${operation.id}' requires parameter '${paramDef.name}'`,
              severity: 'WARNING',
            });
          }
        }
      }
    }

    // 6. Compute Topological Ordering if no cycles
    const resolvedOrder = cycles.length === 0 ? this.topologicalSort(Array.from(stepIdSet), dependencyMap) : [];

    const appsList = Array.from(verifiedApps.entries()).map(([appId, info]) => ({
      appId,
      available: info.available,
      reason: info.reason,
    }));

    return {
      valid: errors.length === 0,
      definitionId: definition.id,
      version: definition.version,
      errors,
      warnings,
      resolvedOrder,
      applications: appsList,
    };
  }

  /**
   * Detects cycles in the directed dependency graph using DFS.
   */
  private static detectCycles(
    stepIds: string[],
    dependencyMap: Map<string, string[]>
  ): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, currentPath: string[]) => {
      visited.add(node);
      recStack.add(node);
      currentPath.push(node);

      const deps = dependencyMap.get(node) || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep, [...currentPath]);
        } else if (recStack.has(dep)) {
          const startIndex = currentPath.indexOf(dep);
          if (startIndex !== -1) {
            cycles.push([...currentPath.slice(startIndex), dep]);
          }
        }
      }

      recStack.delete(node);
    };

    for (const id of stepIds) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }

    return cycles;
  }

  /**
   * Computes a topological sort (steps with zero dependencies first).
   */
  private static topologicalSort(
    stepIds: string[],
    dependencyMap: Map<string, string[]>
  ): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>(); // producer -> consumers

    for (const id of stepIds) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const [consumer, deps] of dependencyMap.entries()) {
      inDegree.set(consumer, deps.length);
      for (const producer of deps) {
        const list = adj.get(producer) || [];
        list.push(consumer);
        adj.set(producer, list);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      order.push(u);

      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        const currentDeg = inDegree.get(v)! - 1;
        inDegree.set(v, currentDeg);
        if (currentDeg === 0) {
          queue.push(v);
        }
      }
    }

    return order;
  }
}
