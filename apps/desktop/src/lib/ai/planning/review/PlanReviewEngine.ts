/**
 * Rezel 11.8B — Plan Review & Explanation Engine
 *
 * Provides safe, structured, read-only plan inspection:
 * - Aggregates mutating actions, approval requirements, and checkpoint boundaries
 * - Analyzes dependency graph to discover parallelizable branches
 * - Formats human-readable verification criteria and concise non-CoT rationale
 * - Generates immutable review snapshots, plan diffs, and companion summaries
 */

import type { HierarchicalPlan } from '../types';
import type {
  PlanReview,
  PlanReviewPhase,
  PlanReviewSubgoal,
  PlanReviewStep,
  PlanRiskSummary,
  ProviderRouteSummary,
  PlanReviewIssue,
  PlanDiff,
  PlanReviewSnapshot,
  PlanReviewValidationStatus,
} from './types';
import { HierarchicalPlanValidator } from '../HierarchicalPlanValidator';
import type { RiskLevel } from '../../../security/PermissionManager';

export class PlanReviewEngine {
  /**
   * Generates a structured read-only review of a HierarchicalPlan.
   */
  static reviewPlan(
    plan: HierarchicalPlan,
    options: { liveApplications?: string[] } = {}
  ): PlanReview {
    const issues: PlanReviewIssue[] = [];
    let validationStatus: PlanReviewValidationStatus = 'VALID';

    // 1. Validator Integration
    try {
      HierarchicalPlanValidator.validate(plan);
    } catch (err: any) {
      validationStatus = 'INVALID';
      issues.push({
        type: 'DEPENDENCY_BLOCK',
        severity: 'ERROR',
        message: err.message,
      });
    }

    let totalSteps = 0;
    let mutatingSteps = 0;
    let approvalRequiredSteps = 0;
    let checkpointCount = 0;
    let highestRisk: RiskLevel = 'LOW';
    let highestRiskOperation: string | undefined;

    const riskCounts: Record<RiskLevel, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };

    const applicationSet = new Set<string>(plan.metadata?.requiredApplications || []);
    if (plan.goal.toLowerCase().includes('blender')) applicationSet.add('blender');
    if (plan.goal.toLowerCase().includes('after effects') || plan.goal.toLowerCase().includes('ae')) applicationSet.add('after_effects');
    const providerList: ProviderRouteSummary[] = [];

    if (plan.planningRoute) {
      providerList.push({
        vendor: plan.planningRoute.vendor,
        modelId: plan.planningRoute.modelId,
        routingProfile: plan.planningRoute.routingProfile,
        isPaid: plan.planningRoute.isPaid,
        selectionReason: plan.planningRoute.selectionReason,
        routeType: 'PLANNED',
      });
    }

