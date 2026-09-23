/**
 * Rezel 11.4D — Centralized Risk Evaluator
 *
 * Evaluates operation risk and determines whether human approval is mandatory
 * prior to executing external mutations or sensitive tool calls.
 */

import type { PlanStep } from '../types';
import type { RiskLevel } from '../../security/PermissionManager';
import type { ApprovalPolicy } from './types';

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  autoApproveLowRisk: true,
  requireApprovalForMediumRisk: false,
  requireApprovalForHighRisk: true,
  requireApprovalForCriticalRisk: true,
  defaultExpirationMs: 30 * 60 * 1000, // 30 minutes
};

export class RiskEvaluator {
  private static policy: ApprovalPolicy = { ...DEFAULT_APPROVAL_POLICY };

  static getPolicy(): ApprovalPolicy {
    return { ...this.policy };
  }

  static setPolicy(newPolicy: Partial<ApprovalPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  static resetPolicy(): void {
    this.policy = { ...DEFAULT_APPROVAL_POLICY };
  }

  /**
   * Evaluates the risk level and approval requirement for a workflow step.
   */
  static evaluate(
    step: PlanStep,
    capability?: { risk?: RiskLevel; mutatesExternalState?: boolean; name?: string }
  ): {
    riskLevel: RiskLevel;
    requiresApproval: boolean;
    reason: string;
  } {
    let riskLevel: RiskLevel = 'LOW';
    let reason = 'Read-only or informational step';

    const toolName = (step.toolName || '').toLowerCase();
    const desc = (step.description || '').toLowerCase();

    // 1. Critical tier heuristics (irreversible / destructive)
    if (
      toolName.includes('delete_project') ||
      toolName.includes('wipe') ||
      toolName.includes('format') ||
      desc.includes('delete project') ||
      desc.includes('destructive')
    ) {
      riskLevel = 'CRITICAL';
      reason = 'Irreversible or destructive operation detected';
    }
    // 2. High tier heuristics (mutations, project updates, external application writes)
    else if (
      step.risk === 'HIGH' ||
      capability?.risk === 'HIGH' ||
      capability?.mutatesExternalState ||
      toolName.includes('create_object') ||
      toolName.includes('create_comp') ||
      toolName.includes('add_text_layer') ||
      toolName.includes('modify') ||
      toolName.includes('write_file')
    ) {
      riskLevel = step.risk || capability?.risk || 'HIGH';
      reason = 'External application mutation or filesystem write';
    }
    // 3. Medium tier
    else if (step.risk === 'MEDIUM' || capability?.risk === 'MEDIUM') {
      riskLevel = 'MEDIUM';
      reason = 'Standard user-scoped modification';
    }
    // 4. Low tier
    else {
      riskLevel = step.risk || capability?.risk || 'LOW';
      reason = 'Non-mutating informational query';
    }

    // 5. Evaluate against ApprovalPolicy
    let requiresApproval = false;
    if (riskLevel === 'CRITICAL' && this.policy.requireApprovalForCriticalRisk) {
      requiresApproval = true;
    } else if (riskLevel === 'HIGH' && this.policy.requireApprovalForHighRisk) {
      requiresApproval = true;
    } else if (riskLevel === 'MEDIUM' && this.policy.requireApprovalForMediumRisk) {
      requiresApproval = true;
    } else if (riskLevel === 'LOW') {
      requiresApproval = !this.policy.autoApproveLowRisk;
    }

    return {
      riskLevel,
      requiresApproval,
      reason,
    };
  }
}
