/**
 * Rezel 11.8C — Plan Revision Engine
 *
 * Implements immutable, controlled, safe pre-execution plan revisions:
 * - Pure immutable cloning (source plan is NEVER mutated in place)
 * - Safe typed edit operations (ADD, REMOVE, UPDATE, REORDER, SKIP, PARAMETERS)
 * - Dependency safety & automatic repair options
 * - Invariant: Approval requirements cannot be downgraded on HIGH/CRITICAL risk steps
 * - Invariant: Running workflows are protected from in-place mutation
 * - Complete DAG revalidation, diff computation, risk/cost deltas, and audit tracking
 */

import type { HierarchicalPlan } from '../types';
import type { PlanStep } from '../../types';
import type {
  PlanEditOperation,
  PlanRevision,
  PlanRevisionAuditRecord,
} from './types';
import { PlanEditError } from './types';
import { HierarchicalPlanValidator } from '../HierarchicalPlanValidator';
import { PlanReviewEngine } from '../review/PlanReviewEngine';

export class PlanRevisionEngine {
  /**
   * Creates a validated, immutable draft plan revision from a source plan.
   */
  static createDraftRevision(
    sourcePlan: HierarchicalPlan,
    operations: PlanEditOperation[],
    options: { actor?: string; isWorkflowRunning?: boolean } = {}
  ): PlanRevision {
    if (options.isWorkflowRunning) {
      throw new PlanEditError(
        'RUNNING_WORKFLOW_IMMUTABLE',
        'Active running workflow plans cannot be mutated in place. Create a new plan version instead.'
      );
    }

    // 1. Pure deep clone (ensures sourcePlan remains 100% immutable)
    const draftPlan: HierarchicalPlan = JSON.parse(JSON.stringify(sourcePlan));
    const newVersion = (sourcePlan.version || 1) + 1;
    (draftPlan as any).version = newVersion;
    (draftPlan as any).updatedAt = new Date().toISOString();

    // 2. Apply typed operations
    for (const op of operations) {
      this.applyOperation(draftPlan, op);
    }

    // 3. Rebuild flattened steps array for WorkflowRuntime backward-compatibility
    const flattenedSteps: PlanStep[] = [];
    for (const phase of draftPlan.phases || []) {
      for (const subgoal of phase.subgoals || []) {
        flattenedSteps.push(...subgoal.steps);
      }
    }
    (draftPlan as any).steps = flattenedSteps;

    // 4. DAG & Schema Validation
    HierarchicalPlanValidator.validate(draftPlan);

    // 5. Compute Diff and Review
    const diff = PlanReviewEngine.computeDiff(sourcePlan, draftPlan);
    const review = PlanReviewEngine.reviewPlan(draftPlan);

    // 6. Compute Risk & Cost Deltas
    const sourceReview = PlanReviewEngine.reviewPlan(sourcePlan);
    const fromMaxRisk = sourceReview.risks.find((r) => r.highestRiskOperation)?.level || 'LOW';
    const toMaxRisk = review.risks.find((r) => r.highestRiskOperation)?.level || 'LOW';

    const fromHighCount = (sourceReview.risks.find((r) => r.level === 'HIGH')?.count || 0) +
      (sourceReview.risks.find((r) => r.level === 'CRITICAL')?.count || 0);
    const toHighCount = (review.risks.find((r) => r.level === 'HIGH')?.count || 0) +
      (review.risks.find((r) => r.level === 'CRITICAL')?.count || 0);

    const auditRecord: PlanRevisionAuditRecord = {
      revisionId: `rev_${crypto.randomUUID()}`,
      sourcePlanId: sourcePlan.id,
      sourceVersion: sourcePlan.version || 1,
      newVersion,
      operations,
      riskDelta: {
        fromMaxRisk,
        toMaxRisk,
        addedHighRiskCount: Math.max(0, toHighCount - fromHighCount),
      },
      costDelta: {
        fromCost: sourcePlan.metadata?.estimatedCost,
        toCost: draftPlan.metadata?.estimatedCost,
      },
      actor: options.actor || 'USER',
      createdAt: Date.now(),
    };

    return {
      revisionId: auditRecord.revisionId,
      sourcePlanId: sourcePlan.id,
      sourceVersion: sourcePlan.version || 1,
      newPlanId: draftPlan.id,
      newVersion,
      draftPlan,
      operations,
      diff,
      review,
      status: 'VALID',
      createdAt: Date.now(),
      auditRecord,
    };
  }

