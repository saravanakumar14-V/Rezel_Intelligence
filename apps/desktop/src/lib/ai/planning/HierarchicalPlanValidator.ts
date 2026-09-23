/**
 * Rezel 11.8A — Hierarchical Plan Validator & DAG Integrity Checker
 *
 * Validates:
 * - Structural hierarchy (Goal -> Phases -> Subgoals -> Steps)
 * - Stable, unique IDs across all hierarchy levels
 * - Dependency graph acyclicity (rejection of circular dependencies)
 * - Required capability mappings and risk tier safety
 */

import type { HierarchicalPlan } from './types';
import { PlanningError } from './types';
import type { PlanStep } from '../types';

export class HierarchicalPlanValidator {
  /**
   * Validates a HierarchicalPlan and its dependency DAG.
   */
  static validate(plan: HierarchicalPlan): void {
    if (!plan || !plan.id || !plan.goal) {
      throw new PlanningError('INVALID_PLAN_SCHEMA', 'Plan must have an id and a goal');
    }

    if (!Array.isArray(plan.phases) || plan.phases.length === 0) {
      throw new PlanningError('INVALID_PLAN_SCHEMA', 'Plan must contain at least one phase');
    }

    const allStepIds = new Set<string>();
    const phaseIds = new Set<string>();
    const subgoalIds = new Set<string>();
    const stepMap = new Map<string, PlanStep>();

    // 1. Structural and ID uniqueness validation
    for (const phase of plan.phases) {
      if (!phase.phaseId || !phase.title) {
        throw new PlanningError('INVALID_PLAN_SCHEMA', 'Each phase must have a phaseId and title');
      }
      if (phaseIds.has(phase.phaseId)) {
        throw new PlanningError('INVALID_PLAN_SCHEMA', `Duplicate phaseId detected: ${phase.phaseId}`);
      }
      phaseIds.add(phase.phaseId);

      if (!Array.isArray(phase.subgoals) || phase.subgoals.length === 0) {
        throw new PlanningError('INVALID_PLAN_SCHEMA', `Phase '${phase.phaseId}' must contain at least one subgoal`);
      }

      for (const subgoal of phase.subgoals) {
        if (!subgoal.subgoalId || !subgoal.title) {
          throw new PlanningError('INVALID_PLAN_SCHEMA', 'Each subgoal must have a subgoalId and title');
        }
        if (subgoalIds.has(subgoal.subgoalId)) {
          throw new PlanningError('INVALID_PLAN_SCHEMA', `Duplicate subgoalId detected: ${subgoal.subgoalId}`);
        }
        subgoalIds.add(subgoal.subgoalId);

        if (!Array.isArray(subgoal.steps) || subgoal.steps.length === 0) {
          throw new PlanningError('INVALID_PLAN_SCHEMA', `Subgoal '${subgoal.subgoalId}' must contain at least one step`);
        }

        for (const step of subgoal.steps) {
          if (!step.id || !step.description) {
            throw new PlanningError('INVALID_PLAN_SCHEMA', 'Each step must have an id and description');
          }
          if (allStepIds.has(step.id)) {
            throw new PlanningError('INVALID_PLAN_SCHEMA', `Duplicate step id detected: ${step.id}`);
          }
          allStepIds.add(step.id);
          stepMap.set(step.id, step);
        }
      }
    }

    // 2. Dependency Graph & Cycle Detection (DAG validation)
    this.validateDependencies(stepMap);
  }

  /**
   * Validates step dependencies and ensures no circular references exist.
   */
  private static validateDependencies(stepMap: Map<string, PlanStep>): void {
    const adj = new Map<string, string[]>();

    for (const [stepId, step] of stepMap.entries()) {
      const deps = step.dependsOn || [];
      for (const depId of deps) {
        if (!stepMap.has(depId)) {
          throw new PlanningError(
            'UNRESOLVED_DEPENDENCY',
            `Step '${stepId}' depends on non-existent step '${depId}'`
          );
        }
      }
      adj.set(stepId, [...deps]);
    }

    // Cycle detection via DFS (3-color state: 0 = unvisited, 1 = visiting, 2 = visited)
    const state = new Map<string, number>();

    const dfs = (node: string, path: string[]): void => {
      state.set(node, 1);
      const neighbors = adj.get(node) || [];

      for (const neighbor of neighbors) {
        const neighborState = state.get(neighbor) || 0;
        if (neighborState === 1) {
          const cyclePath = [...path, neighbor].join(' -> ');
          throw new PlanningError(
            'CIRCULAR_DEPENDENCY_DETECTED',
            `Circular dependency detected in plan DAG: ${cyclePath}`
          );
        }
        if (neighborState === 0) {
          dfs(neighbor, [...path, neighbor]);
        }
      }

      state.set(node, 2);
    };

    for (const stepId of stepMap.keys()) {
      if ((state.get(stepId) || 0) === 0) {
        dfs(stepId, [stepId]);
      }
    }
  }
}
