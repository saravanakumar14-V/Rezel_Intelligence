/**
 * REZEL PHASE 17 — CONTROLLED AUTONOMY: DECISION LOGGER
 *
 * Captures auditable, structured decision traces for all autonomous actions,
 * policy evaluations, verification outcomes, and recovery determinations.
 *
 * MANDATORY INVARIANT:
 * - Never expose internal / hidden generative chain-of-thought.
 * - Only emit discrete, verifiable decision metadata.
 */

import type { AuditableDecision, DecisionType } from './types';
import type { SafetyBudgetManager } from './SafetyBudgetManager';

export class AutonomyDecisionLogger {
  private readonly sessionId: string;
  private decisions: AuditableDecision[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  logDecision(
    params: {
      decisionType: DecisionType;
      stepId?: string;
      selectedOperation?: string;
      selectedTemplate?: string;
      policyResult?: 'APPROVED' | 'DENIED' | 'ESCALATION_REQUIRED';
      verificationResult?: 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN';
      recoveryDecision?: 'CORRECT' | 'HALT' | 'ESCALATE';
      reason: string;
      metadata?: Record<string, unknown>;
    },
    budgetManager: SafetyBudgetManager
  ): AuditableDecision {
    const decision: AuditableDecision = {
      id: `dec_${crypto.randomUUID()}`,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      stepId: params.stepId,
      decisionType: params.decisionType,
      selectedOperation: params.selectedOperation,
      selectedTemplate: params.selectedTemplate,
      policyResult: params.policyResult,
      verificationResult: params.verificationResult,
      recoveryDecision: params.recoveryDecision,
      budgetRemaining: budgetManager.getRemaining(),
      reason: this.sanitizeReason(params.reason),
      metadata: params.metadata ? this.sanitizeMetadata(params.metadata) : undefined,
    };

    this.decisions.push(decision);
    return decision;
  }

  getDecisions(): AuditableDecision[] {
    return JSON.parse(JSON.stringify(this.decisions));
  }

  /**
   * Strips potential chain-of-thought patterns or sensitive token payloads.
   */
  private sanitizeReason(reason: string): string {
    // Strip XML-like CoT tags if present
    let clean = reason.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
    clean = clean.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    return clean || 'Deterministic decision reached';
  }

  private sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (k === 'rawPrompt' || k === 'chainOfThought' || k === 'thinking' || k === 'internalTokens') {
        continue;
      }
      sanitized[k] = v;
    }
    return sanitized;
  }
}