    // 2. Phase & Subgoal Inspection
    const reviewPhases: PlanReviewPhase[] = (plan.phases || []).map((phase) => {
      if (phase.checkpointBoundary) checkpointCount++;

      const phaseApps = new Set<string>();

      const reviewSubgoals: PlanReviewSubgoal[] = (phase.subgoals || []).map((subgoal) => {
        const reviewSteps: PlanReviewStep[] = (subgoal.steps || []).map((step) => {
          totalSteps++;
          const risk = step.risk || 'LOW';
          riskCounts[risk] = (riskCounts[risk] || 0) + 1;

          if (this.isRiskHigher(risk, highestRisk)) {
            highestRisk = risk;
            highestRiskOperation = step.description;
          }

          if (step.toolName) {
            mutatingSteps++;
          }

          const requiresApproval = risk === 'HIGH' || risk === 'CRITICAL';
          if (requiresApproval) {
            approvalRequiredSteps++;
            issues.push({
              type: 'APPROVAL_REQUIRED',
              severity: 'WARNING',
              message: `Step '${step.description}' requires explicit human approval before execution`,
              phaseId: phase.phaseId,
              stepId: step.id,
            });
          }

          const appName = this.inferApplication(step.toolName || step.description);
          if (appName) {
            applicationSet.add(appName);
            phaseApps.add(appName);
          }

          return {
            stepId: step.id,
            title: step.description,
            description: step.description,
            category: step.stepCategory || 'AUTOMATION',
            application: appName,
            mutatesExternalState: Boolean(step.toolName),
            riskLevel: risk,
            requiresApproval,
            checkpointBoundary: Boolean(phase.checkpointBoundary),
            verificationSummary: step.verificationPredicate
              ? `Verify predicate: ${step.verificationPredicate.operator} on ${step.verificationPredicate.entityType || 'entity'}`
              : 'Empirical state change observation',
            dependencies: step.dependsOn || [],
            expectedOutputs: (step.outputDefinitions || []).map((o) => o.name),
            providerRoute: step.providerRoute
              ? {
                  vendor: step.providerRoute.vendor,
                  modelId: step.providerRoute.modelId,
                  routingProfile: step.providerRoute.routingProfile,
                  isPaid: step.providerRoute.isPaid,
                  routeType: 'PLANNED',
                }
              : undefined,
          };
        });

        return {
          subgoalId: subgoal.subgoalId,
          title: subgoal.title,
          objective: subgoal.objective,
          stepCount: reviewSteps.length,
          dependencies: subgoal.dependencies || [],
          steps: reviewSteps,
          rationale: subgoal.rationale,
        };
      });

      return {
        phaseId: phase.phaseId,
        title: phase.title,
        objective: phase.objective,
        applications: Array.from(phaseApps),
        riskLevel: phase.riskLevel || 'LOW',
        requiresApproval: Boolean(phase.requiresApproval),
        checkpointBoundary: Boolean(phase.checkpointBoundary),
        verificationCriteria: phase.verificationCriteria || [],
        dependencies: phase.dependencies || [],
        subgoals: reviewSubgoals,
        rationale: phase.rationale,
      };
    });

    // 3. Application Availability Check
    if (options.liveApplications && options.liveApplications.length > 0) {
      for (const reqApp of applicationSet) {
        if (!options.liveApplications.includes(reqApp)) {
          issues.push({
            type: 'MISSING_APPLICATION',
            severity: 'WARNING',
            message: `Required application '${reqApp}' is not currently connected to ApplicationRegistry`,
          });
        }
      }
    }

    // 4. Parallel Branch Discovery
    const parallelBranches = this.discoverParallelBranches(plan);

    // 5. Aggregate Risks
    const risks: PlanRiskSummary[] = (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as RiskLevel[]).map(
      (level) => ({
        level,
        count: riskCounts[level],
        highestRiskOperation: level === highestRisk ? highestRiskOperation : undefined,
      })
    );

    if (validationStatus !== 'INVALID' && issues.some((i) => i.severity === 'WARNING')) {
      validationStatus = 'VALID_WITH_WARNINGS';
    }