  /**
   * Explicitly commits a validated revision, making the new plan version authoritative.
   */
  static commitRevision(revision: PlanRevision): HierarchicalPlan {
    if (revision.status !== 'VALID' && revision.status !== 'DRAFT') {
      throw new PlanEditError(
        'INVALID_REVISION_STATE',
        `Cannot commit revision with status: ${revision.status}`
      );
    }

    revision.status = 'COMMITTED';
    revision.committedAt = Date.now();
    return revision.draftPlan;
  }

  /**
   * Rejects a draft revision.
   */
  static rejectRevision(revision: PlanRevision): void {
    revision.status = 'REJECTED';
  }

  /**
   * Applies an individual edit operation to a draft plan in place.
   */
  private static applyOperation(plan: HierarchicalPlan, op: PlanEditOperation): void {
    switch (op.type) {
      case 'ADD_STEP': {
        const phase = (plan.phases || []).find((p) => p.phaseId === op.phaseId);
        if (!phase) throw new PlanEditError('PHASE_NOT_FOUND', `Phase '${op.phaseId}' not found`);
        const subgoal = (phase.subgoals || []).find((sg) => sg.subgoalId === op.subgoalId);
        if (!subgoal) throw new PlanEditError('SUBGOAL_NOT_FOUND', `Subgoal '${op.subgoalId}' not found in phase '${op.phaseId}'`);

        const newStep: PlanStep = {
          ...op.step,
          dependsOn: op.dependsOn || op.step.dependsOn || [],
        };
        (subgoal.steps as PlanStep[]).push(newStep);
        break;
      }

      case 'REMOVE_STEP': {
        // Check if other steps depend on this step
        const allSteps = this.getAllSteps(plan);
        const dependentSteps = allSteps.filter((s) => (s.dependsOn || []).includes(op.stepId));

        if (dependentSteps.length > 0) {
          if (op.repairDependencies) {
            // Automatically repair dependencies by removing the deleted step from dependsOn
            for (const depStep of dependentSteps) {
              depStep.dependsOn = (depStep.dependsOn || []).filter((d) => d !== op.stepId);
            }
          } else {
            throw new PlanEditError(
              'DEPENDENCY_INTEGRITY_VIOLATION',
              `Cannot remove step '${op.stepId}' because steps [${dependentSteps.map((s) => s.id).join(', ')}] depend on it. Set repairDependencies: true to repair.`
            );
          }
        }

        let found = false;
        for (const phase of plan.phases || []) {
          for (const subgoal of phase.subgoals || []) {
            const initialLen = subgoal.steps.length;
            (subgoal as any).steps = subgoal.steps.filter((s) => s.id !== op.stepId);
            if (subgoal.steps.length < initialLen) found = true;
          }
        }
        if (!found) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found`);
        break;
      }

      case 'UPDATE_STEP': {
        const step = this.findStep(plan, op.stepId);
        if (!step) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found`);
        Object.assign(step, op.updates);
        break;
      }

      case 'REORDER_STEP': {
        const phase = (plan.phases || []).find((p) => p.phaseId === op.phaseId);
        if (!phase) throw new PlanEditError('PHASE_NOT_FOUND', `Phase '${op.phaseId}' not found`);
        const subgoal = (phase.subgoals || []).find((sg) => sg.subgoalId === op.subgoalId);
        if (!subgoal) throw new PlanEditError('SUBGOAL_NOT_FOUND', `Subgoal '${op.subgoalId}' not found in phase '${op.phaseId}'`);

        const idx = subgoal.steps.findIndex((s) => s.id === op.stepId);
        if (idx === -1) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found in subgoal '${op.subgoalId}'`);

        const [removed] = (subgoal.steps as PlanStep[]).splice(idx, 1);
        (subgoal.steps as PlanStep[]).splice(op.targetIndex, 0, removed);
        break;
      }

      case 'SKIP_STEP': {
        const step = this.findStep(plan, op.stepId);
        if (!step) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found`);
        step.status = 'SKIPPED';
        break;
      }

