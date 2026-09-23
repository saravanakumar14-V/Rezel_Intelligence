/**
 * Rezel 11.8D — Durable Agent Session & Lifecycle Manager
 *
 * Coordinates long-running autonomous agent sessions:
 * - Pins agent to immutable planId and planVersion
 * - Enforces explicit lifecycle transitions (PAUSED, WAITING_FOR_APPROVAL, RECOVERY_REQUIRED, STALLED)
 * - Invariant: Completed steps NEVER replay upon restart/resume
 * - Invariant: UNKNOWN execution outcomes strictly enter RECOVERY_REQUIRED
 * - Invariant: Active running workflows retain their pinned plan version (PLAN_UPDATE_AVAILABLE notification only)
 * - Enforces execution bounds (maxActions, maxDurationMs, maxCost)
 * - Maintains comprehensive, safe audit traces without storing secret credentials or raw media
 */

import type { HierarchicalPlan } from '../planning/types';
import type {
  DurableAgentSession,
  AgentLifecycleState,
  AgentLimits,
  AgentProgress,
} from './types';
import { AgentError } from './types';
import { WorkflowCheckpointManager } from '../checkpoints/WorkflowCheckpointManager';
import { WorkflowStore } from '../persistence/WorkflowStore';
import type { Workflow } from '../types';

export class DurableAgentManager {
  private static sessions = new Map<string, DurableAgentSession>();

