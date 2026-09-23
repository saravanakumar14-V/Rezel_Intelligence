/**
 * REZEL PHASE 17 — CONTROLLED AUTONOMY: STATE MACHINE
 *
 * Deterministically controls state transitions for autonomous goal pursuit.
 * Enforces legal state sequences and halts immediately on boundary breaches.
 */

import type { AutonomyState } from './types';

const LEGAL_TRANSITIONS: Record<AutonomyState, AutonomyState[]> = {
  IDLE: ['ANALYZING_GOAL', 'ABORTED'],
  ANALYZING_GOAL: ['FORMULATING_BOUNDED_PLAN', 'UNSUPPORTED_GOAL', 'ABORTED'],
  FORMULATING_BOUNDED_PLAN: ['AWAITING_BUDGET_APPROVAL', 'EXECUTING', 'UNSUPPORTED_GOAL', 'ABORTED'],
  AWAITING_BUDGET_APPROVAL: ['EXECUTING', 'PAUSED', 'ABORTED'],
  EXECUTING: ['OBSERVING_STATE', 'CORRECTION_REQUIRED', 'PAUSED', 'ESCALATING_TO_USER', 'BUDGET_EXHAUSTED', 'ABORTED', 'GOAL_MET'],
  OBSERVING_STATE: ['EXECUTING', 'GOAL_MET', 'CORRECTION_REQUIRED', 'ESCALATING_TO_USER', 'BUDGET_EXHAUSTED', 'ABORTED'],
  CORRECTION_REQUIRED: ['EVALUATING_POLICY', 'ESCALATING_TO_USER', 'BUDGET_EXHAUSTED', 'ABORTED'],
  EVALUATING_POLICY: ['EXECUTING_CORRECTION', 'ESCALATING_TO_USER', 'ABORTED'],
  EXECUTING_CORRECTION: ['OBSERVING_STATE', 'PAUSED', 'BUDGET_EXHAUSTED', 'ABORTED'],
  ESCALATING_TO_USER: ['PAUSED', 'EXECUTING', 'ABORTED'],
  PAUSED: ['EXECUTING', 'ABORTED'],
  GOAL_MET: [],
  BUDGET_EXHAUSTED: [],
  ABORTED: [],
  UNSUPPORTED_GOAL: [],
};

export class ControlledAutonomyStateMachine {
  private currentState: AutonomyState = 'IDLE';
  private history: Array<{ state: AutonomyState; timestamp: number; reason?: string }> = [];

  constructor(initialState: AutonomyState = 'IDLE') {
    this.currentState = initialState;
    this.history.push({ state: initialState, timestamp: Date.now(), reason: 'Initial state' });
  }

  getState(): AutonomyState {
    return this.currentState;
  }

  isTerminal(): boolean {
    return (
      this.currentState === 'GOAL_MET' ||
      this.currentState === 'BUDGET_EXHAUSTED' ||
      this.currentState === 'ABORTED' ||
      this.currentState === 'UNSUPPORTED_GOAL'
    );
  }

  transition(nextState: AutonomyState, reason?: string): void {
    if (this.currentState === nextState) return;

    const allowed = LEGAL_TRANSITIONS[this.currentState];
    if (!allowed || !allowed.includes(nextState)) {
      throw new Error(
        `[ControlledAutonomyStateMachine] Illegal state transition from '${this.currentState}' to '${nextState}' (Reason: ${reason || 'unspecified'})`
      );
    }

    this.currentState = nextState;
    this.history.push({ state: nextState, timestamp: Date.now(), reason });
  }

  getHistory(): ReadonlyArray<{ state: AutonomyState; timestamp: number; reason?: string }> {
    return [...this.history];
  }
}