      case 'UPDATE_PARAMETER': {
        const step = this.findStep(plan, op.stepId);
        if (!step) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found`);
        step.toolArgs = { ...(step.toolArgs || {}), ...op.toolArgs };
        break;
      }

      case 'UPDATE_ROUTING_PROFILE': {
        if (op.stepId) {
          const step = this.findStep(plan, op.stepId);
          if (!step) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found`);
          step.routingProfile = op.routingProfile;
        } else if (plan.planningRoute) {
          (plan.planningRoute as any).routingProfile = op.routingProfile;
        }
        break;
      }

      case 'UPDATE_PROVIDER_MODEL': {
        if (op.stepId) {
          const step = this.findStep(plan, op.stepId);
          if (!step) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found`);
          if (step.providerRoute) {
            (step.providerRoute as any).vendor = op.vendor;
            (step.providerRoute as any).modelId = op.modelId;
          }
        } else if (plan.planningRoute) {
          (plan.planningRoute as any).vendor = op.vendor;
          (plan.planningRoute as any).modelId = op.modelId;
        }
        break;
      }

      case 'UPDATE_APPROVAL_REQUIREMENT': {
        if (op.stepId) {
          const step = this.findStep(plan, op.stepId);
          if (!step) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found`);
          if (!op.requiresApproval && (step.risk === 'HIGH' || step.risk === 'CRITICAL')) {
            throw new PlanEditError(
              'UNSAFE_APPROVAL_DOWNGRADE',
              `Cannot disable human approval requirement on HIGH or CRITICAL risk step '${step.description}'`
            );
          }
        } else if (op.phaseId) {
          const phase = (plan.phases || []).find((p) => p.phaseId === op.phaseId);
          if (!phase) throw new PlanEditError('PHASE_NOT_FOUND', `Phase '${op.phaseId}' not found`);
          if (!op.requiresApproval && (phase.riskLevel === 'HIGH' || phase.riskLevel === 'CRITICAL')) {
            throw new PlanEditError(
              'UNSAFE_APPROVAL_DOWNGRADE',
              `Cannot disable human approval requirement on HIGH or CRITICAL risk phase '${phase.title}'`
            );
          }
          (phase as any).requiresApproval = op.requiresApproval;
        }
        break;
      }

      case 'UPDATE_CHECKPOINT': {
        const phase = (plan.phases || []).find((p) => p.phaseId === op.phaseId);
        if (!phase) throw new PlanEditError('PHASE_NOT_FOUND', `Phase '${op.phaseId}' not found`);
        (phase as any).checkpointBoundary = op.checkpointBoundary;
        break;
      }

      case 'UPDATE_VERIFICATION': {
        if (op.phaseId) {
          const phase = (plan.phases || []).find((p) => p.phaseId === op.phaseId);
          if (!phase) throw new PlanEditError('PHASE_NOT_FOUND', `Phase '${op.phaseId}' not found`);
          (phase as any).verificationCriteria = op.criteria;
        }
        break;
      }

      case 'ADD_DEPENDENCY': {
        const step = this.findStep(plan, op.stepId);
        if (!step) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found`);
        const deps = step.dependsOn || [];
        if (!deps.includes(op.dependsOnStepId)) {
          step.dependsOn = [...deps, op.dependsOnStepId];
        }
        break;
      }

      case 'REMOVE_DEPENDENCY': {
        const step = this.findStep(plan, op.stepId);
        if (!step) throw new PlanEditError('STEP_NOT_FOUND', `Step '${op.stepId}' not found`);
        step.dependsOn = (step.dependsOn || []).filter((d) => d !== op.dependsOnStepId);
        break;
      }

      case 'UPDATE_PLAN_METADATA': {
        if (plan.metadata) {
          Object.assign(plan.metadata, op.updates);
        }
        break;
      }
    }
  }

  private static findStep(plan: HierarchicalPlan, stepId: string): PlanStep | undefined {
    for (const phase of plan.phases || []) {
      for (const subgoal of phase.subgoals || []) {
        const step = subgoal.steps.find((s) => s.id === stepId);
        if (step) return step;
      }
    }
    return undefined;
  }

  private static getAllSteps(plan: HierarchicalPlan): PlanStep[] {
    const steps: PlanStep[] = [];
    for (const phase of plan.phases || []) {
      for (const subgoal of phase.subgoals || []) {
        steps.push(...subgoal.steps);
      }
    }
    return steps;
  }
}