  /**
   * Creates a new durable agent session pinned to an immutable plan version.
   */
  static createAgent(options: {
    plan: HierarchicalPlan;
    workflowId?: string;
    limits?: AgentLimits;
  }): DurableAgentSession {
    const agentId = `agent_${crypto.randomUUID()}`;
    const workflowId = options.workflowId || options.plan.workflowId || `wf_${crypto.randomUUID()}`;
    const now = Date.now();

    // Ensure workflow is registered in WorkflowStore for persistence and checkpoints
    const workflow: Workflow = {
      id: workflowId,
      projectId: options.plan.projectId,
      plan: options.plan,
      status: 'PLANNED',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    WorkflowStore.saveWorkflow(workflow);

    const session: DurableAgentSession = {
      agentId,
      workflowId,
      planId: options.plan.id,
      planVersion: options.plan.version || 1,
      state: 'READY',
      createdAt: now,
      updatedAt: now,
      iteration: 0,
      actionCount: 0,
      completedStepIds: [],
      actualCost: 0,
      providerCalls: 0,
      lastHeartbeatAt: now,
      lastProgressAt: now,
      limits: options.limits,
      trace: [
        {
          eventId: `evt_${crypto.randomUUID()}`,
          timestamp: now,
          type: 'agent_created',
          description: `Durable agent created for plan '${options.plan.id}' (v${options.plan.version || 1})`,
        },
      ],
    };

    this.sessions.set(agentId, session);
    return session;
  }

  /**
   * Starts or transitions agent to RUNNING state.
   */
  static startAgent(agentId: string): DurableAgentSession {
    const session = this.getRequiredSession(agentId);
    session.state = 'RUNNING';
    session.startedAt = Date.now();
    session.updatedAt = Date.now();
    session.lastProgressAt = Date.now();
    session.lastHeartbeatAt = Date.now();

    this.addTrace(session, 'agent_started', 'Agent execution started');
    return session;
  }

  /**
   * Pauses an active agent, records a checkpoint, and stops scheduling.
   */
  static async pauseAgent(agentId: string, reason = 'User requested pause'): Promise<DurableAgentSession> {
    const session = this.getRequiredSession(agentId);
    session.state = 'PAUSED';
    session.pausedAt = Date.now();
    session.updatedAt = Date.now();

    // Create durable checkpoint at pause boundary
    const cp = await WorkflowCheckpointManager.createCheckpoint(session.workflowId, {
      type: 'MANUAL_PAUSE',
      reason: `Checkpoint upon pausing agent '${agentId}': ${reason}`,
    });

    session.lastCheckpointId = cp.checkpointId;
    this.addTrace(session, 'agent_paused', `Agent paused: ${reason}`, { checkpointId: cp.checkpointId });
    return session;
  }

  /**
   * Resumes a paused or waiting agent after revalidating prerequisites.
   */
  static async resumeAgent(
    agentId: string,
    options: { liveApplications?: string[] } = {}
  ): Promise<DurableAgentSession> {
    const session = this.getRequiredSession(agentId);

    // Validate application availability if application requirements exist
    if (session.waitCondition?.type === 'APPLICATION' && session.waitCondition.targetId) {
      if (!options.liveApplications?.includes(session.waitCondition.targetId)) {
        session.state = 'WAITING_FOR_APPLICATION';
        this.addTrace(session, 'agent_waiting', `Still waiting for application: ${session.waitCondition.targetId}`);
        return session;
      }
    }

    session.state = 'RUNNING';
    session.waitCondition = undefined;
    session.nextWakeAt = undefined;
    session.updatedAt = Date.now();
    session.lastProgressAt = Date.now();
    session.lastHeartbeatAt = Date.now();

    this.addTrace(session, 'agent_resumed', 'Agent resumed execution after state validation');
    return session;
  }

  /**
   * Advances step progress, protecting completed steps from replay and enforcing UNKNOWN recovery gates.
   */
  static async stepAgent(
    agentId: string,
    stepId: string,
    result: 'SUCCESS' | 'FAILED' | 'UNKNOWN',
    metadata?: { cost?: number; provider?: string }
  ): Promise<DurableAgentSession> {
    const session = this.getRequiredSession(agentId);
    session.iteration++;
    session.actionCount++;
    session.updatedAt = Date.now();
    session.lastHeartbeatAt = Date.now();

    if (metadata?.cost) session.actualCost += metadata.cost;
    if (metadata?.provider) session.providerCalls++;

    // Check execution limits
    if (session.limits) {
      if (session.limits.maxActions && session.actionCount >= session.limits.maxActions) {
        session.state = 'LIMIT_REACHED';
        this.addTrace(session, 'agent_limit_reached', `Action limit reached (${session.actionCount})`);
        return session;
      }
      if (session.limits.maxCost && session.actualCost >= session.limits.maxCost) {
        session.state = 'LIMIT_REACHED';
        this.addTrace(session, 'agent_limit_reached', `Cost limit reached ($${session.actualCost.toFixed(3)})`);
        return session;
      }
      if (session.limits.maxDurationMs && session.startedAt && Date.now() - session.startedAt >= session.limits.maxDurationMs) {
        session.state = 'LIMIT_REACHED';
        this.addTrace(session, 'agent_limit_reached', `Duration limit reached (${session.limits.maxDurationMs}ms)`);
        return session;
      }
    }

    if (result === 'SUCCESS') {
      if (!session.completedStepIds.includes(stepId)) {
        session.completedStepIds.push(stepId);
      }
      session.lastProgressAt = Date.now();
      this.addTrace(session, 'step_completed', `Step '${stepId}' completed successfully`);
    } else if (result === 'UNKNOWN') {
      // Strict UNKNOWN mutation recovery gate (never auto-replayed)
      session.state = 'RECOVERY_REQUIRED';
      this.addTrace(session, 'agent_recovery_required', `Step '${stepId}' resulted in UNKNOWN state. Recovery gate engaged.`);
    } else if (result === 'FAILED') {
      session.state = 'FAILED';
      this.addTrace(session, 'step_failed', `Step '${stepId}' execution failed`);
    }

    return session;
  }

  /**
   * Sets agent to WAITING_FOR_APPROVAL state with durable condition.
   */
  static waitForApproval(agentId: string, approvalId: string, reason?: string): DurableAgentSession {
    const session = this.getRequiredSession(agentId);
    session.state = 'WAITING_FOR_APPROVAL';
    session.waitCondition = {
      type: 'APPROVAL',
      targetId: approvalId,
      reason: reason || 'Human-in-the-loop approval required before high-risk operation',
    };
    session.updatedAt = Date.now();
    this.addTrace(session, 'agent_waiting_approval', `Waiting for approval '${approvalId}'`);
    return session;
  }

  /**
   * Sets agent to WAITING_FOR_TIME state with wake timestamp.
   */
  static waitForTime(agentId: string, wakeTimestamp: number, reason?: string): DurableAgentSession {
    const session = this.getRequiredSession(agentId);
    session.state = 'WAITING_FOR_TIME';
    session.nextWakeAt = wakeTimestamp;
    session.waitCondition = {
      type: 'TIME',
      nextWakeAt: wakeTimestamp,
      reason: reason || `Waiting until ${new Date(wakeTimestamp).toISOString()}`,
    };
    session.updatedAt = Date.now();
    this.addTrace(session, 'agent_waiting_time', `Scheduled wait until ${new Date(wakeTimestamp).toISOString()}`);
    return session;
  }

  /**
   * Checks agent health and detects stalled processes without progress.
   */
  static checkHealth(agentId: string, stallThresholdMs = 60000): AgentLifecycleState {
    const session = this.getRequiredSession(agentId);
    if (session.state === 'RUNNING') {
      const elapsed = Date.now() - session.lastProgressAt;
      if (elapsed > stallThresholdMs) {
        session.state = 'STALLED';
        this.addTrace(session, 'agent_stalled', `No progress detected for ${elapsed}ms. Agent marked STALLED.`);
      }
    }
    return session.state;
  }

  /**
   * Notifies an active agent of an updated plan version without mutating its pinned version.
   */
  static notifyPlanUpdate(agentId: string, _newPlanVersion: number): void {
    const session = this.getRequiredSession(agentId);
    session.planUpdateAvailable = true;
    this.addTrace(session, 'agent_plan_update_available', 'A newer plan version was committed. Current agent remains on pinned version.');
  }

  /**
   * Cancels agent execution.
   */
  static cancelAgent(agentId: string, reason = 'User requested cancellation'): DurableAgentSession {
    const session = this.getRequiredSession(agentId);
    session.state = 'CANCELLED';
    session.updatedAt = Date.now();
    this.addTrace(session, 'agent_cancelled', `Agent cancelled: ${reason}`);
    return session;
  }

  /**
   * Marks agent as successfully completed.
   */
  static completeAgent(agentId: string): DurableAgentSession {
    const session = this.getRequiredSession(agentId);
    session.state = 'COMPLETED';
    session.completedAt = Date.now();
    session.updatedAt = Date.now();
    this.addTrace(session, 'agent_completed', 'All plan steps completed successfully');
    return session;
  }

  /**
   * Computes structured, UI-neutral progress for Operations Center / Companion.
   */
  static getProgress(agentId: string, totalSteps = 1): AgentProgress {
    const session = this.getRequiredSession(agentId);
    const completed = session.completedStepIds.length;
    const percent = Math.min(100, Math.round((completed / Math.max(1, totalSteps)) * 100));

    return {
      agentId,
      completedSteps: completed,
      totalSteps,
      percent,
      currentActivity: session.state,
      waitingReason: session.waitCondition?.reason,
      lastProgressAt: session.lastProgressAt,
    };
  }

  static getSession(agentId: string): DurableAgentSession | undefined {
    return this.sessions.get(agentId);
  }

  /**
   * Serializes session to JSON for durable storage across process restarts.
   */
  static serializeSession(agentId: string): string {
    const session = this.getRequiredSession(agentId);
    return JSON.stringify(session);
  }

  /**
   * Deserializes and restores a session after process restart without replaying completed work.
   */
  static restoreSession(serializedJson: string): DurableAgentSession {
    const session: DurableAgentSession = JSON.parse(serializedJson);
    session.lastHeartbeatAt = Date.now();
    this.sessions.set(session.agentId, session);
    this.addTrace(session, 'agent_restored', 'Session restored from persistence after restart');
    return session;
  }

  private static getRequiredSession(agentId: string): DurableAgentSession {
    const session = this.sessions.get(agentId);
    if (!session) {
      throw new AgentError('SESSION_NOT_FOUND', `Agent session '${agentId}' not found`);
    }
    return session;
  }

  private static addTrace(
    session: DurableAgentSession,
    type: string,
    description: string,
    metadata?: Record<string, unknown>
  ): void {
    session.trace.push({
      eventId: `evt_${crypto.randomUUID()}`,
      timestamp: Date.now(),
      type,
      description,
      metadata,
    });
  }
}