    return {
      planId: plan.id,
      version: plan.version || 1,
      goal: plan.goal,
      summary: plan.metadata?.rationale || `Hierarchical execution plan consisting of ${reviewPhases.length} phases and ${totalSteps} steps.`,
      complexity: plan.metadata?.complexity || 'MODERATE',
      validationStatus,
      phases: reviewPhases,
      totalSteps,
      mutatingSteps,
      approvalRequiredSteps,
      checkpointCount,
      applications: Array.from(applicationSet),
      providers: providerList,
      estimatedCost: plan.metadata?.estimatedCost,
      estimatedDurationMs: plan.metadata?.estimatedDurationMs,
      estimatedProviderCalls: plan.metadata?.estimatedProviderCalls,
      risks,
      issues,
      parallelBranches,
      generatedAt: Date.now(),
    };
  }

  /**
   * Creates an immutable review snapshot.
   */
  static createSnapshot(
    plan: HierarchicalPlan,
    options: { liveApplications?: string[] } = {}
  ): PlanReviewSnapshot {
    const review = this.reviewPlan(plan, options);
    return {
      snapshotId: `snap_${crypto.randomUUID()}`,
      planId: plan.id,
      planVersion: plan.version || 1,
      review,
      createdAt: Date.now(),
    };
  }

  /**
   * Computes a read-only structural diff between two versions of a plan.
   */
  static computeDiff(planA: HierarchicalPlan, planB: HierarchicalPlan): PlanDiff {
    const phasesA = new Set((planA.phases || []).map((p) => p.phaseId));
    const phasesB = new Set((planB.phases || []).map((p) => p.phaseId));

    const addedPhases = Array.from(phasesB).filter((p) => !phasesA.has(p));
    const removedPhases = Array.from(phasesA).filter((p) => !phasesB.has(p));
    const changedPhases: string[] = [];

    const stepsA = new Map<string, any>();
    for (const p of planA.phases || []) {
      for (const sg of p.subgoals || []) {
        for (const s of sg.steps || []) {
          stepsA.set(s.id, s);
        }
      }
    }

    const stepsB = new Map<string, any>();
    for (const p of planB.phases || []) {
      for (const sg of p.subgoals || []) {
        for (const s of sg.steps || []) {
          stepsB.set(s.id, s);
        }
      }
    }

    const addedSteps = Array.from(stepsB.keys()).filter((k) => !stepsA.has(k));
    const removedSteps = Array.from(stepsA.keys()).filter((k) => !stepsB.has(k));
    const changedSteps: string[] = [];
    const riskChanges: Array<{ stepId: string; oldRisk?: RiskLevel; newRisk?: RiskLevel }> = [];
    const dependencyChanges: Array<{ stepId: string; oldDeps: string[]; newDeps: string[] }> = [];

    for (const [id, sB] of stepsB.entries()) {
      const sA = stepsA.get(id);
      if (sA) {
        if (sA.risk !== sB.risk) {
          riskChanges.push({ stepId: id, oldRisk: sA.risk, newRisk: sB.risk });
        }
        const depsA = sA.dependsOn || [];
        const depsB = sB.dependsOn || [];
        if (depsA.join(',') !== depsB.join(',')) {
          dependencyChanges.push({ stepId: id, oldDeps: depsA, newDeps: depsB });
        }
        if (sA.description !== sB.description) {
          changedSteps.push(id);
        }
      }
    }

    return {
      fromPlanId: planA.id,
      fromVersion: planA.version || 1,
      toPlanId: planB.id,
      toVersion: planB.version || 2,
      addedPhases,
      removedPhases,
      changedPhases,
      addedSteps,
      removedSteps,
      changedSteps,
      riskChanges,
      dependencyChanges,
    };
  }

  /**
   * Generates a compact plan summary for Companion Mode HUD.
   */
  static getCompanionSummary(plan: HierarchicalPlan): {
    title: string;
    phaseCount: number;
    stepCount: number;
    risk: RiskLevel;
    checkpointCount: number;
  } {
    const review = this.reviewPlan(plan);
    const highestRisk = review.risks.find((r) => r.highestRiskOperation)?.level || 'LOW';

    return {
      title: plan.goal,
      phaseCount: review.phases.length,
      stepCount: review.totalSteps,
      risk: highestRisk,
      checkpointCount: review.checkpointCount,
    };
  }

  private static isRiskHigher(a: RiskLevel, b: RiskLevel): boolean {
    const ranks: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    return (ranks[a] || 1) > (ranks[b] || 1);
  }

  private static inferApplication(text: string): string | undefined {
    const lower = text.toLowerCase();
    if (lower.includes('blender')) return 'blender';
    if (lower.includes('after_effects') || lower.includes('ae') || lower.includes('composition')) return 'after_effects';
    return undefined;
  }

  private static discoverParallelBranches(plan: HierarchicalPlan): string[][] {
    const parallelBranches: string[][] = [];
    for (const phase of plan.phases || []) {
      for (const subgoal of phase.subgoals || []) {
        const independentSteps = (subgoal.steps || [])
          .filter((s) => !s.dependsOn || s.dependsOn.length === 0)
          .map((s) => s.id);

        if (independentSteps.length > 1) {
          parallelBranches.push(independentSteps);
        }
      }
    }
    return parallelBranches;
  }
}
